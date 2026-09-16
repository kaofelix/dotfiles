---
name: codex-sessions-duckdb
description: Inspect local Codex rollout conversations and analyze session logs with DuckDB. Use when asked what happened in a Codex session, to recover or summarize user/assistant messages, find tool-call or collaboration evidence, or calculate session, token, message, and tool-use statistics from ~/.codex/sessions/**.
---

# Codex Sessions + DuckDB

Codex rollout files are JSONL event streams. Treat conversation inspection and cross-session analytics as separate branches, and start with the narrowest data that answers the request.

## Inspect one conversation

1. Resolve exactly one rollout file unless the request explicitly compares sessions. Use a supplied `.jsonl` path; otherwise search `~/.codex/sessions/**/*.jsonl` by date, session ID, working directory, or modification time. Identify the chosen file before drawing conclusions.
2. Profile event, payload, role, and content types using the queries in [references/queries.md](references/queries.md). This exposes unusual shapes before their payloads are omitted.
3. Extract the compact transcript:

   ```bash
   bash ./scripts/conversation-text.sh /absolute/path/to/rollout.jsonl \
     > /tmp/codex-conversation.csv
   ```

   This keeps user and assistant text, assistant phases, and event order while excluding developer messages, reasoning, tool traffic, and the synthetic user message that carries repository instructions and environment context.
4. Read every extracted row before summarizing. If the synthetic context message is relevant evidence, rerun with `--include-context`.
5. Broaden only when the transcript points to missing evidence. Query tool executions, reasoning summaries, token records, or raw events explicitly rather than loading every payload.

Completion criterion: every row in the selected transcript projection was inspected, and any omitted event class was loaded only when the question required it.

## Analyze sessions

Run SQL through the in-memory wrapper; it loads the bundled views automatically:

```bash
bash ./scripts/query.sh -box <<'SQL'
SELECT role, COUNT(*)
FROM codex_messages
GROUP BY role;
SQL
```

The main views are:

- `codex_events` — raw events with derived session ID and JSON payload
- `codex_sessions` — session metadata such as working directory, source, model provider, and Git context
- `codex_messages` — response message events
- `codex_conversation` — compact user/assistant transcript
- `codex_conversation_full` — transcript including synthetic repository/environment context
- `codex_tool_calls` — custom and function calls with searchable arguments
- `codex_tool_results` — outputs associated with tool-call IDs
- `codex_tool_executions` — calls left-joined to their outputs
- `codex_token_usage` — per-response token records

For a restricted set of files, set `CODEX_SESSION_GLOB` before running the wrapper. It accepts one absolute file or a DuckDB-compatible glob:

```bash
CODEX_SESSION_GLOB="$HOME/.codex/sessions/2026/09/**/*.jsonl" \
  bash ./scripts/query.sh -box <<'SQL'
SELECT COUNT(DISTINCT session_id) FROM codex_sessions;
SQL
```

Funnel broad investigations: aggregate matches by filename, select relevant sessions, preview bounded text, then load complete payloads only for those sessions.

## Schema and query guidance

- Read [references/schema.md](references/schema.md) when a payload shape or view mapping is unclear.
- Use [references/queries.md](references/queries.md) for profiling, transcript, tool, collaboration, token, project, and time-range examples.
- Prefer the views over inferred nested structs. They load `payload` as JSON so heterogeneous or newly added event shapes do not collapse schema inference.
- `~` is not expanded inside SQL. Use an absolute path, `getenv('HOME')`, or `CODEX_SESSION_GLOB`.
- Treat rollout logs as sensitive: keep excerpts scoped to the user's question and do not surface reasoning or unrelated prompt content.
