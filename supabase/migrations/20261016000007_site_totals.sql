-- Times Tables: site-wide totals, for the site owner only.
--
-- Kids playing without an account are counted too, but only as daily totals: a browser
-- reports "a new browser started playing" once and "N more problems answered" now and then.
-- No ID, name, answer or anything else about the kid reaches the server.
--
-- After running this, make your own grown-up account the admin (once, in the SQL editor):
--   insert into public.site_admins (user_id)
--   select id from auth.users where email = 'you@example.com';

create table public.site_admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.site_admins enable row level security;
revoke all on public.site_admins from anon, authenticated;

create function public.is_site_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_admins where user_id = auth.uid());
$$;

-- Daily totals for kids playing without an account. Nothing per kid, ever.
create table public.guest_counts (
  day         date primary key,      -- UTC
  new_guests  int not null default 0,
  answers     bigint not null default 0
);
alter table public.guest_counts enable row level security;
revoke all on public.guest_counts from anon, authenticated;

-- Called by browsers playing without an account. Open to everyone (they're signed out),
-- so each call is capped: at most one new browser and 50 answers.
create function public.guest_tick(p_new_guest boolean, p_answers int) returns void
language plpgsql security definer set search_path = public as $$
declare
  g int := case when coalesce(p_new_guest, false) then 1 else 0 end;
  n int := least(greatest(coalesce(p_answers, 0), 0), 50);
begin
  if g = 0 and n = 0 then return; end if;
  insert into public.guest_counts (day, new_guests, answers) values ((now() at time zone 'UTC')::date, g, n)
    on conflict (day) do update
      set new_guests = public.guest_counts.new_guests + excluded.new_guests,
          answers    = public.guest_counts.answers + excluded.answers;
end $$;

-- One row of totals for an admin; no rows for anyone else.
create function public.site_totals()
returns table (
  grownups          int,      -- grown-up (email) accounts
  kids              int,      -- kids on any family, with or without a sign-in
  kid_accounts      int,      -- kids who can sign in with a username
  guests            bigint,   -- browsers that have played without an account
  questions         bigint,   -- answers by kids on a family, all time
  guest_questions   bigint,   -- answers without an account, all time
  questions_today   bigint,   -- all answers today (accounts: admin's time zone; without: UTC day)
  questions_7d      bigint,   -- all answers in the last 7 days
  active_kids_7d    int       -- kids on a family who answered anything in the last 7 days
)
language sql stable security definer set search_path = public as $$
  with tz as (
    select coalesce((select time_zone from public.parent_settings where parent_id = auth.uid()), 'UTC') as z
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
      + (select coalesce(sum(answers), 0) from public.guest_counts where day = (now() at time zone 'UTC')::date),
    (select count(*) from public.attempts where created_at >= now() - interval '7 days')
      + (select coalesce(sum(answers), 0) from public.guest_counts where day > (now() at time zone 'UTC')::date - 7),
    (select count(distinct child_id) from public.attempts where created_at >= now() - interval '7 days')::int
  where public.is_site_admin();
$$;

revoke all on function public.is_site_admin(), public.site_totals(), public.guest_tick(boolean, int) from public, anon;
grant execute on function public.site_totals() to authenticated;
grant execute on function public.guest_tick(boolean, int) to anon, authenticated;
