#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";

import { getGrants, getSchemaPrivileges } from "./grants.js";

import { compareGrants, compareSchemaPrivileges } from "./compare.js";

import { startSupabase, stopSupabase, getLocalDatabaseUrl } from "./supabase.js";

import { getExposedSchemas } from "./config.js";

const [, , command, projectArg] = process.argv;

if (command !== "check" || !projectArg) {
  console.error("Usage: supabase-drift-guard check <project-path>");
  process.exit(1);
}

const projectPath = path.resolve(projectArg);

const migrationsPath = path.join(projectPath, "supabase", "migrations");

if (!fs.existsSync(migrationsPath)) {
  console.error(`Supabase migrations folder not found: ${migrationsPath}`);
  process.exit(1);
}

const remoteUrl = process.env.REMOTE_DATABASE_URL;

if (!remoteUrl) {
  console.error("Missing REMOTE_DATABASE_URL");
  process.exit(1);
}

let supabaseStarted = false;

try {

  startSupabase(projectPath);
  supabaseStarted = true;

  const localUrl = getLocalDatabaseUrl(projectPath);

  const exposedSchemas = getExposedSchemas(projectPath);

  /*
   * Table grants
   */
  const expectedGrants = await getGrants(localUrl);
  const liveGrants = await getGrants(remoteUrl);

  const grantDrift = compareGrants(expectedGrants, liveGrants);

  /*
   * Schema privileges
   */
  const expectedSchemaPrivileges = await getSchemaPrivileges(localUrl, exposedSchemas);

  const liveSchemaPrivileges = await getSchemaPrivileges(remoteUrl, exposedSchemas);

  const schemaDrift = compareSchemaPrivileges(expectedSchemaPrivileges, liveSchemaPrivileges);

  const hasGrantDrift = grantDrift.missingInLive.length > 0 || grantDrift.extraInLive.length > 0;

  const hasSchemaDrift = schemaDrift.missingInLive.length > 0 || schemaDrift.extraInLive.length > 0;

  const hasDrift = hasGrantDrift || hasSchemaDrift;

  if (!hasDrift) {
    console.log("\n✓ No privilege drift detected");
    process.exitCode = 0;
  } else {
    console.log("\n✗ PRIVILEGE DRIFT DETECTED\n");

    /*
     * Table grant drift
     */
    for (const grant of grantDrift.missingInLive) {
      console.log(`${grant.table_schema}.${grant.table_name} | ` + `${grant.grantee} | ` + `${grant.privilege_type} missing in live`);
    }

    for (const grant of grantDrift.extraInLive) {
      console.log(`${grant.table_schema}.${grant.table_name} | ` + `${grant.grantee} | ` + `${grant.privilege_type} extra in live`);
    }

    /*
     * Schema privilege drift
     */
    for (const privilege of schemaDrift.missingInLive) {
      console.log(`schema:${privilege.schema_name} | ` + `${privilege.grantee} | ` + `${privilege.privilege_type} missing in live`);
    }

    for (const privilege of schemaDrift.extraInLive) {
      console.log(`schema:${privilege.schema_name} | ` + `${privilege.grantee} | ` + `${privilege.privilege_type} extra in live`);
    }

    process.exitCode = 1;
  }
} catch (error) {
  console.error("\nDrift check failed:", error instanceof Error ? error.message : error);

  process.exitCode = 1;
} finally {
  if (supabaseStarted) {

    try {
      stopSupabase(projectPath);
    } catch {
      console.error("Warning: failed to stop local Supabase");
    }
  }
}
