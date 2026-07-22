# DuckDB queries for Pi sessions

Queries over helper views can run without managing a database file:

```bash
bash ./scripts/query.sh -box <<'SQL'
SELECT COUNT(DISTINCT filename) AS sessions FROM pi_events;
SQL
```

## Inspect one session

Set the session path for one-off queries:

```bash
export PI_SESSION_FILE=/absolute/path/to/session.jsonl
```

### Profile roles and content types

Run both counts before extracting payloads:

```sql
SELECT type, message.role AS role, COUNT(*) AS n
FROM read_json_auto(
  getenv('PI_SESSION_FILE'),
  format='newline_delimited',
  ignore_errors=true
)
GROUP BY ALL
ORDER BY type, role;

SELECT message.role AS role, item.type AS content_type, COUNT(*) AS n
FROM read_json_auto(
  getenv('PI_SESSION_FILE'),
  format='newline_delimited',
  ignore_errors=true
), UNNEST(message.content) AS u(item)
WHERE type = 'message'
GROUP BY ALL
ORDER BY role, content_type;
```

### Compact conversation

This is the default inspection projection. It retains user and assistant text in chronological order and replaces embedded skill definitions with their names:

```sql
SELECT
  e.timestamp,
  e.message.role AS role,
  regexp_replace(
    string_agg(item.text, chr(10) ORDER BY ordinality),
    '<skill name="([^"]+)"[^>]*>.*?</skill>',
    '[skill \1 omitted]',
    'gs'
  ) AS text
FROM read_json_auto(
  getenv('PI_SESSION_FILE'),
  format='newline_delimited',
  ignore_errors=true
) AS e,
UNNEST(e.message.content) WITH ORDINALITY AS u(item, ordinality)
WHERE e.type = 'message'
  AND e.message.role IN ('user', 'assistant')
  AND item.type = 'text'
GROUP BY e.id, e.timestamp, e.message.role
ORDER BY e.timestamp;
```

The bundled script emits this projection as CSV:

```bash
bash ./scripts/conversation-text.sh "$PI_SESSION_FILE"
```

Include complete skill definitions only when they are evidence needed for the question:

```bash
bash ./scripts/conversation-text.sh --include-skills "$PI_SESSION_FILE"
```

With helper views, `pi_conversation` is compact and `pi_conversation_full` includes skill definitions.

### Search conversation fragments

After creating the helper views, search text without loading unrelated content:

```sql
SELECT event_timestamp, role, text
FROM pi_conversation
WHERE filename = '/absolute/path/to/session.jsonl'
  AND text ILIKE '%mailer%'
ORDER BY event_timestamp;
```

### User messages only

```sql
SELECT event_timestamp, text
FROM pi_conversation
WHERE filename = '/absolute/path/to/session.jsonl'
  AND role = 'user'
ORDER BY event_timestamp;
```

### Tool-use outline

Use a bounded outline when the conversation references implementation work that needs verification:

```sql
SELECT event_timestamp, tool_name, left(tool_arguments_text, 500) AS arguments_preview
FROM pi_tool_calls
WHERE filename = '/absolute/path/to/session.jsonl'
ORDER BY event_timestamp;
```

### Search tool arguments

`tool_arguments` retains DuckDB's inferred nested type, commonly `MAP(VARCHAR, JSON)`. Search the stable `VARCHAR` projection instead:

```sql
SELECT filename, event_timestamp, tool_name, tool_arguments
FROM pi_tool_calls
WHERE tool_arguments_text ILIKE '%emacsclient%SKILL.md%'
ORDER BY event_timestamp;
```

For a database created with an older version of `create_views.sql`, either recreate the views or cast at the query site:

```sql
WHERE CAST(tool_arguments AS VARCHAR) ILIKE '%emacsclient%SKILL.md%'
```

### Tool executions and failures

Calls and results are joined by tool-call ID:

```sql
SELECT
  call_timestamp,
  tool_name,
  is_error,
  left(tool_arguments_text, 500) AS arguments_preview,
  left(replace(result_text, chr(10), ' '), 500) AS result_preview
FROM pi_tool_executions
WHERE filename = '/absolute/path/to/session.jsonl'
ORDER BY call_timestamp;
```

Inspect failures without writing a separate correlator:

```sql
SELECT call_timestamp, tool_name, tool_arguments, result_text
FROM pi_tool_executions
WHERE filename = '/absolute/path/to/session.jsonl'
  AND is_error
ORDER BY call_timestamp;
```

## Funnel across sessions

### Find sessions that loaded a skill

```sql
SELECT
  filename,
  COUNT(*) AS loads,
  MIN(event_timestamp) AS first_load
FROM pi_tool_calls
WHERE tool_name = 'read'
  AND tool_arguments_text ILIKE '%/skills/emacsclient/SKILL.md%'
GROUP BY filename
ORDER BY first_load;
```

### Aggregate before loading payloads

```sql
SELECT
  filename,
  COUNT(*) AS matching_calls,
  MIN(event_timestamp) AS first_match,
  MAX(event_timestamp) AS last_match
FROM pi_tool_calls
WHERE tool_arguments_text ILIKE '%emacsclient%'
GROUP BY filename
ORDER BY last_match DESC;
```

Use the resulting filenames to inspect bounded previews, then load full `text`, `tool_arguments`, or `result_text` only for selected sessions.

## Analyze sessions with helper views

The remaining examples assume the views from `scripts/create_views.sql` exist.

### Overall message counts

```sql
SELECT role, COUNT(*) AS n
FROM pi_messages
GROUP BY 1
ORDER BY n DESC;
```

### Total tool calls

```sql
SELECT COUNT(*) AS tool_calls
FROM pi_tool_calls;
```

### Tool calls by tool name

```sql
SELECT tool_name, COUNT(*) AS n
FROM pi_tool_calls
GROUP BY 1
ORDER BY n DESC;
```

### Per-session totals (user + assistant messages)

```sql
SELECT
  session_id,
  SUM(role = 'user') AS user_msgs,
  SUM(role = 'assistant') AS assistant_msgs
FROM pi_messages
GROUP BY 1
ORDER BY assistant_msgs DESC;
```

### Per-session tool calls

```sql
SELECT session_id, COUNT(*) AS tool_calls
FROM pi_tool_calls
GROUP BY 1
ORDER BY tool_calls DESC;
```

### Filter by project/session group

`session_group` comes from the directory name under `~/.pi/agent/sessions/`.

```sql
SELECT role, COUNT(*)
FROM pi_messages
WHERE session_group LIKE '%Code-pi-mono%'
GROUP BY 1;
```

### Time range filtering

Event timestamps are ISO strings; cast to TIMESTAMP.

```sql
SELECT COUNT(*)
FROM pi_messages
WHERE CAST(event_timestamp AS TIMESTAMP) >= NOW() - INTERVAL '7 days';
```
