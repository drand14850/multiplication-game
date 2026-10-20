-- Times Tables: five more rare animals (Narwhal, Flamingo, Red Panda, Sloth, Peacock).
-- Purely additive: appended after the existing 90, so every backpack keeps everything and
-- the Rare section simply gains five new slots.

insert into public.collectibles (id, grp, base, sort) values
  ('narwhal',   'rare', 'narwhal',   91),
  ('flamingo',  'rare', 'flamingo',  92),
  ('red-panda', 'rare', 'red panda', 93),
  ('sloth',     'rare', 'sloth',     94),
  ('peacock',   'rare', 'peacock',   95)
on conflict (id) do nothing;
