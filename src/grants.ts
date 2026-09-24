import { Client } from "pg";

export type Grant = {
  grantee: string;
  table_schema: string;
  table_name: string;
  privilege_type: string;
};

// Table privileges are *effective*: what each tracked role can actually do,
// including privileges inherited from PUBLIC and from role membership. A
// `GRANT SELECT ... TO PUBLIC` therefore shows up as every tracked role gaining
// SELECT, which is exactly how it exposes data through the API. The privilege
// list is fixed to the SQL-standard seven so a newer server's extra privileges
// (e.g. PG17 MAINTAIN) never create local/live noise. Relation kinds match
// information_schema.table_privileges: tables, views, foreign and partitioned
// tables.
export async function getGrants(databaseUrl: string, schemas: string[], roles: string[]): Promise<Grant[]> {
  const client = new Client({
    connectionString: databaseUrl,
  });

  await client.connect();

  try {
    const result = await client.query(
      `
      SELECT
        r.rolname AS grantee,
        n.nspname AS table_schema,
        c.relname AS table_name,
        p.privilege_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN pg_roles r
      CROSS JOIN (
        VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
      ) AS p(privilege_type)
      WHERE n.nspname = ANY($1::text[])
        AND c.relkind IN ('r', 'v', 'f', 'p')
        AND r.rolname = ANY($2::text[])
        AND has_table_privilege(r.oid, c.oid, p.privilege_type)
      ORDER BY r.rolname, n.nspname, c.relname, p.privilege_type;
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

// Unlike tables and schemas, default privileges can't be resolved to an
// effective per-role answer, so a default granted to PUBLIC (grantee oid 0) is
// always reported, as grantee "PUBLIC", whatever roles are tracked.
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
        COALESCE(grantee_role.rolname, 'PUBLIC') AS grantee,
        COALESCE(n.nspname, '*') AS schema_name,
        a.privilege_type
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) AS a
      JOIN pg_roles grantor_role ON grantor_role.oid = a.grantor
      LEFT JOIN pg_roles grantee_role ON grantee_role.oid = a.grantee
      LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
      WHERE d.defaclobjtype = 'r'
        AND (d.defaclnamespace = 0 OR n.nspname = ANY($1::text[]))
        AND (a.grantee = 0 OR grantee_role.rolname = ANY($2::text[]))
      ORDER BY grantor_role.rolname, grantee, schema_name, a.privilege_type;
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
