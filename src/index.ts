#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";

import { getGrants, getSchemaPrivileges, getDefaultPrivileges, getExistingRoles } from "./grants.js";

import {
  compareGrants,
  compareSchemaPrivileges,
  compareDefaultPrivileges,
  findRolesMissingEverywhere,
} from "./compare.js";

import { isSupabaseRunning, startSupabase, stopSupabase, getLocalDatabaseUrl } from "./supabase.js";

import { listMigrationFileVersions, getAppliedMigrationVersions, diffMigrationVersions } from "./migrations.js";

import { getExposedSchemas, loadRolesConfig } from "./config.js";

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
  // Reuse a stack the user already has running, and leave it running afterwards.
  if (isSupabaseRunning(projectPath)) {
    console.log("Reusing already-running local Supabase stack");
  } else {
    startSupabase(projectPath);
    supabaseStarted = true;
  }

  const localUrl = getLocalDatabaseUrl(projectPath);

  /*
   * Ground truth check: the local database must have applied exactly the
   * migrations on disk. A reused volume doesn't replay files added or deleted
   * since it was built, which would make the expected side silently wrong.
   */
  const migrationDiff = diffMigrationVersions(
    listMigrationFileVersions(migrationsPath),
    await getAppliedMigrationVersions(localUrl),
  );

  if (migrationDiff.notApplied.length > 0 || migrationDiff.notOnDisk.length > 0) {
    const details = [
      ...migrationDiff.notApplied.map((version) => `  ${version}: file exists but not applied locally`),
      ...migrationDiff.notOnDisk.map((version) => `  ${version}: applied locally but no matching file`),
    ].join("\n");

    throw new Error(
      `local database does not match supabase/migrations:\n${details}\n` +
        "Run `npx supabase db reset --local` (wipes local data) or `npx supabase stop --no-backup`, then re-run.",
    );
  }

  const exposedSchemas = getExposedSchemas(projectPath);

  const roles = loadRolesConfig(projectPath);

  const missingRoles = findRolesMissingEverywhere(
    roles,
    await getExistingRoles(localUrl, roles),
    await getExistingRoles(remoteUrl, roles),
  );

  if (missingRoles.length > 0) {
    throw new Error(
      `Configured role(s) not found in local or live database: ${missingRoles.join(", ")}. ` +
        'Role names are case-sensitive (quoted "Teacher" vs unquoted teacher); ' +
        "PUBLIC is a pseudo-role, not a role, and cannot be tracked.",
    );
  }

  /*
   * Table grants
   */
  const expectedGrants = await getGrants(localUrl, exposedSchemas, roles);
  const liveGrants = await getGrants(remoteUrl, exposedSchemas, roles);

  const grantDrift = compareGrants(expectedGrants, liveGrants);

  /*
   * Schema privileges
   */
  const expectedSchemaPrivileges = await getSchemaPrivileges(localUrl, exposedSchemas, roles);

  const liveSchemaPrivileges = await getSchemaPrivileges(remoteUrl, exposedSchemas, roles);

  const schemaDrift = compareSchemaPrivileges(expectedSchemaPrivileges, liveSchemaPrivileges);

  /*
   * Default privileges (ALTER DEFAULT PRIVILEGES)
   */
  const expectedDefaultPrivileges = await getDefaultPrivileges(localUrl, exposedSchemas, roles);

  const liveDefaultPrivileges = await getDefaultPrivileges(remoteUrl, exposedSchemas, roles);

  const defaultDrift = compareDefaultPrivileges(expectedDefaultPrivileges, liveDefaultPrivileges);

  const hasGrantDrift = grantDrift.missingInLive.length > 0 || grantDrift.extraInLive.length > 0;

  const hasSchemaDrift = schemaDrift.missingInLive.length > 0 || schemaDrift.extraInLive.length > 0;

  const hasDefaultDrift = defaultDrift.missingInLive.length > 0 || defaultDrift.extraInLive.length > 0;

  const hasDrift = hasGrantDrift || hasSchemaDrift || hasDefaultDrift;

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

    /*
     * Default privilege drift
     */
    for (const privilege of defaultDrift.missingInLive) {
      console.log(
        `default:${privilege.schema_name} (owner ${privilege.grantor}) | ` +
          `${privilege.grantee} | ` +
          `${privilege.privilege_type} missing in live`,
      );
    }

    for (const privilege of defaultDrift.extraInLive) {
      console.log(
        `default:${privilege.schema_name} (owner ${privilege.grantor}) | ` +
          `${privilege.grantee} | ` +
          `${privilege.privilege_type} extra in live`,
      );
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
