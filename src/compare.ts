import type { Grant } from "./grants.js";

function key(grant: Grant) {
  return [grant.grantee, grant.table_schema, grant.table_name, grant.privilege_type].join(":");
}

export function compareGrants(expected: Grant[], live: Grant[]) {
  const expectedSet = new Set(expected.map(key));
  const liveSet = new Set(live.map(key));

  const missingInLive = expected.filter((grant) => !liveSet.has(key(grant)));

  const extraInLive = live.filter((grant) => !expectedSet.has(key(grant)));

  return {
    missingInLive,
    extraInLive,
  };
}
