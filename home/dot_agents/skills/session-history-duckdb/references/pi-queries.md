# Pi query recipes

- [Discovery first](#discovery-first)
- [Profile and inspect selected episodes](#profile-and-inspect-selected-episodes)
- [Selected tool and skill evidence](#selected-tool-and-skill-evidence)
- [Explicit JSON fallback](#explicit-json-fallback)

Run helper-view SQL from the project directory without changing it:

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
bash "$skill_dir/adapters/pi/scripts/query.sh" -box <<'SQL'
SELECT session_group, count(DISTINCT filename) AS files,
       min(event_timestamp) AS first_seen, max(event_timestamp) AS last_seen
FROM pi_messages GROUP BY session_group ORDER BY files DESC;
SQL
```

## Discovery first

Narrow to the requested project/time scope before searching. Aggregate matching
conversation or tool evidence **by filename** before loading payloads:

```sql
SELECT filename, count(*) AS matches,
       min(event_timestamp) AS first_match, max(event_timestamp) AS last_match
FROM pi_conversation
WHERE session_group = '--Users-alice-Code-project--'
  AND text ILIKE '%refactor%'
GROUP BY filename ORDER BY matches DESC LIMIT 20;

SELECT filename, count(*) AS matches, max(event_timestamp) AS last_match
FROM pi_tool_calls
WHERE session_group = '--Users-alice-Code-project--'
  AND tool_arguments_text ILIKE '%test%'
GROUP BY filename ORDER BY matches DESC LIMIT 20;
```

Select files, then preview bounded fragments and event IDs:

```sql
SELECT event_timestamp, event_id, role, left(text, 400) AS preview
FROM pi_conversation
WHERE filename = '/absolute/path/to/session.jsonl' AND text ILIKE '%refactor%'
ORDER BY event_timestamp LIMIT 20;
```

## Profile and inspect selected episodes

```sql
SELECT type, message.role AS role, count(*) AS n FROM pi_events
WHERE filename = '/absolute/path/to/session.jsonl' GROUP BY ALL;

SELECT role, item.type AS content_type, count(*) AS n
FROM pi_messages, UNNEST(content) AS u(item)
WHERE filename = '/absolute/path/to/session.jsonl' GROUP BY ALL;
```

After choosing the initiating request and surrounding exchange, count and read
the entire selected interval (timestamps below are examples):

```sql
SELECT count(*) AS rows, sum(length(text)) AS text_characters
FROM pi_conversation
WHERE filename = '/absolute/path/to/session.jsonl'
  AND event_timestamp >= TIMESTAMPTZ '2026-11-01 10:00:00+00'
  AND event_timestamp < TIMESTAMPTZ '2026-11-01 11:00:00+00';

SELECT event_timestamp, event_id, role, text FROM pi_conversation
WHERE filename = '/absolute/path/to/session.jsonl'
  AND event_timestamp >= TIMESTAMPTZ '2026-11-01 10:00:00+00'
  AND event_timestamp < TIMESTAMPTZ '2026-11-01 11:00:00+00'
ORDER BY event_timestamp;
```

For a whole selected file, use `adapters/pi/scripts/conversation-text.sh`.
`--include-skills` / `pi_conversation_full` retains invoked definitions when
the skill body is required evidence. Otherwise names remain as omission markers.

## Selected tool and skill evidence

```sql
SELECT call_timestamp, tool_call_id, tool_name, is_error,
       left(tool_arguments_text, 300) AS arguments_preview,
       left(result_text, 400) AS result_preview
FROM pi_tool_executions
WHERE filename = '/absolute/path/to/session.jsonl'
ORDER BY call_timestamp LIMIT 20;

SELECT call_timestamp, tool_name, tool_arguments, result_text
FROM pi_tool_executions
WHERE filename = '/absolute/path/to/session.jsonl'
  AND tool_call_id = 'chosen-call-id';
```

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

## Explicit JSON fallback

The legacy inferred views/helper can fail with `UNNEST requires a single list
or array as input` when a system message has scalar content. For that selected
file, run a **plain DuckDB process**, not the failing view wrapper. Keep the
full envelope as JSON and expand only known arrays:

```bash
PI_SESSION_FILE=/absolute/path/to/session.jsonl duckdb :memory: -box <<'SQL'
CREATE TEMP VIEW raw AS
SELECT json AS event, ordinality AS position
FROM read_json_objects(getenv('PI_SESSION_FILE'), format='newline_delimited')
WITH ORDINALITY;
CREATE TEMP VIEW blocks AS
SELECT r.*, json_extract_string(r.event, '$.message.role') AS role,
       p.key::BIGINT AS content_index, p.value AS block
FROM raw AS r,
json_each(CASE WHEN json_type(r.event, '$.message.content') = 'ARRAY'
  THEN json_extract(r.event, '$.message.content') ELSE '[]'::JSON END) AS p;

SELECT json_extract_string(event, '$.type') AS type,
       json_extract_string(event, '$.message.role') AS role,
       json_type(event, '$.message.content') AS content_shape, count(*) AS n
FROM raw GROUP BY ALL;
SELECT role, json_extract_string(block, '$.type') AS content_type, count(*) AS n
FROM blocks GROUP BY ALL;

CREATE TEMP VIEW conversation AS
SELECT position, json_extract_string(event, '$.timestamp') AS timestamp,
       json_extract_string(event, '$.id') AS event_id, role,
       regexp_replace(string_agg(json_extract_string(block, '$.text'), chr(10)
         ORDER BY content_index), '<skill name="([^"]+)"[^>]*>.*?</skill>',
         '[skill \1 omitted]', 'gs') AS text
FROM blocks
WHERE role IN ('user', 'assistant')
  AND json_extract_string(block, '$.type') = 'text'
GROUP BY ALL;
SELECT * FROM conversation ORDER BY position;
SQL
```

Count/bound the projection before reading a large file. Raw system/unknown
content remains in `raw`; tools are `blocks` of type `toolCall` and separate
`toolResult` messages linked by `message.toolCallId`. Retrieve the full skill
read result only when verifying its loaded version. See [pi-schema.md](pi-schema.md)
for the original view mappings; the fallback does not imply their inferred
nested types are safe for every producer version.
