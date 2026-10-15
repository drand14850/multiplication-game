-- Times Tables: tables, row level security and policies.
-- RLS is enabled with policies on every table here, before any data goes in
-- (the collectibles seed is a later migration).

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------
-- Reference data: the 82 collectibles (stable IDs, never display names)
-- ------------------------------------------------------------------
create table public.collectibles (
  id       text primary key,                       -- 'cat', 'axolotl', 'fire-fox'
  grp      text not null check (grp in ('animals','rare','water','earth','fire','ice','emerald','ruby','golden','diamond')),
  base     text not null,                          -- 'fox'
  is_rare  boolean not null generated always as (grp = 'rare') stored,
  sort     int  not null unique
);

-- ------------------------------------------------------------------
-- Parents and children
-- ------------------------------------------------------------------
create table public.parent_settings (
  parent_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  time_zone   text not null default 'UTC',          -- IANA name; the family's "today" for daily limits
  fluency_ms  int  not null default 3000 check (fluency_ms between 500 and 30000),
  created_at  timestamptz not null default now()
);

create table public.children (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  avatar      text not null references public.collectibles(id)
              check (avatar in ('cat','dog','bear','bunny','fox','owl','frog','penguin','whale','turtle','elephant','pig','panda')),
  has_pin     boolean not null default false,       -- maintained by set_child_pin()
  created_at  timestamptz not null default now()
);
create index children_parent_idx on public.children (parent_id);

-- PIN hashes live apart from children so no policy ever exposes them to the browser.
create table public.child_pins (
  child_id      uuid primary key references public.children(id) on delete cascade,
  pin_hash      text not null,                      -- bcrypt
  failed_count  int  not null default 0,
  locked_until  timestamptz
);

-- ------------------------------------------------------------------
-- Game data (written through the client write queue from Phase 3)
-- ------------------------------------------------------------------
create table public.game_state (
  child_id     uuid primary key references public.children(id) on delete cascade,
  review_pile  jsonb not null default '{}'::jsonb,  -- {"7x8": 2, ...}
  updated_at   timestamptz not null default now()
);

create table public.quest_runs (
  id          uuid primary key,                     -- client-generated
  child_id    uuid not null references public.children(id) on delete cascade,
  quest_id    text not null check (quest_id in ('mystery','pick','water','earth','fire','ice','emerald','ruby','golden','diamond')),
  length      int  not null check (length between 1 and 25),
  reached     int  not null default 0 check (reached >= 0 and reached <= length),
  result      text not null default 'quit' check (result in ('won','failed','quit')),
  reward_id   text references public.collectibles(id),
  started_at  timestamptz not null,
  ended_at    timestamptz
);
create index quest_runs_child_idx on public.quest_runs (child_id, started_at);

create table public.attempts (
  id            uuid primary key,                   -- client-generated, dedupes queue retries
  child_id      uuid not null references public.children(id) on delete cascade,
  a             smallint not null check (a between 2 and 12),
  b             smallint not null check (b between 2 and 12),
  given_answer  int not null check (given_answer between 0 and 999),
  correct       boolean not null,
  response_ms   int not null check (response_ms between 0 and 60000),
  mode          text not null check (mode in ('practice','quest')),
  quest_run_id  uuid references public.quest_runs(id) on delete cascade,
  was_review    boolean not null default false,
  created_at    timestamptz not null,
  check ((mode = 'quest') = (quest_run_id is not null))
);
create index attempts_fact_idx on public.attempts (child_id, a, b, created_at desc);
create index attempts_time_idx on public.attempts (child_id, created_at);

create table public.catches (
  id              uuid primary key,                 -- client-generated
  child_id        uuid not null references public.children(id) on delete cascade,
  collectible_id  text not null references public.collectibles(id),
  source          text not null check (source in ('practice','quest','pick','mystery')),
  quest_run_id    uuid references public.quest_runs(id) on delete set null,
  created_at      timestamptz not null
);
create index catches_child_idx on public.catches (child_id, created_at);

create view public.backpack with (security_invoker = true) as
  select child_id, collectible_id, count(*)::int as n
  from public.catches group by child_id, collectible_id;

-- ------------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------------
create function public.is_my_child(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.children where id = cid and parent_id = auth.uid());
$$;

alter table public.collectibles    enable row level security;
alter table public.parent_settings enable row level security;
alter table public.children        enable row level security;
alter table public.child_pins      enable row level security;
alter table public.game_state      enable row level security;
alter table public.quest_runs      enable row level security;
alter table public.attempts        enable row level security;
alter table public.catches         enable row level security;

create policy "read collectibles" on public.collectibles for select to authenticated using (true);

create policy "own settings" on public.parent_settings for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

create policy "own children" on public.children for all to authenticated
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- child_pins: RLS on and NO policies, plus no table privileges: reachable only through
-- the security-definer PIN functions.
revoke all on public.child_pins from anon, authenticated;

create policy "own game_state" on public.game_state for all to authenticated
  using (public.is_my_child(child_id)) with check (public.is_my_child(child_id));

create policy "own quest_runs" on public.quest_runs for all to authenticated
  using (public.is_my_child(child_id)) with check (public.is_my_child(child_id));

-- attempts and catches are an append-only log: select + insert only (deletes happen by cascade)
create policy "read own attempts"   on public.attempts for select to authenticated using (public.is_my_child(child_id));
create policy "insert own attempts" on public.attempts for insert to authenticated with check (public.is_my_child(child_id));
create policy "read own catches"    on public.catches  for select to authenticated using (public.is_my_child(child_id));
create policy "insert own catches"  on public.catches  for insert to authenticated with check (public.is_my_child(child_id));

-- Nothing is readable or writable without signing in.
revoke all on public.collectibles, public.parent_settings, public.children, public.game_state,
              public.quest_runs, public.attempts, public.catches, public.backpack from anon;
-- Reference data and the append-only log can't be changed by the browser.
revoke insert, update, delete, truncate on public.collectibles from authenticated;
revoke update, delete, truncate on public.attempts, public.catches from authenticated;
