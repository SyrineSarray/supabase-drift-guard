import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { inject } from "vitest";

export type Fixture = {
  url: string;
  schema: string;
  /** Raw setup/teardown SQL, deliberately a separate connection from the functions under test. */
  query: (sql: string, params?: unknown[]) => Promise<void>;
  /** Creates a NOLOGIN, non-superuser role uniquely named per test, and tracks it for cleanup. */
  createRole: (label: string) => Promise<string>;
  cleanup: () => Promise<void>;
};

// The container's default connection user is a superuser (the Postgres docker
// entrypoint grants superuser to POSTGRES_USER). information_schema.role_table_grants
// only shows grants visible to the connecting role as grantor, grantee, or via role
// membership, so every role created here is implicitly visible to it. Point this
// harness at a non-superuser connection and tests will start reporting phantom
// missingInLive results unrelated to the code under test.
export async function createFixture(): Promise<Fixture> {
  const url = inject("pgConnectionUri");
  const client = new Client({ connectionString: url });
  await client.connect();

  // A random id, not a counter: vitest runs each test file in its own module
  // instance against the one shared container, so a module-level counter
  // would restart at 1 per file and collide across files.
  const id = randomBytes(4).toString("hex");
  const schema = `drift_t${id}`;
  const roles: string[] = [];

  await client.query(`CREATE SCHEMA "${schema}"`);

  return {
    url,
    schema,
    query: async (sql, params) => {
      await client.query(sql, params);
    },
    createRole: async (label) => {
      const role = `drift_t${id}_${label}`;
      await client.query(`CREATE ROLE "${role}" NOLOGIN`);
      roles.push(role);
      return role;
    },
    cleanup: async () => {
      // Drop the schema first (cascades through tables, grants, and any
      // schema-scoped default privileges). DROP OWNED BY then clears
      // anything schema-drop can't reach: global (no IN SCHEMA) default
      // privileges where a fixture role is either the owner (defaclrole)
      // or the grantee, which is required before DROP ROLE will succeed.
      await client.query(`DROP SCHEMA "${schema}" CASCADE`);
      for (const role of roles) {
        await client.query(`DROP OWNED BY "${role}"`);
        await client.query(`DROP ROLE IF EXISTS "${role}"`);
      }
      await client.end();
    },
  };
}
