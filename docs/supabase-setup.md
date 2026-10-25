# Supabase setup

## 1. Create the project (by hand)

1. supabase.com → New project (the free tier is fine). Pick a region near you and save the database password somewhere safe.
2. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
3. In this folder, copy `.env.example` to `.env.local` and fill both in. `.env.local` is gitignored, so never commit it. The service-role key isn't needed by the app; don't put it in any `VITE_` variable.

## 2. Apply the migrations

The files in `supabase/migrations/` run in name order. Use either option.

**Option A, SQL editor (no tools):** in the dashboard, open **SQL Editor** and run each file in order:
1. `20261015000001_tables_and_rls.sql`
2. `20261015000002_functions.sql`
3. `20261015000003_seed_collectibles.sql`
4. `20261015000004_dashboard.sql` (Phase 4: the dashboard's queries)
5. `20261016000005_kid_accounts.sql` (kid accounts and family codes; removes PINs)

**Option B, Supabase CLI:**

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <your-project-ref>
```

```bash
npx supabase db push
```

## 3. Auth settings

- **Authentication → Sign In / Providers → Email**: enabled, with **Confirm email off** (since 2026-10-25), so a grown-up signs up with just an email and password and is in straight away, with no email from Supabase. Grown-ups never need a Supabase or Vercel account; those are only for whoever runs the site.
- **Authentication → URL Configuration**: Site URL is the live site, `https://multiplication-game-six.vercel.app`. Redirect URLs: that address with `/**`, plus `http://localhost:5173/**` for local development.
- **Authentication → Sign In / Providers → User Signups**: **Allow anonymous sign-ins** on. Kid devices sign in this way and are then linked to one kid by their username and password.

## 4. Check it

```bash
npm run dev
```

Create a grown-up account (no email confirmation), add a kid, and play.

## Optional: demo data for the dashboard (dev only)

`supabase/seed/dev-seed.sql` adds a fake child, **Demo Kid (seed)**, with about 2,000 attempts over the last 30 days, quest runs, catches and a review pile, so the dashboard has something to show. Run it in the SQL editor after the migrations. It goes to the oldest parent account, and running it again replaces the demo child. To remove it:

```sql
delete from public.children where name = 'Demo Kid (seed)';
```

## How the tests cover this without a project

`supabase/tests/` runs every migration in PGlite, an in-memory Postgres 18. `shim.sql` stands in for what Supabase provides: the `anon` and `authenticated` roles, `auth.users`, `auth.uid()`, the `extensions` schema and Supabase's default grants. The RLS, PIN and daily-limit tests run as those roles. They exercise the real SQL, but the shim is still a stand-in, so step 4 against the real project is the final check.
