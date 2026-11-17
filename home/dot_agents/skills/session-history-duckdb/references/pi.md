# Pi adapter

## Commands and scope

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
PI_SESSION_GLOB="$HOME/.pi/agent/sessions/<project>/*.jsonl" \
  bash "$skill_dir/adapters/pi/scripts/query.sh" -box <<'SQL'
SELECT filename, count(*) AS messages, min(event_timestamp), max(event_timestamp)
FROM pi_messages GROUP BY filename;
SQL

bash "$skill_dir/adapters/pi/scripts/conversation-text.sh" /absolute/path/to/session.jsonl
```

Replace `<project>` with a discovered directory. `PI_SESSION_GLOB` accepts one
absolute file or DuckDB glob; default: `$HOME/.pi/agent/sessions/**/*.jsonl`.
Narrow it before loading selected evidence. Verify project identity using logged
`cwd` metadata rather than relying only on the encoded directory name.
The transcript helper reads only its supplied absolute file, overriding any
inherited glob; it rejects glob metacharacters in that argument.

Read [pi-queries.md](pi-queries.md) for discovery-first SQL, profiling, episodes,
skill-load evidence, tools, and raw JSON inspection; [pi-schema.md](pi-schema.md)
for record shapes, ordering, and parsing behavior.

## Projection and identity

- `pi_events`: complete `event` JSON, filename, scan-local event ordinal, derived
  session ID/project group, and common top-level fields. `message` is JSON.
- `pi_messages`: message events, role, event identity, raw `message` and `content`
  JSON. Scalar, array, and unknown content shapes remain available for profiling.
- `pi_content`: array blocks with zero-based `content_index`, raw `block` JSON,
  and `content_type`. Scalar string content becomes one text block; other
  non-array shapes remain in messages/raw events without synthesized blocks.
- `pi_conversation`: user/assistant text with invoked skill definitions replaced
  by `[skill <name> omitted]`; `pi_conversation_full` or helper `--include-skills`
  retains skill bodies when the definition itself is evidence. System messages,
  thinking, and tool payloads are outside both conversation projections.
- `pi_tool_calls` / `pi_tool_results` / `pi_tool_executions`: embedded assistant
  calls joined to separate `toolResult` messages by filename and call ID.
  `tool_arguments` is JSON; `tool_arguments_text` supports text searches.
  `result_content` preserves raw output, including image-only results with null
  `result_text`. A missing result is distinct from a result with no text.

Order by event timestamp, then `event_ordinal` and block position for ties.
Ordinals are scan-local; cite filenames/event IDs as well. These views describe
stored history, not the active leaf after branches or compaction.

Parsing is strict: malformed JSON anywhere in the selected glob stops the query
rather than silently losing records. Narrow the glob or use a stable copy and
retry when an active file is incomplete.
Unknown valid fields/types remain in `pi_events.event`. Inspect that JSON when
new producer records are not covered by the standard projections.
