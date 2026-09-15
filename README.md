# Supabase Drift Guard

Detect privilege drift between your Supabase repository migrations and the live Postgres database.

The tool rebuilds the expected database state from `supabase/migrations`, compares it with the live database, and fails when unexplained privilege differences are found.

## What it checks

Currently supported:

- Table grants for:
  - `anon`
  - `authenticated`
- Table privileges such as:
  - `SELECT`
  - `INSERT`
  - `UPDATE`
  - `DELETE`
  - `REFERENCES`
  - `TRIGGER`
  - `TRUNCATE`
- Exposed-schema privileges:
  - `USAGE`
  - `CREATE`

Exposed schemas are read from:

```toml
[api]
schemas = ["public", "graphql_public"]