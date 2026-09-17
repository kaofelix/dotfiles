# DuckDB queries for Codex rollouts

Run these against the helper views:

```bash
bash ./scripts/query.sh -box <<'SQL'
SELECT COUNT(DISTINCT session_id) AS sessions FROM codex_sessions;
SQL
```

Restrict loading by setting `CODEX_SESSION_GLOB` to an absolute file or glob.

## Inspect one session

```bash
export CODEX_SESSION_GLOB=/absolute/path/to/rollout.jsonl
```

### Profile envelopes and payloads

```sql
SELECT event_type, payload_type, COUNT(*) AS n
FROM codex_events
GROUP BY ALL
ORDER BY n DESC, event_type, payload_type;
```

Profile message roles and content item types before extracting text:

```sql
SELECT
  role,
  json_extract_string(item.value, '$.type') AS content_type,
  COUNT(*) AS n
FROM codex_messages,
  json_each(content) AS item
GROUP BY ALL
ORDER BY role, content_type;
```

### Compact conversation

```sql
SELECT event_timestamp, role, phase, text
FROM codex_conversation
ORDER BY event_time NULLS LAST, event_ordinal NULLS LAST;
```

Use `codex_conversation_full` only when repository instructions or environment context are relevant evidence.

### Search conversation fragments

```sql
SELECT filename, event_timestamp, role, phase, text
FROM codex_conversation
WHERE text ILIKE '%DuckDB%'
ORDER BY event_time;
```

### Tool-use outline

```sql
SELECT
  call_timestamp,
  tool_namespace,
  tool_name,
  left(replace(tool_arguments_text, chr(10), ' '), 500) AS arguments_preview
FROM codex_tool_executions
ORDER BY call_timestamp, call_ordinal;
```

### Search tool arguments and outputs

```sql
SELECT filename, event_timestamp, tool_name, tool_arguments_text
FROM codex_tool_calls
WHERE tool_arguments_text ILIKE '%SKILL.md%'
ORDER BY event_time;
```

```sql
SELECT
  call_timestamp,
  tool_name,
  left(replace(result_text, chr(10), ' '), 500) AS result_preview
FROM codex_tool_executions
WHERE result_text ILIKE '%permission denied%'
ORDER BY call_timestamp;
```

### Collaboration activity

```sql
SELECT tool_name, COUNT(*) AS n
FROM codex_tool_calls
WHERE tool_name IN (
  'spawn_agent', 'send_message', 'followup_task',
  'wait_agent', 'interrupt_agent', 'list_agents'
)
GROUP BY tool_name
ORDER BY n DESC;
```

## Analyze across sessions

### Activity by working directory

```sql
SELECT cwd, COUNT(*) AS sessions, MIN(started_at) AS first_seen, MAX(started_at) AS last_seen
FROM codex_sessions
GROUP BY cwd
ORDER BY sessions DESC;
```

### Message totals

```sql
SELECT role, phase, COUNT(*) AS messages
FROM codex_messages
GROUP BY ALL
ORDER BY messages DESC;
```

### Tool calls by name

```sql
SELECT tool_namespace, tool_name, COUNT(*) AS calls
FROM codex_tool_calls
GROUP BY ALL
ORDER BY calls DESC;
```

### Per-session token totals

Token records are per response. Sum `usage` fields for totals; do not sum cumulative `thread_token_usage` snapshots.

```sql
SELECT
  session_id,
  SUM(input_tokens) AS input_tokens,
  SUM(cached_input_tokens) AS cached_input_tokens,
  SUM(output_tokens) AS output_tokens,
  SUM(reasoning_output_tokens) AS reasoning_tokens,
  SUM(total_tokens) AS total_tokens
FROM codex_token_usage
GROUP BY session_id
ORDER BY total_tokens DESC;
```

### Time range

```sql
SELECT COUNT(DISTINCT session_id) AS sessions
FROM codex_events
WHERE event_time >= NOW() - INTERVAL '7 days';
```

### Funnel a broad search

First identify candidate files:

```sql
SELECT filename, COUNT(*) AS matching_calls, MAX(event_time) AS last_match
FROM codex_tool_calls
WHERE tool_arguments_text ILIKE '%duckdb%'
GROUP BY filename
ORDER BY last_match DESC;
```

Then set `CODEX_SESSION_GLOB` to one selected file and inspect its bounded conversation or tool previews before loading full outputs.
