-- Times Tables: the Greek Myths quest and its 8 creatures.
-- Purely additive: appended after the existing 95 collectibles, so every backpack keeps
-- everything and gains a "Greek Myth creatures" section of empty slots.

alter table public.collectibles drop constraint collectibles_grp_check;
alter table public.collectibles add constraint collectibles_grp_check
  check (grp in ('animals','rare','water','earth','fire','ice','emerald','ruby','golden','diamond','tropical','myth'));

insert into public.collectibles (id, grp, base, sort)
select 'myth-' || b, 'myth', b, 95 + ord::int
from unnest(array['hydra','pegasus','cerberus','minotaur','griffin','phoenix','centaur','medusa']) with ordinality as t(b, ord)
on conflict (id) do nothing;

alter table public.quest_runs drop constraint quest_runs_quest_id_check;
alter table public.quest_runs add constraint quest_runs_quest_id_check
  check (quest_id in ('mystery','pick','water','earth','fire','ice','emerald','ruby','golden','diamond','tropical','myth'));
