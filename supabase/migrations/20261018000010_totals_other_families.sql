-- Times Tables: site totals also count answers from other families' kids
-- (every family except the admin's own), to show how much other people use the site.
-- The return type changes, so the function is dropped and recreated.

drop function public.site_totals();

create function public.site_totals()
returns table (
  grownups          int,
  kids              int,
  kid_accounts      int,
  guests            bigint,
  questions         bigint,   -- answers by kids on any family
  questions_others  bigint,   -- of those, answers by kids on families other than the admin's
  guest_questions   bigint,   -- answers without an account
  questions_today   bigint,   -- accounts: admin's time zone; without an account: US Eastern day
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
    (select count(*) from public.attempts t join public.children c on c.id = t.child_id where c.parent_id <> auth.uid()),
    (select coalesce(sum(answers), 0) from public.guest_counts)::bigint,
    (select count(*) from public.attempts, tz
       where (created_at at time zone tz.z)::date = (now() at time zone tz.z)::date)
      + (select coalesce(sum(answers), 0) from public.guest_counts, tz where day = tz.eastern_today),
    (select count(*) from public.attempts where created_at >= now() - interval '7 days')
      + (select coalesce(sum(answers), 0) from public.guest_counts, tz where day > tz.eastern_today - 7),
    (select count(distinct child_id) from public.attempts where created_at >= now() - interval '7 days')::int
  where public.is_site_admin();
$$;

revoke all on function public.site_totals() from public, anon;
grant execute on function public.site_totals() to authenticated;
