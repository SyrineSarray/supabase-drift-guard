import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDefaultPrivileges } from "../../src/grants.js";
import { compareDefaultPrivileges } from "../../src/compare.js";
import { createFixture, type Fixture } from "./helpers/fixture.js";

let fixture: Fixture;

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("getDefaultPrivileges / compareDefaultPrivileges", () => {
  it("treats a global default and a schema-scoped default as distinct rows", async () => {
    const owner = await fixture.createRole("owner");
    const grantee = await fixture.createRole("grantee");

    await fixture.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA "${fixture.schema}" GRANT SELECT ON TABLES TO "${grantee}"`,
    );
    await fixture.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" GRANT SELECT ON TABLES TO "${grantee}"`);

    const rows = await getDefaultPrivileges(fixture.url, [fixture.schema], [grantee]);

    expect(rows).toContainEqual(
      expect.objectContaining({ grantor: owner, grantee, schema_name: fixture.schema, privilege_type: "SELECT" }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ grantor: owner, grantee, schema_name: "*", privilege_type: "SELECT" }),
    );
    expect(rows).toHaveLength(2);
  });

  it("treats the same default owned by a different role as drift, not a silent match", async () => {
    const owner1 = await fixture.createRole("owner1");
    const owner2 = await fixture.createRole("owner2");
    const grantee = await fixture.createRole("grantee");

    await fixture.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${owner1}" IN SCHEMA "${fixture.schema}" GRANT SELECT ON TABLES TO "${grantee}"`,
    );

    const expected = await getDefaultPrivileges(fixture.url, [fixture.schema], [grantee]);

    await fixture.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${owner2}" IN SCHEMA "${fixture.schema}" GRANT SELECT ON TABLES TO "${grantee}"`,
    );

    const live = await getDefaultPrivileges(fixture.url, [fixture.schema], [grantee]);

    const result = compareDefaultPrivileges(expected, live);

    expect(result.extraInLive).toHaveLength(1);
    expect(result.extraInLive[0]).toMatchObject({ grantor: owner2, grantee, privilege_type: "SELECT" });
    expect(result.missingInLive).toEqual([]);
  });

  it("scopes schema-bound defaults to the exposed schemas, but always includes global defaults", async () => {
    const owner = await fixture.createRole("owner");
    const grantee = await fixture.createRole("grantee");
    const outsideSchema = `${fixture.schema}_outside`;
    await fixture.query(`CREATE SCHEMA "${outsideSchema}"`);

    await fixture.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA "${outsideSchema}" GRANT SELECT ON TABLES TO "${grantee}"`,
    );
    await fixture.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" GRANT INSERT ON TABLES TO "${grantee}"`);

    const rows = await getDefaultPrivileges(fixture.url, [fixture.schema], [grantee]);

    expect(rows.some((row) => row.schema_name === outsideSchema)).toBe(false);
    expect(rows).toContainEqual(expect.objectContaining({ schema_name: "*", privilege_type: "INSERT" }));

    await fixture.query(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA "${outsideSchema}" REVOKE ALL ON TABLES FROM "${grantee}"`);
    await fixture.query(`DROP SCHEMA "${outsideSchema}" CASCADE`);
  });
});
