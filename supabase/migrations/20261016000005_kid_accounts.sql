-- Times Tables: kid accounts and family codes (replaces child PINs).
--
-- A kid signs in with a username + password on any device. Under the hood each device
-- uses an anonymous Supabase session; kid_sign_in() checks the password and links that
-- session to the child, and row level security then lets the session read and write that
-- one child's game data, nothing else. Kid accounts are created with a family code, so
-- every account belongs to a parent and shows on their dashboard.
--
-- Supabase setting needed: Authentication → Sign In / Providers → "Allow anonymous sign-ins".

-- ------------------------------------------------------------------
-- Family codes
-- ------------------------------------------------------------------
create function public.gen_family_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ';   -- no I, L, O
  digits  constant text := '23456789';                  -- no 0, 1
  c text;
begin
  loop
    c := '';
    for i in 1..4 loop c := c || substr(letters, 1 + floor(random() * length(letters))::int, 1); end loop;
    c := c || '-';
    for i in 1..4 loop c := c || substr(digits, 1 + floor(random() * length(digits))::int, 1); end loop;
    exit when not exists (select 1 from public.parent_settings where family_code = c);
  end loop;
  return c;
end $$;

/** "rand 4821", "RAND-4821", "rand4821" all mean RAND-4821. */
create function public.norm_family_code(p text) returns text
language sql immutable as $$
  select case when length(x) = 8 then substr(x, 1, 4) || '-' || substr(x, 5) else x end
  from (select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) as x) s;
$$;

alter table public.parent_settings add column family_code text unique;
update public.parent_settings set family_code = public.gen_family_code() where family_code is null;
alter table public.parent_settings alter column family_code set default public.gen_family_code();
alter table public.parent_settings alter column family_code set not null;

-- Only real (email) accounts are parents. Anonymous sessions never get a settings row.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz text := coalesce(new.raw_user_meta_data ->> 'time_zone', 'UTC');
begin
  if coalesce(new.is_anonymous, false) then return new; end if;
  if not public.valid_time_zone(tz) then tz := 'UTC'; end if;
  insert into public.parent_settings (parent_id, time_zone) values (new.id, tz)
    on conflict (parent_id) do nothing;
  return new;
end $$;

-- Settings rows are only ever created by that trigger.
-- Parents may change their time zone and fluency threshold; the family code only via new_family_code().
-- (A column-level revoke can't override a table-level grant, so revoke the table and grant columns.)
revoke insert, update on public.parent_settings from authenticated;
grant update (time_zone, fluency_ms) on public.parent_settings to authenticated;

create function public.is_parent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_settings where parent_id = auth.uid());
$$;

-- ------------------------------------------------------------------
-- Kid logins and the device sessions linked to them
-- ------------------------------------------------------------------
create table public.kid_logins (
  child_id      uuid primary key references public.children(id) on delete cascade,
  username      text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  pass_hash     text not null,                    -- bcrypt
  failed_count  int  not null default 0,
  locked_until  timestamptz,
  created_at    timestamptz not null default now()
);

