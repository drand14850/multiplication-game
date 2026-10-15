// In-memory Postgres (PGlite) with the Supabase shim and every migration applied, plus
// helpers to run SQL as a signed-in parent (role authenticated + JWT sub), as anon, or as admin.

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(readFileSync(here("./shim.sql"), "utf8"));
  const dir = here("../migrations/");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(dir + f, "utf8"));
  }
  return db;
}

/** Create a parent the way Supabase Auth does (a row in auth.users). */
export async function addParent(db: PGlite, id: string, timeZone?: string): Promise<void> {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
    [id, id.slice(0, 8) + "@example.test", JSON.stringify(timeZone ? { time_zone: timeZone } : {})]);
}

/** Run fn as a signed-in parent (role authenticated, JWT sub = uid), inside a transaction. */
export function asUser<T>(db: PGlite, uid: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated" })]);
    await tx.exec("set local role authenticated");
    return fn(tx);
  });
}

/** Run fn as the anonymous (signed-out) API role. */
export function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', '', true)");
    await tx.exec("set local role anon");
    return fn(tx);
  });
}

/** Expect a query to fail; returns the error message. */
export async function failure(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error("expected the query to fail, but it succeeded");
}
