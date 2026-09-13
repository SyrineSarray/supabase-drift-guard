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
