# Pi adapter

## Commands and scope

Run from the project directory; these absolute helper paths leave it unchanged:

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
bash "$skill_dir/adapters/pi/scripts/query.sh" -box <<'SQL'
SELECT filename, count(*) AS messages, min(event_timestamp), max(event_timestamp)
FROM pi_messages WHERE session_group = '--Users-alice-Code-project--'
GROUP BY filename;
SQL

bash "$skill_dir/adapters/pi/scripts/conversation-text.sh" /absolute/path/to/session.jsonl
```

Default storage: `$HOME/.pi/agent/sessions/**/*.jsonl`. The query wrapper loads
that root; filter `session_group` or filename in SQL. The transcript helper
reads only its supplied file. For a narrow standalone query use `PI_SESSION_FILE`
and the explicit JSON recipe in [pi-queries.md](pi-queries.md).

Read [pi-queries.md](pi-queries.md) for discovery-first SQL, profiling, episodes,
skill-load evidence, and tools; [pi-schema.md](pi-schema.md) for record shapes.

## Projection and identity

- `pi_events`: inferred raw events, filename, derived session ID/project group.
- `pi_messages`: message events, role, event identity and content.
- `pi_conversation`: user/assistant text with invoked skill definitions replaced
  by `[skill <name> omitted]`; `pi_conversation_full` or helper `--include-skills`
  retains skill bodies when the definition itself is evidence.
- `pi_tool_calls` / `pi_tool_results` / `pi_tool_executions`: embedded assistant
  calls joined to separate `toolResult` messages by filename and call ID.
  `tool_arguments_text` is the stable search projection for inferred arguments.

Order by event timestamp, then content position. This is stored event history,
not an active-leaf reconstruction after branches or compaction.

The legacy Pi views infer nested structs and use `ignore_errors=true`. Some
current Pi streams contain string-valued system-message content; this can make
DuckDB infer `message.content` as JSON and reject `UNNEST`. If that happens,
use the narrow explicit-JSON fallback in the query recipes, preserving system
and unknown events separately. This adapter limitation predates the merger;
it is not a reason to load broader payloads or silently omit records.
