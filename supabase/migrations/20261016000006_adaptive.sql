-- Times Tables: adaptive problem picking.
-- The game leans toward the facts a kid doesn't know yet, judged from each fact's last 5
-- tries. A kid's device loads those tries when it opens their game.

-- Each fact's last 5 tries (oldest first). SECURITY INVOKER: row level security applies,
-- so a kid's device gets only its own child and a parent only their own kids.
create function public.fact_recent(p_child uuid)
returns table (a int, b int, correct boolean, response_ms int, created_at timestamptz)
language sql stable set search_path = public as $$
  select x.a, x.b, x.correct, x.response_ms, x.created_at
  from (
    select t.a, t.b, t.correct, t.response_ms, t.created_at,
           row_number() over (partition by t.a, t.b order by t.created_at desc, t.id) as rn
    from attempts t
    where t.child_id = p_child
  ) x
  where x.rn <= 5
  order by x.a, x.b, x.created_at, x.rn desc;
$$;

revoke all on function public.fact_recent(uuid) from public, anon;
grant execute on function public.fact_recent(uuid) to authenticated;

-- kid_me also returns the family's fluency threshold ("fast enough to count as knows it"),
-- which the game uses to decide what's fluent.
drop function public.kid_me();
create function public.kid_me()
returns table (child_id uuid, name text, avatar text, username text, time_zone text, fluency_ms int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.avatar, l.username, coalesce(ps.time_zone, 'UTC'), coalesce(ps.fluency_ms, 3000)
  from public.kid_sessions s
  join public.children c on c.id = s.child_id
  left join public.kid_logins l on l.child_id = c.id
  left join public.parent_settings ps on ps.parent_id = c.parent_id
  where s.user_id = auth.uid();
$$;

revoke all on function public.kid_me() from public, anon;
grant execute on function public.kid_me() to authenticated;