create table public.kid_sessions (
  user_id     uuid primary key references auth.users(id) on delete cascade,   -- the device's anonymous session
  child_id    uuid not null references public.children(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index kid_sessions_child_idx on public.kid_sessions (child_id);

-- Every sign-up / sign-in try, to slow down guessing.
create table public.auth_attempts (
  user_id  uuid not null,
  kind     text not null check (kind in ('sign_up', 'sign_in')),
  at       timestamptz not null default now()
);
create index auth_attempts_idx on public.auth_attempts (user_id, kind, at);

alter table public.kid_logins    enable row level security;
alter table public.kid_sessions  enable row level security;
alter table public.auth_attempts enable row level security;
-- No policies and no privileges: only the security-definer functions below touch these.
revoke all on public.kid_logins, public.kid_sessions, public.auth_attempts from anon, authenticated;

-- A child is "mine" for their parent, and for a device signed in as that child.
create or replace function public.is_my_child(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.children where id = cid and parent_id = auth.uid())
      or exists (select 1 from public.kid_sessions where user_id = auth.uid() and child_id = cid);
$$;

-- Children: parents manage their own; a kid's device can only read its own child.
drop policy "own children" on public.children;
create policy "parents manage own children" on public.children for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid() and public.is_parent());
-- (kid_sessions is closed to the browser, so policies reach it through a security-definer helper)
create function public.my_kid_child() returns uuid
language sql stable security definer set search_path = public as $$
  select child_id from public.kid_sessions where user_id = auth.uid();
$$;
create policy "kid reads own child" on public.children for select to authenticated
  using (id = public.my_kid_child());

create function public.too_many_attempts(p_kind text, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into public.auth_attempts (user_id, kind) values (coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'), p_kind);
  return (select count(*) from public.auth_attempts
          where user_id = coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')
            and kind = p_kind and at > now() - interval '10 minutes') > p_max;
end $$;

-- ------------------------------------------------------------------
-- Kid sign-up (needs a family code), sign-in, sign-out, "who am I"
-- ------------------------------------------------------------------
-- Sign-up and sign-in RETURN errors instead of raising them: a raised error would roll back
-- the attempt counter and the lockout, and guessing would never be slowed down.
-- Result: {"child_id": "..."} or {"error": "bad_family_code" | "username_taken" | ...}
create function public.kid_sign_up(p_code text, p_username text, p_password text, p_avatar text default 'fox')
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  fam uuid;
  u text := lower(btrim(coalesce(p_username, '')));
  cid uuid;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if public.is_parent() then return jsonb_build_object('error', 'parents_cannot_be_kids'); end if;
  if public.too_many_attempts('sign_up', 10) then return jsonb_build_object('error', 'too_many_tries'); end if;
  select parent_id into fam from public.parent_settings where family_code = public.norm_family_code(p_code);
  if fam is null then return jsonb_build_object('error', 'bad_family_code'); end if;
  if u !~ '^[a-z0-9_]{3,20}$' then return jsonb_build_object('error', 'bad_username'); end if;
  if length(coalesce(p_password, '')) < 4 then return jsonb_build_object('error', 'password_too_short'); end if;
  if exists (select 1 from public.kid_logins where username = u) then return jsonb_build_object('error', 'username_taken'); end if;
  if p_avatar is null or p_avatar not in ('cat','dog','bear','bunny','fox','owl','frog','penguin','whale','turtle','elephant','pig','panda') then
    p_avatar := 'fox';
  end if;

  insert into public.children (parent_id, name, avatar) values (fam, u, p_avatar) returning id into cid;
  insert into public.kid_logins (child_id, username, pass_hash) values (cid, u, crypt(p_password, gen_salt('bf', 8)));
  insert into public.kid_sessions (user_id, child_id) values (auth.uid(), cid)
    on conflict (user_id) do update set child_id = excluded.child_id, created_at = now();
  return jsonb_build_object('child_id', cid);
end $$;

create function public.kid_sign_in(p_username text, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r public.kid_logins;
  u text := lower(btrim(coalesce(p_username, '')));
begin
  if auth.uid() is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if public.is_parent() then return jsonb_build_object('error', 'parents_cannot_be_kids'); end if;
  if public.too_many_attempts('sign_in', 20) then return jsonb_build_object('error', 'too_many_tries'); end if;
  select * into r from public.kid_logins where username = u for update;
  if not found then return jsonb_build_object('error', 'wrong_username_or_password'); end if;
  if r.locked_until is not null and r.locked_until > now() then return jsonb_build_object('error', 'locked'); end if;
  if r.pass_hash <> crypt(coalesce(p_password, ''), r.pass_hash) then
    update public.kid_logins
      set failed_count = case when r.failed_count + 1 >= 5 then 0 else r.failed_count + 1 end,
          locked_until = case when r.failed_count + 1 >= 5 then now() + interval '1 minute' else null end
      where child_id = r.child_id;
    return jsonb_build_object('error', 'wrong_username_or_password');
  end if;
  update public.kid_logins set failed_count = 0, locked_until = null where child_id = r.child_id;
  insert into public.kid_sessions (user_id, child_id) values (auth.uid(), r.child_id)
    on conflict (user_id) do update set child_id = excluded.child_id, created_at = now();
  return jsonb_build_object('child_id', r.child_id);
end $$;

create function public.kid_sign_out() returns void
language sql security definer set search_path = public as $$
  delete from public.kid_sessions where user_id = auth.uid();
$$;

create function public.kid_me()
returns table (child_id uuid, name text, avatar text, username text, time_zone text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.avatar, l.username, coalesce(ps.time_zone, 'UTC')
  from public.kid_sessions s
  join public.children c on c.id = s.child_id
  left join public.kid_logins l on l.child_id = c.id
  left join public.parent_settings ps on ps.parent_id = c.parent_id
  where s.user_id = auth.uid();
$$;

-- ------------------------------------------------------------------
-- Parent side: give a child a sign-in, see usernames, new family code
-- ------------------------------------------------------------------
-- p_password null keeps the current password (for a username change).
create function public.set_kid_login(p_child uuid, p_username text, p_password text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u text := lower(btrim(coalesce(p_username, '')));
begin
  if not exists (select 1 from public.children where id = p_child and parent_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if u !~ '^[a-z0-9_]{3,20}$' then raise exception 'bad_username' using errcode = '22023'; end if;
  if exists (select 1 from public.kid_logins where username = u and child_id <> p_child) then
    raise exception 'username_taken' using errcode = 'P0001';
  end if;
  if p_password is not null and length(p_password) < 4 then raise exception 'password_too_short' using errcode = '22023'; end if;
  if exists (select 1 from public.kid_logins where child_id = p_child) then
    update public.kid_logins
      set username = u,
          pass_hash = case when p_password is null then pass_hash else crypt(p_password, gen_salt('bf', 8)) end,
          failed_count = 0, locked_until = null
      where child_id = p_child;
  else
    if p_password is null then raise exception 'password_too_short' using errcode = '22023'; end if;
    insert into public.kid_logins (child_id, username, pass_hash) values (p_child, u, crypt(p_password, gen_salt('bf', 8)));
  end if;
end $$;

create function public.my_kid_logins() returns table (child_id uuid, username text, devices int)
language sql stable security definer set search_path = public as $$
  select l.child_id, l.username, (select count(*)::int from public.kid_sessions s where s.child_id = l.child_id)
  from public.kid_logins l join public.children c on c.id = l.child_id
  where c.parent_id = auth.uid();
$$;

-- Signs every device out of one of my kids' accounts (lost device, shared password…).
create function public.sign_out_kid_devices(p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.children where id = p_child and parent_id = auth.uid()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  delete from public.kid_sessions where child_id = p_child;
end $$;

create function public.new_family_code() returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_parent() then raise exception 'not_found' using errcode = 'P0002'; end if;
  c := public.gen_family_code();
  update public.parent_settings set family_code = c where parent_id = auth.uid();
  return c;
end $$;

-- ------------------------------------------------------------------
-- Progress carried over from playing on a device without an account
-- ------------------------------------------------------------------
alter table public.catches drop constraint catches_source_check;
alter table public.catches add constraint catches_source_check check (source in ('practice','quest','pick','mystery','import'));

create or replace function public.enforce_catch_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz   text;
  g    text;
  d    date;
begin
  if exists (select 1 from public.catches where id = new.id) then return null; end if;
  if new.source = 'import' then return new; end if;      -- carried over once, at sign-up: no daily rules

  perform pg_advisory_xact_lock(hashtext(new.child_id::text));

  select coalesce(ps.time_zone, 'UTC') into tz
  from public.children c left join public.parent_settings ps on ps.parent_id = c.parent_id
  where c.id = new.child_id;
  tz := coalesce(tz, 'UTC');

  select c.grp into g from public.collectibles c where c.id = new.collectible_id;

  if (new.source in ('practice','pick') and g not in ('animals','rare'))
     or (new.source in ('quest','mystery') and g in ('animals','rare')) then
    raise exception 'catch_source_mismatch' using errcode = 'P0001';
  end if;

  if new.created_at > now() + interval '5 minutes' then new.created_at := now(); end if;
  d := (new.created_at at time zone tz)::date;

  if new.source = 'mystery' and exists (
      select 1 from public.catches x
      where x.child_id = new.child_id and x.source = 'mystery'
        and (x.created_at at time zone tz)::date = d) then
    raise exception 'mystery_already_opened_today' using errcode = 'P0001';
  end if;

  if new.source = 'pick' and g = 'rare' and exists (
      select 1 from public.catches x join public.collectibles c on c.id = x.collectible_id
      where x.child_id = new.child_id and x.source = 'pick' and c.grp = 'rare'
        and (x.created_at at time zone tz)::date = d) then
    raise exception 'rare_pick_already_used_today' using errcode = 'P0001';
  end if;

  return new;
end $$;

-- ------------------------------------------------------------------
-- PINs are gone: kids sign in with their own password now
-- ------------------------------------------------------------------
drop function public.set_child_pin(uuid, text);
drop function public.verify_child_pin(uuid, text);
drop table public.child_pins;
alter table public.children drop column has_pin;

-- ------------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------------
revoke all on function public.kid_sign_up(text, text, text, text), public.kid_sign_in(text, text), public.kid_sign_out(),
  public.kid_me(), public.set_kid_login(uuid, text, text), public.my_kid_logins(), public.sign_out_kid_devices(uuid),
  public.new_family_code(), public.too_many_attempts(text, int), public.gen_family_code() from public, anon;
grant execute on function public.kid_sign_up(text, text, text, text), public.kid_sign_in(text, text), public.kid_sign_out(),
  public.kid_me(), public.set_kid_login(uuid, text, text), public.my_kid_logins(), public.sign_out_kid_devices(uuid),
  public.new_family_code() to authenticated;
