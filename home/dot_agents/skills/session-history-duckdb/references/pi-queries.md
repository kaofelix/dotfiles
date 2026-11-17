# Pi query recipes

- [Discovery first](#discovery-first)
- [Profile and inspect selected episodes](#profile-and-inspect-selected-episodes)
- [Selected tool and skill evidence](#selected-tool-and-skill-evidence)
- [Raw JSON inspection](#raw-json-inspection)

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
PI_SESSION_GLOB="$HOME/.pi/agent/sessions/**/*.jsonl" \
  bash "$skill_dir/adapters/pi/scripts/query.sh" -box <<'SQL'
SELECT session_group, count(DISTINCT filename) AS files,
       min(timestamp) AS first_seen, max(timestamp) AS last_seen
FROM pi_events GROUP BY session_group ORDER BY files DESC;
SQL
```

## Discovery first

Narrow `PI_SESSION_GLOB` to the requested project/time scope before searching.
Use session headers to verify project identity:

```sql
SELECT filename, id AS recorded_session_id, cwd, timestamp AS started_at
FROM pi_events WHERE type = 'session' ORDER BY timestamp;
```

Aggregate matching conversation or tool evidence **by filename** before loading
payloads; replace the search terms with those relevant to the question:

```sql
SELECT filename, count(*) AS matches,
       min(event_timestamp) AS first_match, max(event_timestamp) AS last_match
FROM pi_conversation WHERE text ILIKE '%<search-term>%'
GROUP BY filename ORDER BY matches DESC LIMIT 20;

SELECT filename, count(*) AS matches, max(event_timestamp) AS last_match
FROM pi_tool_calls WHERE tool_arguments_text ILIKE '%<tool-search-term>%'
GROUP BY filename ORDER BY matches DESC LIMIT 20;
```

`tool_arguments_text` is JSON-escaped. For exact quoted or multiline text, search
the decoded string field instead of the serialized payload:

```sql
SELECT filename, event_ordinal, tool_call_id, tool_name
FROM pi_tool_calls
WHERE contains(json_extract_string(tool_arguments, '$.command'), '<exact-command-fragment>');
```

Set `PI_SESSION_GLOB` to a selected file, then preview bounded fragments:

```sql
SELECT event_ordinal, event_timestamp, event_id, role, left(text, 400) AS preview
FROM pi_conversation WHERE text ILIKE '%<search-term>%'
ORDER BY event_timestamp, event_ordinal LIMIT 20;
```

## Profile and inspect selected episodes

```sql
SELECT type, count(*) AS records FROM pi_events GROUP BY type;

SELECT role, json_type(content) AS content_shape, count(*) AS records
FROM pi_messages GROUP BY ALL;

SELECT role, content_type, count(*) AS blocks
FROM pi_content GROUP BY ALL;
```

After choosing the initiating request and surrounding exchange, count and read
the entire selected interval (timestamps below are examples):

```sql
SELECT count(*) AS rows, sum(length(text)) AS text_characters
FROM pi_conversation
WHERE event_timestamp >= TIMESTAMPTZ '2026-11-01 10:00:00+00'
  AND event_timestamp < TIMESTAMPTZ '2026-11-01 11:00:00+00';

SELECT event_ordinal, event_timestamp, event_id, role, text FROM pi_conversation
WHERE event_timestamp >= TIMESTAMPTZ '2026-11-01 10:00:00+00'
  AND event_timestamp < TIMESTAMPTZ '2026-11-01 11:00:00+00'
ORDER BY event_timestamp NULLS LAST, event_ordinal;
```

For a whole selected file, use `adapters/pi/scripts/conversation-text.sh`.
`--include-skills` / `pi_conversation_full` retains invoked definitions when
the skill body is required evidence. Otherwise names remain as omission markers.

## Selected tool and skill evidence

```sql
SELECT call_ordinal, call_timestamp, tool_call_id, tool_name, is_error,
       left(tool_arguments_text, 300) AS arguments_preview,
       left(result_text, 400) AS result_preview
FROM pi_tool_executions ORDER BY call_timestamp, call_ordinal LIMIT 20;

SELECT call_ordinal, call_timestamp, tool_name, tool_arguments,
       result_ordinal, is_error, result_content, result_text
FROM pi_tool_executions WHERE tool_call_id = 'chosen-call-id';
```

Add a filename predicate when querying several files; call IDs are file-local.
A result with null text can still contain images or other structured content.

For a skill retrospective, match the loaded body as well as the path. Aggregate
loads by filename first; omit the current retrospective session:

```sql
SELECT filename, count(*) AS loads, min(call_timestamp) AS first_load
FROM pi_tool_executions
WHERE tool_name = 'read'
  AND tool_arguments_text ILIKE '%/skills/example/SKILL.md%'
  AND result_text ILIKE '%distinctive version fingerprint%'
GROUP BY filename ORDER BY first_load;
```

## Raw JSON inspection

Use the same wrapper and selected scope for shapes not covered by the text/tool
projections. Profile content shapes before retrieving payloads:

```sql
SELECT type, json_type(message, '$.content') AS content_shape, count(*) AS records
FROM pi_events GROUP BY ALL;

SELECT filename, event_ordinal, id, event
FROM pi_events WHERE event_ordinal = 100;
```

Replace the ordinal with a selected record's position; add a filename predicate
when the scope contains several files. All fields, including system messages,
unknown event types, and unrecognized content shapes, remain in `event` JSON.
Use `json_extract_string` for scalar text fields and `json_extract` for structured
values; see [pi-schema.md](pi-schema.md) for the projection mappings.
