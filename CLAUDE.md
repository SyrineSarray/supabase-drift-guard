## Project rules

These hold across the whole repo. They came out of a scoping/grilling session (see `docs/adr/` for anything promoted to an ADR) and exist so scope doesn't quietly creep.

- **Stay on the wedge: privilege drift only.** This tool compares Postgres *grants* (table privileges, schema privileges, default privileges) between live and migration-reconstructed state. RLS policies, column-level grants, and function/routine `EXECUTE` grants are deliberately out of scope — they're different catalogs with different risk shapes and belong to other tools (Security Advisor, Splinter, etc.), not bolt-ons here.
- **Deterministic rules only, no AI/heuristics.** Every check is a catalog query and a set-diff. Don't introduce fuzzy matching, LLM-based reconciliation, or pattern-guessing (e.g. "this looks like a risky migration") — if a case needs judgment, surface it to the user instead of guessing.
- **Fail loud, never silent.** If the tool can't establish ground truth — local Supabase won't start, migrations don't replay cleanly — that's a hard CI failure, not a skipped check or a best-effort guess. A gate that can pass without knowing the expected state isn't a gate.
- **Parameterized SQL, always.** Role lists, schema lists, and any other user/config-supplied values are passed as query parameters (`$1::text[]`, etc.), never string-interpolated into SQL.
- **Explained drift must stay visible.** Any allowlist/baseline mechanism for "known, accepted" drift warns loudly (and can go stale) rather than silencing a diff forever. "Explained once" should never mean "invisible forever."
- **New config defaults to current behavior.** When a new config surface is added (e.g. tracked roles), its default must reproduce today's hardcoded behavior exactly, so existing users see no change until they opt in.
- **Build for real use before reach.** This is OSS, not a commercial product — prioritize what's actually hit running this against real projects over speculative integrations, dashboards, or output formats for hypothetical consumers.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`SyrineSarray/supabase-drift-guard`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
