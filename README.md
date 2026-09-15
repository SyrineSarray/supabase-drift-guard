# supabase-drift-guard

A CI gate that compares live Postgres grants and exposed-schema privileges with the declarations reconstructed from repository migrations, then blocks releases on unexplained privilege drift.

## Why

Dashboard clicks, hotfixes, and one-off SQL can change who can `SELECT`, `INSERT`, or use a schema — without that change ever landing in `supabase/migrations`. Drift Guard reconstructs the expected privilege state from your migrations, compares it to production, and fails CI when they diverge.

## What it checks

| Scope | Roles | Privileges |
| --- | --- | --- |
| Tables in `public` | `anon`, `authenticated` | `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `REFERENCES`, `TRIGGER`, `TRUNCATE` |
| Exposed API schemas | `anon`, `authenticated` | `USAGE`, `CREATE` |

Exposed schemas are read from `supabase/config.toml`:

```toml
[api]
schemas = ["public", "graphql_public"]
```

If `api.schemas` is missing or empty, the tool falls back to `["public"]`.

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
```

## CI example

```yaml
# .github/workflows/drift-guard.yml
name: Privilege drift

on:
  pull_request:
  push:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Check privilege drift
        env:
          REMOTE_DATABASE_URL: ${{ secrets.REMOTE_DATABASE_URL }}
        run: npx supabase-drift-guard check .
```

The job needs Docker available on the runner (GitHub-hosted `ubuntu-latest` includes it). First runs may take longer while the local Supabase images pull.

## Limitations

- Table grants are scoped to the `public` schema only.
- Only `anon` and `authenticated` roles are compared.
- Expected state comes from applying repository migrations via local Supabase — migrations that never ran locally (or diverge from remote history) will surface as drift.
- Does not compare RLS policies, column grants, function/routine grants, or roles other than the two above.

## License

MIT
