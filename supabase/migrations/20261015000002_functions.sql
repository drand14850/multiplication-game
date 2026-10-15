-- Times Tables: server-side rules and RPCs.

-- ------------------------------------------------------------------
-- New parent → settings row, time zone taken from sign-up metadata
-- ------------------------------------------------------------------
create function public.valid_time_zone(tz text) returns boolean
language sql stable set search_path = pg_catalog as $$
  select exists (select 1 from pg_timezone_names where name = tz);
$$;

create function public.check_parent_settings() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.valid_time_zone(new.time_zone) then
    raise exception 'invalid_time_zone' using errcode = '22023';
  end if;
  return new;
end $$;

create trigger parent_settings_check before insert or update on public.parent_settings
  for each row execute function public.check_parent_settings();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz text := coalesce(new.raw_user_meta_data ->> 'time_zone', 'UTC');
begin
  if not public.valid_time_zone(tz) then tz := 'UTC'; end if;
  insert into public.parent_settings (parent_id, time_zone) values (new.id, tz)
    on conflict (parent_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------
-- Catches: source must fit the collectible, and the once-a-day rules
--  * Mystery Box: max one mystery catch per child per family-local day
--  * Pick-a-Pet:  max one rare pick per child per family-local day
-- ------------------------------------------------------------------
create function public.enforce_catch_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tz   text;
  g    text;
  d    date;
begin
  -- A queue retry of a row we already have: skip quietly (ON CONFLICT runs after BEFORE triggers).
  if exists (select 1 from public.catches where id = new.id) then return null; end if;

  perform pg_advisory_xact_lock(hashtext(new.child_id::text));   -- one catch at a time per child

  select coalesce(ps.time_zone, 'UTC') into tz
  from public.children c left join public.parent_settings ps on ps.parent_id = c.parent_id
  where c.id = new.child_id;
  tz := coalesce(tz, 'UTC');

  select c.grp into g from public.collectibles c where c.id = new.collectible_id;

  if (new.source in ('practice','pick') and g not in ('animals','rare'))
     or (new.source in ('quest','mystery') and g in ('animals','rare')) then
    raise exception 'catch_source_mismatch' using errcode = 'P0001';
  end if;

  -- client clocks can be wrong; never accept a catch from the future
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

create trigger catches_rules before insert on public.catches
  for each row execute function public.enforce_catch_rules();

-- ------------------------------------------------------------------
-- Child PINs. The hash never leaves the database.
-- ------------------------------------------------------------------
create function public.set_child_pin(p_child uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_my_child(p_child) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_pin is null then
    delete from public.child_pins where child_id = p_child;
    update public.children set has_pin = false where id = p_child;
    return;
  end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'pin_must_be_4_digits' using errcode = '22023'; end if;
  insert into public.child_pins (child_id, pin_hash) values (p_child, crypt(p_pin, gen_salt('bf', 8)))
    on conflict (child_id) do update set pin_hash = excluded.pin_hash, failed_count = 0, locked_until = null;
  update public.children set has_pin = true where id = p_child;
end $$;

-- true = right PIN (or no PIN set). 5 wrong tries lock it for a minute (raises pin_locked).
create function public.verify_child_pin(p_child uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare r public.child_pins;
begin
  if not public.is_my_child(p_child) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select * into r from public.child_pins where child_id = p_child for update;
  if not found then return true; end if;
  if r.locked_until is not null and r.locked_until > now() then
    raise exception 'pin_locked' using errcode = 'P0001';
  end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.child_pins set failed_count = 0, locked_until = null where child_id = p_child;
    return true;
  end if;
  update public.child_pins
    set failed_count = case when r.failed_count + 1 >= 5 then 0 else r.failed_count + 1 end,
        locked_until = case when r.failed_count + 1 >= 5 then now() + interval '1 minute' else null end
    where child_id = p_child;
  return false;
end $$;

revoke all on function public.set_child_pin(uuid, text), public.verify_child_pin(uuid, text) from public, anon;
grant execute on function public.set_child_pin(uuid, text), public.verify_child_pin(uuid, text) to authenticated;
-- has_pin is maintained only by set_child_pin: parents may update a child's name and avatar only.
-- (A column-level revoke can't override a table-level grant, so revoke the table and grant columns.)
revoke update on public.children from authenticated;
grant update (name, avatar) on public.children to authenticated;
