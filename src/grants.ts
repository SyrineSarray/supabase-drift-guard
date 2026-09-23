import { Client } from "pg";

export type Grant = {
  grantee: string;
  table_schema: string;
  table_name: string;
  privilege_type: string;
};

export async function getGrants(databaseUrl: string, schemas: string[], roles: string[]): Promise<Grant[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(
      `
      SELECT
        grantee,
        table_schema,
        table_name,
        privilege_type
      FROM information_schema.role_table_grants
      WHERE table_schema = ANY($1::text[])
        AND grantee = ANY($2::text[])
      ORDER BY grantee, table_name, privilege_type;
      `,
      [schemas, roles],
    );

    return result.rows;
  } finally {
    await client.end();
  }
}

export type SchemaPrivilege = {
  grantee: string;
  schema_name: string;
  privilege_type: string;
};

export async function getSchemaPrivileges(
  databaseUrl: string,
  schemas: string[],
  roles: string[],
): Promise<SchemaPrivilege[]> {
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
      WHERE r.rolname = ANY($2::text[])
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
      [schemas, roles],
    );

    return result.rows;
  } finally {
    await client.end();
  }
}

export type DefaultPrivilege = {
  grantor: string;
  grantee: string;
  schema_name: string;
  privilege_type: string;
};

export async function getDefaultPrivileges(
  databaseUrl: string,
  schemas: string[],
  roles: string[],
): Promise<DefaultPrivilege[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(
      `
      SELECT
        grantor_role.rolname AS grantor,
        grantee_role.rolname AS grantee,
        COALESCE(n.nspname, '*') AS schema_name,
        a.privilege_type
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
      JOIN pg_roles grantor_role ON grantor_role.oid = a.grantor
      JOIN pg_roles grantee_role ON grantee_role.oid = a.grantee
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      WHERE d.defaclobjtype = 'r'
        AND (d.defaclnamespace = 0 OR n.nspname = ANY($1::text[]))
        AND grantee_role.rolname = ANY($2::text[])
      ORDER BY grantor_role.rolname, grantee_role.rolname, schema_name, a.privilege_type;
      `,
      [schemas, roles],
    );

    return result.rows;
  } finally {
    await client.end();
  }
}
export async function getExistingRoles(databaseUrl: string, roles: string[]): Promise<string[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(
      `
      SELECT rolname
      FROM pg_roles
      WHERE rolname = ANY($1::text[])
      ORDER BY rolname;
      `,
      [roles],
    );

    return result.rows.map((row) => row.rolname);
  } finally {
    await client.end();
  }
}
