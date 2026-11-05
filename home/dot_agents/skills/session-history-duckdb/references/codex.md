# Codex adapter

## Commands and scope

Run from the project directory; these absolute helper paths leave it unchanged:

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
CODEX_SESSION_GLOB="$HOME/.codex/sessions/2026/11/**/*.jsonl" \
  bash "$skill_dir/adapters/codex/scripts/query.sh" -box <<'SQL'
SELECT filename, session_id, started_at, cwd FROM codex_sessions;
SQL

bash "$skill_dir/adapters/codex/scripts/conversation-text.sh" /absolute/path/to/rollout.jsonl
```

`CODEX_SESSION_GLOB` accepts an absolute file or DuckDB glob; default:
`$HOME/.codex/sessions/**/*.jsonl`. Locate the requested project via `cwd` in
session metadata rather than assuming a directory per project.

Read [codex-queries.md](codex-queries.md) for discovery-first SQL, profiling,
episodes, tools, collaboration and usage; [codex-schema.md](codex-schema.md)
for envelope variants and interpretation.

## Projection and identity

- `codex_events`: raw `payload` JSON, envelope/payload types, filename, derived
  session ID, timestamps, nullable recorded ordinal.
- `codex_sessions`: `session_meta` metadata including cwd, provider and Git.
- `codex_messages`: response message events, with role, phase and JSON content.
- `codex_conversation`: user/assistant text including assistant phases, excluding
  developer messages and recognized synthetic repository/environment context.
  `codex_conversation_full` and helper `--include-context` retain that synthetic
  user text when it is evidence.
- `codex_tool_calls` / `codex_tool_results` / `codex_tool_executions`: function
  and custom calls joined by filename and call ID, with searchable arguments.
- `codex_token_usage`: per-response usage records, distinct from cumulative
  turn/thread snapshots in the raw payload.

Order by `event_time NULLS LAST, event_ordinal NULLS LAST`; nullable ordinals
limit tie resolution. Tool collaboration operations are ordinary function
calls in these views. Load their complete payloads only for selected evidence.

The adapter uses explicit JSON payloads and `ignore_errors=true`. For strict
completeness, validate the selected file with a strict JSON reader and account
for malformed lines. Use the schema reference for newly added payload types.
Encrypted reasoning cannot be recovered; available summaries remain separate
from the compact conversation.
