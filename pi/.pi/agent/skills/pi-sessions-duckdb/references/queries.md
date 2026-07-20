# DuckDB queries for Pi sessions

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

### Text-only conversation

This is the default inspection projection. It retains user and assistant text in chronological order:

```sql
SELECT
  e.timestamp,
  e.message.role AS role,
  string_agg(item.text, chr(10) ORDER BY ordinality) AS text
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

The bundled `scripts/conversation-text.sh` runs this query and emits CSV.

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

Use this when the conversation references implementation work that needs verification:

```sql
SELECT event_timestamp, tool_name, tool_arguments
FROM pi_tool_calls
WHERE filename = '/absolute/path/to/session.jsonl'
ORDER BY event_timestamp;
```

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
