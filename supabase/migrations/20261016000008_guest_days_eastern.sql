-- Times Tables: count the days for kids without an account in US Eastern time
-- (America/New_York: EST in winter, EDT in summer), instead of UTC.
-- Rows already stored keep the UTC date they were filed under.

create or replace function public.guest_tick(p_new_guest boolean, p_answers int) returns void
language plpgsql security definer set search_path = public as $$
declare
  g int := case when coalesce(p_new_guest, false) then 1 else 0 end;
  n int := least(greatest(coalesce(p_answers, 0), 0), 50);
begin
  if g = 0 and n = 0 then return; end if;
  insert into public.guest_counts (day, new_guests, answers) values ((now() at time zone 'America/New_York')::date, g, n)
    on conflict (day) do update
      set new_guests = public.guest_counts.new_guests + excluded.new_guests,
          answers    = public.guest_counts.answers + excluded.answers;
end $$;

create or replace function public.site_totals()
returns table (
  grownups          int,
  kids              int,
  kid_accounts      int,
  guests            bigint,
  questions         bigint,
  guest_questions   bigint,
  questions_today   bigint,   -- kids with accounts: admin's time zone; without: US Eastern day
  questions_7d      bigint,
  active_kids_7d    int
)
language sql stable security definer set search_path = public as $$
  with tz as (
    select coalesce((select time_zone from public.parent_settings where parent_id = auth.uid()), 'UTC') as z,
           (now() at time zone 'America/New_York')::date as eastern_today
  )
  select
    (select count(*) from public.parent_settings)::int,
    (select count(*) from public.children)::int,
    (select count(*) from public.kid_logins)::int,
    (select coalesce(sum(new_guests), 0) from public.guest_counts)::bigint,
    (select count(*) from public.attempts),
    (select coalesce(sum(answers), 0) from public.guest_counts)::bigint,
    (select count(*) from public.attempts, tz
       where (created_at at time zone tz.z)::date = (now() at time zone tz.z)::date)
      + (select coalesce(sum(answers), 0) from public.guest_counts, tz where day = tz.eastern_today),
    (select count(*) from public.attempts where created_at >= now() - interval '7 days')
      + (select coalesce(sum(answers), 0) from public.guest_counts, tz where day > tz.eastern_today - 7),
    (select count(distinct child_id) from public.attempts where created_at >= now() - interval '7 days')::int
  where public.is_site_admin();
$$;

revoke all on function public.site_totals(), public.guest_tick(boolean, int) from public, anon;
grant execute on function public.site_totals() to authenticated;
grant execute on function public.guest_tick(boolean, int) to anon, authenticated;
