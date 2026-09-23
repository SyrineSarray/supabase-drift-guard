import fs from "node:fs";
import { Client } from "pg";

// Same convention the Supabase CLI uses: <version>_<name>.sql. Files that
// don't match are skipped by the CLI, so they're skipped here too.
const MIGRATION_FILE_PATTERN = /^(\d+)_.*\.sql$/;

export function listMigrationFileVersions(migrationsPath: string): string[] {
  return fs
    .readdirSync(migrationsPath)
    .map((file) => MIGRATION_FILE_PATTERN.exec(file)?.[1])
    .filter((version): version is string => version !== undefined)
    .sort();
}

export async function getAppliedMigrationVersions(databaseUrl: string): Promise<string[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(`SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;`);

    return result.rows.map((row) => row.version);
  } finally {
    await client.end();
  }
}

export function diffMigrationVersions(files: string[], applied: string[]) {
  const fileSet = new Set(files);
  const appliedSet = new Set(applied);

  return {
    notApplied: files.filter((version) => !appliedSet.has(version)),
    notOnDisk: applied.filter((version) => !fileSet.has(version)),
  };
}
