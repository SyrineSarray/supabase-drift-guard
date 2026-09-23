import type { Grant, SchemaPrivilege, DefaultPrivilege } from "./grants.js";

function diffByKey<T>(expected: T[], live: T[], keyFn: (item: T) => string) {
  const expectedSet = new Set(expected.map(keyFn));
  const liveSet = new Set(live.map(keyFn));

  return {
    missingInLive: expected.filter((item) => !liveSet.has(keyFn(item))),
    extraInLive: live.filter((item) => !expectedSet.has(keyFn(item))),
  };
}

function grantKey(grant: Grant) {
  return [grant.grantee, grant.table_schema, grant.table_name, grant.privilege_type].join(":");
}

export function compareGrants(expected: Grant[], live: Grant[]) {
  return diffByKey(expected, live, grantKey);
}

function schemaPrivilegeKey(p: SchemaPrivilege) {
  return [p.grantee, p.schema_name, p.privilege_type].join(":");
}

export function compareSchemaPrivileges(expected: SchemaPrivilege[], live: SchemaPrivilege[]) {
  return diffByKey(expected, live, schemaPrivilegeKey);
}

function defaultPrivilegeKey(p: DefaultPrivilege) {
  return [p.grantor, p.grantee, p.schema_name, p.privilege_type].join(":");
}

export function compareDefaultPrivileges(expected: DefaultPrivilege[], live: DefaultPrivilege[]) {
  return diffByKey(expected, live, defaultPrivilegeKey);
}

export function findRolesMissingEverywhere(configured: string[], localExisting: string[], liveExisting: string[]) {
  const existing = new Set([...localExisting, ...liveExisting]);

  return configured.filter((role) => !existing.has(role));
}
