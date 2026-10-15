-- Times Tables — Supabase schema PROPOSAL (Phase 0).
-- Not applied anywhere yet. After approval this is split into supabase/migrations/ in Phase 2.
-- Dashboard views/RPCs (fact_stats, daily_trend, quest_stats) come in Phase 4.

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------
-- Reference data: the 82 collectibles (stable IDs, never display names)
-- ------------------------------------------------------------------
create table public.collectibles (
  id       text primary key,                       -- 'cat', 'axolotl', 'fire-fox'
  grp      text not null check (grp in ('animals','rare','water','earth','fire','ice','emerald','ruby','golden','diamond')),
  base     text not null,                          -- 'fox'
  is_rare  boolean not null generated always as (grp = 'rare') stored,
  sort     int  not null unique
);

insert into public.collectibles (id, grp, base, sort)
select b, 'animals', b, ord from unnest(array['cat','dog','bear','bunny','fox','owl','frog','penguin','whale','turtle','elephant','pig','panda'])
  with ordinality as t(b, ord)
union all
select b, 'rare', b, 13 + ord from unnest(array['axolotl','salamander','chameleon','lizard','snake'])
  with ordinality as t(b, ord)
union all
select e.k || '-' || a.b, e.k, a.b, 18 + (e.n - 1) * 8 + a.ord
from (values
  (1,'water',   array['whale','frog','turtle','penguin','axolotl','salamander','snake','dog']),
  (2,'earth',   array['bunny','elephant','pig','bear','dog','lizard','fox','panda']),
  (3,'fire',    array['fox','dog','cat','bear','owl','lizard','snake','pig']),
  (4,'ice',     array['penguin','bunny','bear','owl','whale','fox','cat','elephant']),
  (5,'emerald', array['frog','turtle','salamander','cat','panda','chameleon','snake','owl']),
  (6,'ruby',    array['axolotl','fox','pig','bunny','dog','chameleon','lizard','bear']),
  (7,'golden',  array['bear','elephant','penguin','cat','owl','dog','panda','snake']),
  (8,'diamond', array['panda','owl','elephant','whale','fox','axolotl','bunny','chameleon'])
) as e(n, k, animals)
cross join lateral unnest(e.animals) with ordinality as a(b, ord);
-- expect 82 rows

-- ------------------------------------------------------------------
-- Parents and children
-- ------------------------------------------------------------------
create table public.parent_settings (
  parent_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  time_zone   text not null default 'UTC',          -- IANA name; set from the browser at sign-up
  fluency_ms  int  not null default 3000 check (fluency_ms between 500 and 30000),
  created_at  timestamptz not null default now()
);

create table public.children (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 30),
  avatar      text not null references public.collectibles(id)
              check (avatar in ('cat','dog','bear','bunny','fox','owl','frog','penguin','whale','turtle','elephant','pig','panda')),
  has_pin     boolean not null default false,       -- maintained by set_child_pin()
  created_at  timestamptz not null default now()
);
create index on public.children (parent_id);

-- PIN hashes live apart from children so no policy ever exposes them to the browser.
create table public.child_pins (
  child_id      uuid primary key references public.children(id) on delete cascade,
  pin_hash      text not null,                      -- bcrypt
  failed_count  int  not null default 0,
  locked_until  timestamptz
);

-- ------------------------------------------------------------------
-- Game data (all rows written through the client write queue)
-- ------------------------------------------------------------------
create table public.game_state (
  child_id     uuid primary key references public.children(id) on delete cascade,
  review_pile  jsonb not null default '{}'::jsonb,  -- {"7x8": 2, ...}
  updated_at   timestamptz not null default now()
);

create table public.quest_runs (
  id          uuid primary key,                     -- client-generated
  child_id    uuid not null references public.children(id) on delete cascade,
  quest_id    text not null check (quest_id in ('mystery','pick','water','earth','fire','ice','emerald','ruby','golden','diamond')),
  length      int  not null check (length between 1 and 25),
  reached     int  not null default 0 check (reached >= 0 and reached <= length),
  result      text not null default 'quit' check (result in ('won','failed','quit')),
  reward_id   text references public.collectibles(id),
  started_at  timestamptz not null,
  ended_at    timestamptz
);
create index on public.quest_runs (child_id, started_at);

create table public.attempts (
  id            uuid primary key,                   -- client-generated, dedupes queue retries
  child_id      uuid not null references public.children(id) on delete cascade,
  a             smallint not null check (a between 2 and 12),
  b             smallint not null check (b between 2 and 12),
  given_answer  int not null check (given_answer between 0 and 999),
  correct       boolean not null,
  response_ms   int not null check (response_ms between 0 and 60000),
  mode          text not null check (mode in ('practice','quest')),
  quest_run_id  uuid references public.quest_runs(id) on delete cascade,
  was_review    boolean not null default false,
  created_at    timestamptz not null,
  check ((mode = 'quest') = (quest_run_id is not null))
);
create index on public.attempts (child_id, a, b, created_at desc);
create index on public.attempts (child_id, created_at);

create table public.catches (
  id              uuid primary key,                 -- client-generated
  child_id        uuid not null references public.children(id) on delete cascade,
  collectible_id  text not null references public.collectibles(id),
  source          text not null check (source in ('practice','quest','pick','mystery')),
  quest_run_id    uuid references public.quest_runs(id) on delete set null,
  created_at      timestamptz not null
);
create index on public.catches (child_id, created_at);

