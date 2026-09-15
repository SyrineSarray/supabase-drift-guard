import { describe, expect, it } from "vitest";
import { compareGrants, compareSchemaPrivileges } from "../src/compare.js";
import { Grant, SchemaPrivilege } from "../src/grants.js";

describe("compareGrants", () => {
  it("detects missing live grant", () => {
    const expected = [
      {
        grantee: "anon",
        table_schema: "public",
        table_name: "posts",
        privilege_type: "SELECT",
      },
    ];

    const live: Grant[] = [];

    const result = compareGrants(expected, live);

    expect(result.missingInLive).toHaveLength(1);
    expect(result.extraInLive).toHaveLength(0);
  });

  it("detects extra live grant", () => {
    const expected: Grant[] = [];

    const live = [
      {
        grantee: "anon",
        table_schema: "public",
        table_name: "posts",
        privilege_type: "SELECT",
      },
    ];

    const result = compareGrants(expected, live);

    expect(result.extraInLive).toHaveLength(1);
  });

  it("returns no drift when equal", () => {
    const grant = {
      grantee: "anon",
      table_schema: "public",
      table_name: "posts",
      privilege_type: "SELECT",
    };

    const result = compareGrants([grant], [grant]);

    expect(result.missingInLive).toHaveLength(0);
    expect(result.extraInLive).toHaveLength(0);
  });
});

describe("compareSchemaPrivileges", () => {
  it("detects missing USAGE", () => {
    const expected = [
      {
        grantee: "anon",
        schema_name: "public",
        privilege_type: "USAGE",
      },
    ];

    const live: SchemaPrivilege[] = [];

    const result = compareSchemaPrivileges(expected, live);

    expect(result.missingInLive).toHaveLength(1);
  });
});