# supabase-drift-guard

A CI gate that compares live Postgres grants and exposed-schema privileges with the declarations reconstructed from repository migrations, then blocks releases on unexplained privilege drift.

## Why

Dashboard clicks, hotfixes, and one-off SQL can change who can `SELECT`, `INSERT`, or use a schema — without that change ever landing in `supabase/migrations`. Drift Guard reconstructs the expected privilege state from your migrations, compares it to production, and fails CI when they diverge.

## What it checks

| Scope | Roles | Privileges |
| --- | --- | --- |
| Tables in every exposed schema | `anon`, `authenticated` | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES`, `TRIGGER`, `TRUNCATE` |
| Exposed API schemas | `anon`, `authenticated` | `USAGE`, `CREATE` |
| Default privileges on future tables in exposed schemas (plus any global default) | `anon`, `authenticated` | Whatever `ALTER DEFAULT PRIVILEGES` grants |

Exposed schemas are read from `supabase/config.toml`:

```toml
[api]
schemas = ["public", "graphql_public"]
```

If `api.schemas` is missing or empty, the tool falls back to `["public"]`.

### Tracked roles

By default only `anon` and `authenticated` are compared. To track additional or different roles (e.g. a custom API-facing role, or `service_role`), add a `drift-guard.config.json` at your project root:

```json
{
  "roles": ["anon", "authenticated", "service_role"]
}
```

If the file is absent, the tool behaves exactly as before — `anon` and `authenticated` only.

### Default privilege drift

`ALTER DEFAULT PRIVILEGES` changes what a role automatically gets on *tables created later* — the tool reads `pg_default_acl` so a dashboard-applied default (e.g. "every future table gets `anon` `SELECT`") shows up as drift even though no table exists yet. A default set without `IN SCHEMA` (a global default, applying to every current and future schema) is reported as schema `*`.

Because a default privilege only applies to objects later created by the same role that set it, drift is compared per owning role too — the same grant owned by a different role is reported as drift. This assumes local (`supabase start`) and hosted migrations both apply as `postgres`; if your project applies migrations as a different role, default-privilege comparisons may be noisier than expected.

## How it works

1. Starts a local Supabase stack in the target project (`npx supabase start`) so migrations rebuild the expected database.
2. Reads table grants and schema privileges from that local DB.
3. Reads the same from the live database (`REMOTE_DATABASE_URL`).
4. Diffs the two sets:
   - **missing in live** — declared by migrations, absent in production
   - **extra in live** — present in production, not declared by migrations
5. Stops the local stack and exits `0` (clean) or `1` (drift / error).

## Requirements

- Node.js 18+
- [Docker](https://docs.docker.com/get-docker/) (used by the Supabase CLI)
- A Supabase project with `supabase/migrations` and `supabase/config.toml`
- Network access to the live Postgres instance

The Supabase CLI is invoked via `npx`; you do not need a global install.

## Install

```bash
npm install -D supabase-drift-guard
```

Or run without installing:

```bash
npx supabase-drift-guard check .
```

## Usage

```bash
REMOTE_DATABASE_URL="postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres" \
  npx supabase-drift-guard check /path/to/your/supabase-project
```

`<project-path>` must contain a `supabase/migrations` directory. Relative paths are resolved from the current working directory.

### Environment

| Variable | Required | Description |
| --- | --- | --- |
| `REMOTE_DATABASE_URL` | yes | Postgres connection string for the live database to compare against |

Use a connection string with enough privilege to read `information_schema` / catalog privilege views (typically the database password from the Supabase dashboard). Prefer a CI secret; do not commit the URL.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No privilege drift |
| `1` | Drift detected, missing config, or check failed |

### Example output

Clean:

```text
✓ No privilege drift detected
```

Drift:

```text
✗ PRIVILEGE DRIFT DETECTED

public.posts | anon | SELECT missing in live
public.comments | authenticated | INSERT extra in live
schema:public | anon | USAGE missing in live
default:public (owner postgres) | anon | SELECT extra in live
default:* (owner postgres) | authenticated | INSERT missing in live
```

## CI example

```yaml
# .github/workflows/drift-guard.yml
name: Grant Drift Check

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  grant-drift:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Supabase CLI
        run: npm install supabase

      - name: Run drift check
        env:
          REMOTE_DATABASE_URL: ${{ secrets.REMOTE_DATABASE_URL }}
        run: npx supabase-drift-guard check .
```

The job needs Docker available on the runner (GitHub-hosted `ubuntu-latest` includes it). First runs may take longer while the local Supabase images pull.

## Limitations

- Only `anon` and `authenticated` roles are compared by default (configurable — see [Tracked roles](#tracked-roles)).
- Expected state comes from applying repository migrations via local Supabase — migrations that never ran locally (or diverge from remote history) will surface as drift.
- Does not compare RLS policies, column grants, or function/routine grants — these are deliberately out of scope, not planned gaps.
- `GRANT ... TO PUBLIC` (on tables, schemas, or default privileges) is invisible to every check — only grants to named roles are compared.
- `getGrants`/`information_schema.role_table_grants` only surfaces grants visible to the connecting role (as grantor, grantee, or via role membership). This is transparent while `postgres` holds membership in every tracked role; if you track a custom role `postgres` doesn't belong to, some of its grants may go unseen.
- No integration tests run the actual Postgres queries against a live database — the SQL in `grants.ts` is exercised only by manual/CI runs, not the automated test suite.

## License

MIT