create view public.backpack with (security_invoker = true) as
  select child_id, collectible_id, count(*)::int as n
  from public.catches group by child_id, collectible_id;

-- ------------------------------------------------------------------
-- Server-side rules for catches
--  * source must match the kind of collectible
--  * Mystery Box: max one mystery catch per child per family-local day
--  * Pick-a-Pet:  max one rare pick per child per family-local day
-- ------------------------------------------------------------------
create or replace function public.enforce_catch_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz   text;
  grp  text;
  d    date;
begin
  -- a queue retry of a row we already have: skip quietly (ON CONFLICT runs after BEFORE triggers)
  if exists (select 1 from catches where id = new.id) then return null; end if;

  perform pg_advisory_xact_lock(hashtext(new.child_id::text));   -- serialize per child

  select coalesce(ps.time_zone, 'UTC') into tz
  from children c left join parent_settings ps on ps.parent_id = c.parent_id
  where c.id = new.child_id;

  select c.grp into grp from collectibles c where c.id = new.collectible_id;

  if (new.source in ('practice','pick') and grp not in ('animals','rare'))
     or (new.source in ('quest','mystery') and grp in ('animals','rare')) then
    raise exception 'catch_source_mismatch' using errcode = 'P0001';
  end if;

  if new.created_at > now() + interval '5 minutes' then new.created_at := now(); end if;
  d := (new.created_at at time zone tz)::date;

  if new.source = 'mystery' and exists (
      select 1 from catches x
      where x.child_id = new.child_id and x.source = 'mystery'
        and (x.created_at at time zone tz)::date = d) then
    raise exception 'mystery_already_opened_today' using errcode = 'P0001';
  end if;

  if new.source = 'pick' and grp = 'rare' and exists (
      select 1 from catches x join collectibles c on c.id = x.collectible_id
      where x.child_id = new.child_id and x.source = 'pick' and c.grp = 'rare'
        and (x.created_at at time zone tz)::date = d) then
    raise exception 'rare_pick_already_used_today' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger catches_rules before insert on public.catches
  for each row execute function public.enforce_catch_rules();

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
create or replace function public.is_my_child(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from children where id = cid and parent_id = auth.uid());
$$;

alter table public.collectibles    enable row level security;
alter table public.parent_settings enable row level security;
alter table public.children        enable row level security;
alter table public.child_pins      enable row level security;
alter table public.game_state      enable row level security;
alter table public.quest_runs      enable row level security;
alter table public.attempts        enable row level security;
alter table public.catches         enable row level security;

create policy "read collectibles" on public.collectibles for select to authenticated using (true);

create policy "own settings" on public.parent_settings for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "own children" on public.children for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- child_pins: RLS on, NO policies → unreachable except via the security-definer RPCs below.
revoke all on public.child_pins from anon, authenticated;

create policy "own game_state" on public.game_state for all to authenticated
  using (is_my_child(child_id)) with check (is_my_child(child_id));

create policy "own quest_runs" on public.quest_runs for all to authenticated
  using (is_my_child(child_id)) with check (is_my_child(child_id));

-- attempts and catches are an append-only log: select + insert only (deletes happen by cascade)
create policy "read own attempts"   on public.attempts for select to authenticated using (is_my_child(child_id));
create policy "insert own attempts" on public.attempts for insert to authenticated with check (is_my_child(child_id));
create policy "read own catches"    on public.catches  for select to authenticated using (is_my_child(child_id));
create policy "insert own catches"  on public.catches  for insert to authenticated with check (is_my_child(child_id));

revoke all on public.collectibles, public.parent_settings, public.children, public.game_state,
              public.quest_runs, public.attempts, public.catches, public.backpack from anon;

-- ------------------------------------------------------------------
-- PIN RPCs (the hash never leaves the database)
-- ------------------------------------------------------------------
create or replace function public.set_child_pin(p_child uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_my_child(p_child) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_pin is null then
    delete from child_pins where child_id = p_child;
    update children set has_pin = false where id = p_child;
    return;
  end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'pin_must_be_4_digits' using errcode = '22023'; end if;
  insert into child_pins (child_id, pin_hash) values (p_child, crypt(p_pin, gen_salt('bf', 8)))
    on conflict (child_id) do update set pin_hash = excluded.pin_hash, failed_count = 0, locked_until = null;
  update children set has_pin = true where id = p_child;
end $$;

create or replace function public.verify_child_pin(p_child uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare r child_pins;
begin
  if not is_my_child(p_child) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from child_pins where child_id = p_child for update;
  if not found then return true; end if;                       -- no PIN set
  if r.locked_until is not null and r.locked_until > now() then
    raise exception 'pin_locked' using errcode = 'P0001';
  end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update child_pins set failed_count = 0, locked_until = null where child_id = p_child;
    return true;
  end if;
  update child_pins
    set failed_count = case when r.failed_count + 1 >= 5 then 0 else r.failed_count + 1 end,
        locked_until = case when r.failed_count + 1 >= 5 then now() + interval '1 minute' else null end
    where child_id = p_child;
  return false;
end $$;

revoke all on function public.set_child_pin(uuid, text), public.verify_child_pin(uuid, text) from public, anon;
grant execute on function public.set_child_pin(uuid, text), public.verify_child_pin(uuid, text) to authenticated;
