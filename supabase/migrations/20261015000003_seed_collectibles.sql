-- Times Tables: the 82 collectibles, in backpack order. Must match src/game/logic/collectibles.ts
-- (checked by supabase/tests/db.test.ts).

insert into public.collectibles (id, grp, base, sort)
select b, 'animals', b, ord::int from unnest(array['cat','dog','bear','bunny','fox','owl','frog','penguin','whale','turtle','elephant','pig','panda'])
  with ordinality as t(b, ord)
union all
select b, 'rare', b, 13 + ord::int from unnest(array['axolotl','salamander','chameleon','lizard','snake'])
  with ordinality as t(b, ord)
union all
select e.k || '-' || a.b, e.k, a.b, 18 + (e.n - 1) * 8 + a.ord::int
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
