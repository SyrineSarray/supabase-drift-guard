import { Client } from "pg";

export type Grant = {
  grantee: string;
  table_schema: string;
  table_name: string;
  privilege_type: string;
};

export async function getGrants(databaseUrl: string): Promise<Grant[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  const result = await client.query(`
    SELECT
      grantee,
      table_schema,
      table_name,
      privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
    ORDER BY grantee, table_name, privilege_type;
  `);

  await client.end();

  return result.rows;
}

export type SchemaPrivilege = {
  grantee: string;
  schema_name: string;
  privilege_type: string;
};

export async function getSchemaPrivileges(databaseUrl: string, schemas: string[]): Promise<SchemaPrivilege[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(
      `
      SELECT
        r.rolname AS grantee,
        n.nspname AS schema_name,
        p.privilege_type
      FROM pg_roles r
      CROSS JOIN pg_namespace n
      CROSS JOIN (
        VALUES ('USAGE'), ('CREATE')
      ) AS p(privilege_type)
      WHERE r.rolname IN ('anon', 'authenticated')
        AND n.nspname = ANY($1::text[])
        AND has_schema_privilege(
          r.rolname,
          n.nspname,
          p.privilege_type
        )
      ORDER BY
        r.rolname,
        n.nspname,
        p.privilege_type;
      `,
      [schemas],
    );

    return result.rows;
  } finally {
    await client.end();
  }
}