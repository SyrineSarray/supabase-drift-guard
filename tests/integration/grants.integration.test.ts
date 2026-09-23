import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getGrants } from "../../src/grants.js";
import { compareGrants } from "../../src/compare.js";
import { createFixture, type Fixture } from "./helpers/fixture.js";

// Every scenario snapshots the same schema/role set twice, with a SQL change
// in between (revoke -> missingInLive, grant -> extraInLive). Comparing across
// different schemas would make every row differ on schema name alone and pass
// for the wrong reason, so both snapshots always target the same fixture
// schema/roles unless a scenario is explicitly testing cross-schema filtering.

let fixture: Fixture;

beforeEach(async () => {
  fixture = await createFixture();
});

afterEach(async () => {
  await fixture.cleanup();
});

async function createTable(name: string) {
  await fixture.query(`CREATE TABLE "${fixture.schema}"."${name}" (id int)`);
}

describe("getGrants / compareGrants", () => {
  it("reports no drift when expected and live match", async () => {
    const role = await fixture.createRole("anon");
    await createTable("posts");
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO "${role}"`);

    const expected = await getGrants(fixture.url, [fixture.schema], [role]);
    const live = await getGrants(fixture.url, [fixture.schema], [role]);

    const result = compareGrants(expected, live);

    expect(result.missingInLive).toEqual([]);
    expect(result.extraInLive).toEqual([]);
  });

  it("detects a grant revoked in live (missingInLive)", async () => {
    const role = await fixture.createRole("anon");
    await createTable("posts");
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO "${role}"`);

    const expected = await getGrants(fixture.url, [fixture.schema], [role]);
    await fixture.query(`REVOKE SELECT ON "${fixture.schema}".posts FROM "${role}"`);
    const live = await getGrants(fixture.url, [fixture.schema], [role]);

    const result = compareGrants(expected, live);

    expect(result.missingInLive).toHaveLength(1);
    expect(result.missingInLive[0]).toMatchObject({ grantee: role, privilege_type: "SELECT" });
    expect(result.extraInLive).toEqual([]);
  });

  it("detects a grant added out-of-band in live (extraInLive)", async () => {
    // Mirrors the real Teacher-role scenario: a role gets a grant directly
    // against production, never declared in a migration.
    const role = await fixture.createRole("teacher");
    await createTable("posts");

    const expected = await getGrants(fixture.url, [fixture.schema], [role]);
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO "${role}"`);
    const live = await getGrants(fixture.url, [fixture.schema], [role]);

    const result = compareGrants(expected, live);

    expect(result.extraInLive).toHaveLength(1);
    expect(result.extraInLive[0]).toMatchObject({ grantee: role, privilege_type: "SELECT" });
    expect(result.missingInLive).toEqual([]);
  });

  it("checks a second exposed schema correctly", async () => {
    const role = await fixture.createRole("anon");
    const otherSchema = `${fixture.schema}_other`;
    await fixture.query(`CREATE SCHEMA "${otherSchema}"`);
    await fixture.query(`CREATE TABLE "${otherSchema}".posts (id int)`);
    await fixture.query(`GRANT SELECT ON "${otherSchema}".posts TO "${role}"`);

    const rows = await getGrants(fixture.url, [fixture.schema, otherSchema], [role]);

    expect(rows).toContainEqual(
      expect.objectContaining({ table_schema: otherSchema, table_name: "posts", privilege_type: "SELECT" }),
    );

    await fixture.query(`DROP SCHEMA "${otherSchema}" CASCADE`);
  });

  it("ignores a schema that is not in the exposed schemas list", async () => {
    const role = await fixture.createRole("anon");
    const unexposedSchema = `${fixture.schema}_unexposed`;
    await fixture.query(`CREATE SCHEMA "${unexposedSchema}"`);
    await fixture.query(`CREATE TABLE "${unexposedSchema}".secrets (id int)`);
    await fixture.query(`GRANT SELECT ON "${unexposedSchema}".secrets TO "${role}"`);

    const rows = await getGrants(fixture.url, [fixture.schema], [role]);

    expect(rows.some((row) => row.table_schema === unexposedSchema)).toBe(false);

    await fixture.query(`DROP SCHEMA "${unexposedSchema}" CASCADE`);
  });

  it("documents that GRANT ... TO PUBLIC is invisible to a named-role query", async () => {
    const role = await fixture.createRole("anon");
    await createTable("posts");
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO PUBLIC`);

    const rows = await getGrants(fixture.url, [fixture.schema], [role]);

    expect(rows).toEqual([]);
  });

  it("diffs multiple tracked roles independently with no cross-contamination", async () => {
    const roleA = await fixture.createRole("anon");
    const roleB = await fixture.createRole("authenticated");
    await createTable("posts");
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO "${roleA}"`);
    await fixture.query(`GRANT INSERT ON "${fixture.schema}".posts TO "${roleB}"`);

    const rows = await getGrants(fixture.url, [fixture.schema], [roleA, roleB]);

    expect(rows).toContainEqual(expect.objectContaining({ grantee: roleA, privilege_type: "SELECT" }));
    expect(rows).toContainEqual(expect.objectContaining({ grantee: roleB, privilege_type: "INSERT" }));
    expect(rows.some((row) => row.grantee === roleA && row.privilege_type === "INSERT")).toBe(false);
    expect(rows.some((row) => row.grantee === roleB && row.privilege_type === "SELECT")).toBe(false);
  });

  it("returns no rows, not an error, for a configured role that does not exist", async () => {
    // Documents current behavior: a typo'd role name in drift-guard.config.json
    // produces a clean run rather than a failure. Not fixed here; see CLAUDE.md's
    // "fail loud, never silent" rule for the follow-up decision this leaves open.
    await createTable("posts");

    const rows = await getGrants(fixture.url, [fixture.schema], ["role_that_does_not_exist"]);

    expect(rows).toEqual([]);
  });

  it("matches a quoted, case-sensitive role name exactly", async () => {
    const role = await fixture.createRole("Teacher");
    await createTable("posts");
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO "${role}"`);

    const exactCase = await getGrants(fixture.url, [fixture.schema], [role]);
    const lowerCase = await getGrants(fixture.url, [fixture.schema], [role.toLowerCase()]);

    expect(exactCase).toHaveLength(1);
    expect(lowerCase).toEqual([]);
  });

  it("returns no rows for a role that was granted privileges but is not in the roles list", async () => {
    const configured = await fixture.createRole("anon");
    const forgotten = await fixture.createRole("forgotten");
    await createTable("posts");
    await fixture.query(`GRANT SELECT ON "${fixture.schema}".posts TO "${forgotten}"`);

    const rows = await getGrants(fixture.url, [fixture.schema], [configured]);

    expect(rows).toEqual([]);
  });
});
