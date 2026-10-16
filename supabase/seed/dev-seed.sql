-- DEV ONLY. Adds a fake child, "Demo Kid (seed)", with about 2,000 attempts over the last
-- 30 days, quest runs, catches and a review pile, so the dashboard can be checked with
-- realistic data. Run it in the Supabase SQL editor (it runs as the database owner).
--
-- The child goes to the oldest parent account. Running it again replaces the demo child.
-- To remove it:  delete from public.children where name = 'Demo Kid (seed)';
-- (deleting the child deletes all of its data)
--
-- The numbers are deterministic: same seed, same data, relative to when it's run.

do $$
declare
  parent uuid := (select id from auth.users order by created_at, id limit 1);
  kid uuid;
  run uuid;
  t timestamptz;
  day int;
  sess int;
  i int;
  a int; b int;
  hard int;
  p_ok float; base_ms float;
  ok boolean;
  ms int;
  qid text;
  qlen int;
  n_reached int;
  fact_pool int[];
  elem_animals text[];
  regulars text[] := array['cat','dog','bear','bunny','fox','owl','frog','penguin','whale','turtle','elephant','pig','panda'];
  rares text[] := array['axolotl','salamander','chameleon','lizard','snake'];
begin
  if parent is null then raise exception 'no parent account yet: sign up in the app first'; end if;
  perform setseed(0.42);

  delete from public.children where name = 'Demo Kid (seed)' and parent_id = parent;
  insert into public.children (parent_id, name, avatar) values (parent, 'Demo Kid (seed)', 'panda') returning id into kid;

  for day in reverse 29..0 loop
    continue when random() < 0.3;                      -- skips about 3 days in 10
    for sess in 1..(1 + (random() < 0.35)::int) loop
      -- afternoon or evening, then answers 2–10 s apart
      t := date_trunc('day', now()) - make_interval(days => day)
           + make_interval(hours => 15 + floor(random() * 5)::int + (sess - 1) * 2, mins => floor(random() * 50)::int);
      continue when t > now();

      -- a practice stretch
      for i in 1..(30 + floor(random() * 45)::int) loop
        a := 2 + floor(random() * 11)::int;
        b := 2 + floor(random() * 11)::int;
        -- how hard a fact is: ×2, ×5, ×10 easy; 6–8 × 6–8 hardest; ×12 and ×11 middling
        hard := case
          when a in (2, 5, 10) or b in (2, 5, 10) then 0
          when a between 6 and 8 and b between 6 and 8 then 3
          when a in (12, 9) or b in (12, 9) then 2
          else 1 end;
        -- a little better every day
        p_ok    := least(0.99, (array[0.97, 0.9, 0.78, 0.62])[hard + 1] + (29 - day) * 0.004);
        base_ms := (array[1400, 2400, 3600, 5200])[hard + 1] * (1 - (29 - day) * 0.006);
        ok := random() < p_ok;
        ms := least(60000, greatest(400, (base_ms * (0.6 + random() * 0.9) * (case when ok then 1 else 1.3 end))::int));
        t := t + make_interval(secs => ms / 1000.0 + 1.5 + random() * 3);
        insert into public.attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, was_review, created_at)
        values (gen_random_uuid(), kid, a, b, case when ok then a * b else a * b + (case when random() < 0.5 then -a else b end) end,
                ok, ms, 'practice', random() < 0.12, t);
        if ok then
          insert into public.catches (id, child_id, collectible_id, source, created_at)
          values (gen_random_uuid(), kid,
                  case when random() < 0.05 then rares[1 + floor(random() * 5)::int] else regulars[1 + floor(random() * 13)::int] end,
                  'practice', t);
        end if;
      end loop;

      -- most sessions try a quest or two
      for i in 1..(floor(random() * 3)::int) loop
        qid := (array['water','earth','fire','ice','emerald','pick','ruby','golden','diamond'])[1 + floor(random() * random() * 9)::int];
        qlen := case qid when 'pick' then 8 when 'water' then 10 when 'earth' then 12 when 'fire' then 14 when 'ice' then 18
                         when 'emerald' then 19 when 'ruby' then 21 when 'golden' then 23 else 25 end;
        run := gen_random_uuid();
        insert into public.quest_runs (id, child_id, quest_id, length, reached, result, started_at)
        values (run, kid, qid, qlen, 0, 'quit', t);
        n_reached := 0;
        loop
          a := 2 + floor(random() * 11)::int;
          b := 2 + floor(random() * 11)::int;
          hard := case when a in (2, 5, 10) or b in (2, 5, 10) then 0
                       when a between 6 and 8 and b between 6 and 8 then 3
                       when a in (12, 9) or b in (12, 9) then 2 else 1 end;
          ok := random() < least(0.995, (array[0.98, 0.93, 0.85, 0.72])[hard + 1] + (29 - day) * 0.003);
          ms := greatest(400, ((array[1400, 2400, 3600, 5200])[hard + 1] * (0.6 + random() * 0.9))::int);
          t := t + make_interval(secs => ms / 1000.0 + 1.2);
          insert into public.attempts (id, child_id, a, b, given_answer, correct, response_ms, mode, quest_run_id, was_review, created_at)
          values (gen_random_uuid(), kid, a, b, case when ok then a * b else a * b + 1 end, ok, ms, 'quest', run, false, t);
          exit when not ok;
          n_reached := n_reached + 1;
          exit when n_reached = qlen;
        end loop;
        if n_reached = qlen then
          if qid = 'pick' then
            update public.quest_runs set reached = qlen, result = 'won', reward_id = regulars[1 + floor(random() * 13)::int], ended_at = t where id = run;
            insert into public.catches (id, child_id, collectible_id, source, quest_run_id, created_at)
            select gen_random_uuid(), kid, reward_id, 'pick', run, t from public.quest_runs where id = run;
          else
            elem_animals := array(select id from public.collectibles where grp = qid order by sort);
            update public.quest_runs set reached = qlen, result = 'won',
              reward_id = elem_animals[1 + floor(random() * 8)::int], ended_at = t where id = run;
            insert into public.catches (id, child_id, collectible_id, source, quest_run_id, created_at)
            select gen_random_uuid(), kid, reward_id, 'quest', run, t from public.quest_runs where id = run;
          end if;
        else
          update public.quest_runs set reached = n_reached, result = 'failed', ended_at = t where id = run;
        end if;
      end loop;
    end loop;
  end loop;

  insert into public.game_state (child_id, review_pile) values (kid, '{"7x8": 2, "8x6": 1, "12x7": 2, "6x7": 1}');
  raise notice 'Demo Kid (seed): % attempts', (select count(*) from public.attempts where child_id = kid);
end $$;
