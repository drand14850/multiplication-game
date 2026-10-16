-- Times Tables: parent dashboard queries. The aggregation happens here so the browser never
-- downloads the whole answer log. All functions are SECURITY INVOKER (the default), so the
-- caller's row level security applies: a parent only ever sees their own children.

-- ------------------------------------------------------------------
-- Per-fact numbers over each fact's last 5 attempts.
-- p_merge = true folds 7×8 and 8×7 into one fact (reported as the smaller factor first).
-- ------------------------------------------------------------------
create function public.fact_stats(p_child uuid, p_merge boolean default false)
returns table (
  a int, b int,
  total int,               -- all attempts ever at this fact
  recent int,              -- attempts counted (the last 5, or fewer)
  recent_correct int,
  median_correct_ms int,   -- median time of the right answers among the last 5
  median_all_ms int,       -- median time of all of the last 5
  last_seen timestamptz
)
language sql stable set search_path = public as $$
  with base as (
    select case when p_merge then least(t.a, t.b) else t.a end as fa,
           case when p_merge then greatest(t.a, t.b) else t.b end as fb,
           t.correct, t.response_ms, t.created_at, t.id
    from attempts t
    where t.child_id = p_child
  ), ranked as (
    select base.*,
           row_number() over (partition by fa, fb order by created_at desc, id) as rn,
           count(*)     over (partition by fa, fb) as n_all
    from base
  )
  select fa, fb,
         max(n_all)::int,
         count(*)::int,
         (count(*) filter (where correct))::int,
         (percentile_cont(0.5) within group (order by response_ms) filter (where correct))::int,
         (percentile_cont(0.5) within group (order by response_ms))::int,
         max(created_at)
  from ranked
  where rn <= 5
  group by fa, fb
  order by fa, fb;
$$;

-- ------------------------------------------------------------------
-- One row per day for the last p_days days, in the family's time zone.
-- A session is a run of answers with no gap over 10 minutes; its minutes count on the
-- day it started, and run from just before its first answer (that answer's response
-- time) to its last answer.
-- ------------------------------------------------------------------
create function public.daily_trend(p_child uuid, p_days int default 30)
returns table (
  day date,
  problems int,
  correct int,
  median_ms int,
  sessions int,
  minutes numeric
)
language sql stable set search_path = public as $$
  with tz as (
    select coalesce((select ps.time_zone from children c join parent_settings ps on ps.parent_id = c.parent_id
                     where c.id = p_child), 'UTC') as z
  ), raw as (
    select t.created_at, t.correct, t.response_ms, t.id,
           (t.created_at at time zone tz.z)::date as d,
           lag(t.created_at) over (order by t.created_at, t.id) as prev
    from attempts t cross join tz
    where t.child_id = p_child
      and t.created_at >= now() - make_interval(days => p_days + 1)
  ), marked as (
    select raw.*, sum(case when prev is null or created_at - prev > interval '10 minutes' then 1 else 0 end)
                    over (order by created_at, id) as sid
    from raw
  ), sess as (
    select sid,
           min(created_at) as st,
           extract(epoch from max(created_at) - min(created_at)) * 1000
             + (array_agg(response_ms order by created_at, id))[1] as ms
    from marked group by sid
  ), per_day as (
    select m.d, count(*)::int as problems, (count(*) filter (where m.correct))::int as correct,
           (percentile_cont(0.5) within group (order by m.response_ms))::int as median_ms
    from marked m group by m.d
  ), per_day_sess as (
    select (s.st at time zone tz.z)::date as d, count(*)::int as sessions,
           round((sum(s.ms) / 60000.0)::numeric, 1) as minutes
    from sess s cross join tz group by 1
  ), days as (
    select (g)::date as d
    from tz, generate_series((now() at time zone tz.z)::date - (p_days - 1), (now() at time zone tz.z)::date, interval '1 day') as g
  )
  select days.d, coalesce(p.problems, 0), coalesce(p.correct, 0), p.median_ms,
         coalesce(q.sessions, 0), coalesce(q.minutes, 0)
  from days
  left join per_day p on p.d = days.d
  left join per_day_sess q on q.d = days.d
  order by days.d;
$$;

-- ------------------------------------------------------------------
-- Attempts, wins and the farthest reached, per quest.
-- ------------------------------------------------------------------
create function public.quest_stats(p_child uuid)
returns table (quest_id text, runs int, wins int, best int)
language sql stable set search_path = public as $$
  select q.quest_id, count(*)::int, (count(*) filter (where q.result = 'won'))::int, max(q.reached)::int
  from quest_runs q
  where q.child_id = p_child
  group by q.quest_id;
$$;

-- ------------------------------------------------------------------
-- The longest run of right answers in a row, ever (practice and quests together).
-- ------------------------------------------------------------------
create function public.longest_streak(p_child uuid)
returns int
language sql stable set search_path = public as $$
  select coalesce(max(n), 0)::int from (
    select count(*) as n
    from (
      select t.correct,
             sum(case when t.correct then 0 else 1 end) over (order by t.created_at, t.id) as grp
      from attempts t
      where t.child_id = p_child
    ) x
    where x.correct
    group by x.grp
  ) y;
$$;

revoke all on function public.fact_stats(uuid, boolean), public.daily_trend(uuid, int),
                       public.quest_stats(uuid), public.longest_streak(uuid) from public, anon;
grant execute on function public.fact_stats(uuid, boolean), public.daily_trend(uuid, int),
                          public.quest_stats(uuid), public.longest_streak(uuid) to authenticated;
