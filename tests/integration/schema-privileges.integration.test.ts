import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSchemaPrivileges } from "../../src/grants.js";
import { compareSchemaPrivileges } from "../../src/compare.js";
import { createFixture, type Fixture } from "./helpers/fixture.js";

let fixture: Fixture;

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("getSchemaPrivileges / compareSchemaPrivileges", () => {
  // Uses a freshly created schema, never `public`: Postgres grants USAGE on
  // `public` to PUBLIC by default, which would make a "missing" assertion here
  // pass with zero explicit grant. The fixture role is NOLOGIN and non-superuser
  // for the same reason: a superuser bypasses has_schema_privilege() checks
  // regardless of grants.

  it("detects a schema privilege revoked in live (missingInLive)", async () => {
    const role = await fixture.createRole("anon");
    await fixture.query(`GRANT USAGE ON SCHEMA "${fixture.schema}" TO "${role}"`);

    const expected = await getSchemaPrivileges(fixture.url, [fixture.schema], [role]);
    await fixture.query(`REVOKE USAGE ON SCHEMA "${fixture.schema}" FROM "${role}"`);
    const live = await getSchemaPrivileges(fixture.url, [fixture.schema], [role]);

    const result = compareSchemaPrivileges(expected, live);

    expect(result.missingInLive).toHaveLength(1);
    expect(result.missingInLive[0]).toMatchObject({
      grantee: role,
      schema_name: fixture.schema,
      privilege_type: "USAGE",
    });
    expect(result.extraInLive).toEqual([]);
  });

  it("detects a schema privilege added out-of-band in live (extraInLive)", async () => {
    const role = await fixture.createRole("anon");

    const expected = await getSchemaPrivileges(fixture.url, [fixture.schema], [role]);
    await fixture.query(`GRANT CREATE ON SCHEMA "${fixture.schema}" TO "${role}"`);
    const live = await getSchemaPrivileges(fixture.url, [fixture.schema], [role]);

    const result = compareSchemaPrivileges(expected, live);

    expect(result.extraInLive).toHaveLength(1);
    expect(result.extraInLive[0]).toMatchObject({
      grantee: role,
      schema_name: fixture.schema,
      privilege_type: "CREATE",
    });
    expect(result.missingInLive).toEqual([]);
  });

  it("reports no drift for a fresh schema with no grants at all", async () => {
    const role = await fixture.createRole("anon");

    const rows = await getSchemaPrivileges(fixture.url, [fixture.schema], [role]);

    expect(rows).toEqual([]);
  });
});
