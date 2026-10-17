-- Times Tables: the Tropical quest and its 8 animals.
-- Purely additive: the 82 existing collectibles keep their ids and order, and nobody's
-- backpack changes. The new animals simply appear as new empty slots.

alter table public.collectibles drop constraint collectibles_grp_check;
alter table public.collectibles add constraint collectibles_grp_check
  check (grp in ('animals','rare','water','earth','fire','ice','emerald','ruby','golden','diamond','tropical'));

insert into public.collectibles (id, grp, base, sort)
select 'tropical-' || b, 'tropical', b, 82 + ord::int
from unnest(array['frog','turtle','chameleon','snake','lizard','elephant','whale','axolotl']) with ordinality as t(b, ord)
on conflict (id) do nothing;

alter table public.quest_runs drop constraint quest_runs_quest_id_check;
alter table public.quest_runs add constraint quest_runs_quest_id_check
  check (quest_id in ('mystery','pick','water','earth','fire','ice','emerald','ruby','golden','diamond','tropical'));
