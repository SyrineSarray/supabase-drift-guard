# supabase-drift-guard

**A CI gate that blocks releases when live Postgres privileges drift from what your migrations declare.**

Dashboard clicks, hotfixes, and one-off SQL can change who can `SELECT`, `INSERT`, or use a schema, without that change ever landing in `supabase/migrations`. supabase-drift-guard reconstructs the expected privilege state from your migrations, compares it to production, and fails CI when they diverge.

## Contents

- [Quick start](#quick-start)
- [What it checks](#what-it-checks)
- [Configuration](#configuration)
- [Default privilege drift](#default-privilege-drift)
- [How it works](#how-it-works)
- [CLI reference](#cli-reference)
- [Example output](#example-output)
- [CI integration](#ci-integration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Limitations](#limitations)
- [License](#license)

## Quick start

```bash
REMOTE_DATABASE_URL="postgresql://postgres:...@db.<project-ref>.supabase.co:5432/postgres" \
  npx supabase-drift-guard check /path/to/your/supabase-project
```

Requirements:

- Node.js 18+
- [Docker](https://docs.docker.com/get-docker/) (the Supabase CLI needs it to run a local stack)
- A Supabase project with `supabase/migrations` and `supabase/config.toml`
- Network access to the live Postgres instance

The Supabase CLI runs via `npx`; no global install needed. To pin `supabase-drift-guard` as a dev dependency instead of running it ad hoc:

```bash
npm install -D supabase-drift-guard
```

Exit code `0` means no drift. Exit code `1` means drift was detected, or the check itself failed (bad config, unreachable database, local replay failure). See [CLI reference](#cli-reference) for full usage details.

## What it checks

| Scope | Roles | Privileges |
| --- | --- | --- |
| Tables in every exposed schema | `anon`, `authenticated` | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES`, `TRIGGER`, `TRUNCATE` |
| Exposed API schemas | `anon`, `authenticated` | `USAGE`, `CREATE` |
| Default privileges on future tables in exposed schemas, plus any global default | `anon`, `authenticated` | Whatever `ALTER DEFAULT PRIVILEGES` grants |

Roles shown as `anon`/`authenticated` are the defaults; see [Tracked roles](#tracked-roles) to track others.

## Configuration

### Exposed schemas

Read from `supabase/config.toml`, already part of any Supabase project:

```toml
[api]
schemas = ["public", "graphql_public"]
```

If `api.schemas` is missing or empty, the tool falls back to `["public"]`.

`supabase db pull` does **not** update this file, it only pulls database schema (tables, functions, etc.) into a migration. If you expose a new schema via the dashboard, add it to `api.schemas` here by hand, in the same change as any migration that touches it, otherwise this tool has no way to know the schema exists and silently skips checking every grant inside it.

### Tracked roles

By default only `anon` and `authenticated` are compared. To track additional or different roles (e.g. a custom API-facing role, or `service_role`), add a `drift-guard.config.json` **to the project being checked**: the `<project-path>` you pass to `check`, next to its `supabase/` folder, not to `supabase-drift-guard`'s own repo.

```
your-supabase-project/
├── supabase/
│   ├── config.toml
│   └── migrations/
└── drift-guard.config.json   ← lives here
```

```json
{
  "roles": ["anon", "authenticated", "service_role"]
}
```

If the file is absent, the tool behaves exactly as before: `anon` and `authenticated` only.

Role names are matched exactly as Postgres stores them. An unquoted `CREATE ROLE teacher` is folded to lowercase `teacher`, but a quoted `CREATE ROLE "Teacher"` keeps its case; list it as `"Teacher"` in the config. A configured role that exists in neither the local nor the live database fails the check with an error, since it's almost always a typo or case mismatch. A role that exists on only one side is fine: its grants show up as drift. `PUBLIC` is a pseudo-role, not a role, and can't be tracked. If unsure, check what Postgres actually stored:

```sql
SELECT rolname FROM pg_roles WHERE rolname ILIKE 'teacher';
```

## Default privilege drift

`ALTER DEFAULT PRIVILEGES` changes what a role automatically gets on *tables created later*. The tool reads `pg_default_acl` so a dashboard-applied default (e.g. "every future table gets `anon` `SELECT`") shows up as drift even though no table exists yet. A default set without `IN SCHEMA` (a global default, applying to every current and future schema) is reported as schema `*`.

Because a default privilege only applies to objects later created by the same role that set it, drift is compared per owning role too: the same grant owned by a different role is reported as drift. This assumes local (`supabase start`) and hosted migrations both apply as `postgres`; if your project applies migrations as a different role, default-privilege comparisons may be noisier than expected.

## How it works

1. Starts a local Supabase stack in the target project (`npx supabase start`) so migrations rebuild the expected database. If a local stack is already running, it is reused and left running afterwards.
2. Verifies the local database has applied exactly the migration files in `supabase/migrations`, no more and no less, and fails if not (see [Troubleshooting](#troubleshooting)).
3. Verifies every tracked role exists in at least one of the two databases, and fails if one exists in neither.
4. Reads table grants, schema privileges, and default privileges from that local DB.
5. Reads the same from the live database (`REMOTE_DATABASE_URL`).
6. Diffs the two sets:
   - **missing in live**: declared by migrations, absent in production
   - **extra in live**: present in production, not declared by migrations
7. Stops the local stack (only if the tool started it) and exits `0` (clean) or `1` (drift / error).

## CLI reference

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

## Example output

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

## CI integration

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

## Troubleshooting

### `Cannot connect to live database (REMOTE_DATABASE_URL)`

The tool tries the live connection first, before starting the local stack, so this fails within seconds. The most common causes:

- The CI secret was created but never given a real value, or still holds an old password. GitHub does not re-run a job when a secret changes, so re-run the job after updating it.
- The URL still contains the `[YOUR-PASSWORD]` placeholder copied from the dashboard (the tool reports this case explicitly).
- The password contains characters such as `@`, `#` or `/` that break URL parsing. Percent-encode them (`@` is `%40`, `#` is `%23`, `/` is `%2F`).

Copy the connection string from the Supabase dashboard (**Connect**) and paste the real database password into it.

### `local database does not match supabase/migrations`

The local Supabase database keeps its data volume between `supabase start`/`stop` runs, and only replays migrations when that volume is first created. If you added, deleted, or renamed a migration file since then, the local database no longer reflects your repository, so the tool refuses to use it as the expected state. Rebuild it, then re-run:

```bash
npx supabase db reset --local      # replays all migrations (wipes local data)
# or
npx supabase stop --no-backup      # wipes the volume; the next check starts fresh
```

This never happens on a fresh CI runner, only on machines with an existing local stack.

### `ADMIN option cannot be granted back to your own grantor` (SQLSTATE `0LP01`)

A migration generated by `supabase db pull` after creating a role in the dashboard can contain a statement like:

```sql
GRANT "Teacher" TO "postgres" WITH ADMIN OPTION;
```

It applied fine on the hosted project, but fails when replayed from a clean database, so `supabase start` or `db reset` fails. Remove `WITH ADMIN OPTION` (or the whole role-membership `GRANT`) from that migration, then rebuild the local database.

### `supabase start` fails with `schema "..." does not exist`

`supabase/config.toml` lists a schema under `[api] schemas` that no migration creates. PostgREST refuses to start until the schema exists. Add a migration that creates it (`CREATE SCHEMA ...`), or remove it from `api.schemas`.

## Development

```bash
npm run build              # typecheck + compile
npm test                   # fast, no Docker required (currently no unit tests)
npm run test:integration   # real Postgres, via testcontainers, requires Docker
```

`test:integration` runs `src/grants.ts`'s actual SQL (`aclexplode`, `pg_default_acl`, `has_schema_privilege`, `information_schema.role_table_grants`) against an ephemeral `postgres:15-alpine` container, covering missing/extra grants, schema privileges, default-privilege drift, configurable/custom roles, and the documented `GRANT ... TO PUBLIC` gap. It's a separate script from `npm test` on purpose, so the fast path stays Docker-free.

## Limitations

- Only `anon` and `authenticated` roles are compared by default (configurable; see [Tracked roles](#tracked-roles)).
- Expected state comes from applying repository migrations via local Supabase: migrations that never ran locally (or diverge from remote history) will surface as drift.
- Does not compare RLS policies, column grants, function/routine grants, or which schemas are exposed to the API: these are deliberately out of scope, not planned gaps. Exposed schemas in particular live in Supabase's platform configuration (Management API on hosted projects), not in Postgres itself, so if a schema is exposed via the dashboard without also being added to `supabase/config.toml`, this tool has no way to see it, only the tables/privileges within whatever schemas `config.toml` already declares are checked.
- `GRANT ... TO PUBLIC` (on tables, schemas, or default privileges) is invisible to every check: only grants to named roles are compared.
- `information_schema.role_table_grants` only surfaces grants visible to the connecting role (as grantor, grantee, or via role membership). This is transparent while `postgres` holds membership in every tracked role; if you track a custom role `postgres` doesn't belong to, some of its grants may go unseen.

## License

MIT
