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

- **Authentication → Providers → Email**: enabled. Keep "Confirm email" on.
- **Authentication → URL Configuration**: Site URL `http://localhost:5173` for now. The Vercel URL is added in Phase 5.

## 4. Check it

```bash
npm run dev
```

Create an account, confirm the email, sign in, add a child, and play.

## How the tests cover this without a project

`supabase/tests/` runs every migration in PGlite, an in-memory Postgres 18. `shim.sql` stands in for what Supabase provides: the `anon` and `authenticated` roles, `auth.users`, `auth.uid()`, the `extensions` schema and Supabase's default grants. The RLS, PIN and daily-limit tests run as those roles. They exercise the real SQL, but the shim is still a stand-in, so step 4 against the real project is the final check.
