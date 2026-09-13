#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { getGrants } from "./grants.js";
import { compareGrants } from "./compare.js";
import { startSupabase, stopSupabase, getLocalDatabaseUrl } from "./supabase.js";

const [, , command, projectArg] = process.argv;

if (command !== "check" || !projectArg) {
  console.error("Usage: supabase-drift-guard check <project-path>");
  process.exit(1);
}

const projectPath = path.resolve(projectArg);

const migrationsPath = path.join(projectPath, "supabase", "migrations");

if (!fs.existsSync(migrationsPath)) {
  console.error("Supabase migrations folder not found");
  process.exit(1);
}

const remoteUrl = process.env.REMOTE_DATABASE_URL;

if (!remoteUrl) {
  console.error("Missing REMOTE_DATABASE_URL");
  process.exit(1);
}

try {
  startSupabase(projectPath);

  const localUrl = getLocalDatabaseUrl(projectPath);

  const expected = await getGrants(localUrl);
  const live = await getGrants(remoteUrl);

  const drift = compareGrants(expected, live);

  if (drift.missingInLive.length === 0 && drift.extraInLive.length === 0) {
    console.log("✓ No grant drift detected");
    process.exitCode = 0;
  } else {
    console.log("\n✗ GRANT DRIFT DETECTED\n");

    for (const grant of drift.missingInLive) {
      console.log(`${grant.table_schema}.${grant.table_name} | ${grant.grantee} | ${grant.privilege_type} missing in live`);
    }

    for (const grant of drift.extraInLive) {
      console.log(`${grant.table_schema}.${grant.table_name} | ${grant.grantee} | ${grant.privilege_type} extra in live`);
    }

    process.exitCode = 1;
  }
} finally {
  stopSupabase(projectPath);
}
