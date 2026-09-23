import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import "./helpers/provided-context.js";
import { inject } from "vitest";
import { diffMigrationVersions, getAppliedMigrationVersions, listMigrationFileVersions } from "../../src/migrations.js";

// supabase_migrations.schema_migrations is cluster-shared, unlike the per-test
// schemas in fixture.ts, so every case that touches it lives in this one file
// and runs sequentially against the same table.

let client: Client;
let url: string;
let migrationsDir: string;

beforeAll(async () => {
  url = inject("pgConnectionUri");
  client = new Client({ connectionString: url });
  await client.connect();
  await client.query("CREATE SCHEMA IF NOT EXISTS supabase_migrations");
  await client.query(
    "CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text)",
  );
});

afterAll(async () => {
  await client.query("DROP SCHEMA supabase_migrations CASCADE");
  await client.end();
});

beforeEach(async () => {
  await client.query("TRUNCATE supabase_migrations.schema_migrations");
  migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), "drift-guard-migrations-"));
  return () => fs.rmSync(migrationsDir, { recursive: true, force: true });
});

function writeMigrationFiles(...names: string[]) {
  for (const name of names) {
    fs.writeFileSync(path.join(migrationsDir, name), "select 1;");
  }
}

async function markApplied(...versions: string[]) {
  for (const version of versions) {
    await client.query("INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)", [version]);
  }
}

async function diff() {
  return diffMigrationVersions(listMigrationFileVersions(migrationsDir), await getAppliedMigrationVersions(url));
}

describe.sequential("local migration ground truth", () => {
  it("reports nothing when every file is applied and nothing else is", async () => {
    writeMigrationFiles("20260101000000_init.sql", "20260102000000_posts.sql");
    await markApplied("20260101000000", "20260102000000");

    expect(await diff()).toEqual({ notApplied: [], notOnDisk: [] });
  });

  it("reports a file that was added after the local volume was built", async () => {
    writeMigrationFiles("20260101000000_init.sql", "20260102000000_posts.sql");
    await markApplied("20260101000000");

    expect(await diff()).toEqual({ notApplied: ["20260102000000"], notOnDisk: [] });
  });

  it("reports a version still applied locally whose file was deleted", async () => {
    writeMigrationFiles("20260101000000_init.sql");
    await markApplied("20260101000000", "20260102000000");

    expect(await diff()).toEqual({ notApplied: [], notOnDisk: ["20260102000000"] });
  });

  it("ignores files that don't follow the <version>_<name>.sql convention", async () => {
    writeMigrationFiles("20260101000000_init.sql", "README.md", "draft.sql", "20260102000000_notes.txt");
    await markApplied("20260101000000");

    expect(await diff()).toEqual({ notApplied: [], notOnDisk: [] });
  });
});
