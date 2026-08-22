-- Create convenience views for Pi session inspection and analytics.
--
-- Usage:
--   duckdb pi_sessions.duckdb < scripts/create_views.sql
--
-- The underlying data is newline-delimited JSONL under ~/.pi/agent/sessions/**.

CREATE OR REPLACE VIEW pi_events AS
SELECT
  *,
  -- UUID at the end of the file name (matches how Pi names session files)
  regexp_extract(filename, '([0-9a-f\\-]{36})\\.jsonl$', 1) AS session_id,
  -- Folder name under sessions/, e.g. "--Users-alice-Code-myproj--"
  regexp_extract(filename, '/sessions/([^/]+)/', 1) AS session_group
FROM read_json_auto(
  getenv('HOME') || '/.pi/agent/sessions/**/*.jsonl',
  format='newline_delimited',
  filename=true,
  ignore_errors=true
);

-- Only the message events.
CREATE OR REPLACE VIEW pi_messages AS
SELECT
  session_id,
  session_group,
  filename,
  id AS event_id,
  timestamp AS event_timestamp,
  message.role AS role,
  message.timestamp AS message_timestamp,
  message.content AS content
FROM pi_events
WHERE type = 'message';

-- User and assistant conversational text, excluding other content shapes by projection.
CREATE OR REPLACE VIEW pi_conversation_full AS
SELECT
  session_id,
  session_group,
  filename,
  event_id,
  event_timestamp,
  role,
  string_agg(item.text, chr(10) ORDER BY ordinality) AS text
FROM pi_messages,
  UNNEST(content) WITH ORDINALITY AS u(item, ordinality)
WHERE
  role IN ('user', 'assistant')
  AND item.type = 'text'
GROUP BY
  session_id,
  session_group,
  filename,
  event_id,
  event_timestamp,
  role;

-- Compact conversation by default: retain invoked skill names without embedding their definitions.
CREATE OR REPLACE VIEW pi_conversation AS
SELECT
  * EXCLUDE (text),
  regexp_replace(
    text,
    '<skill name="([^"]+)"[^>]*>.*?</skill>',
    '[skill \1 omitted]',
    'gs'
  ) AS text
FROM pi_conversation_full;

-- Tool calls are embedded in assistant message content[] entries.
CREATE OR REPLACE VIEW pi_tool_calls AS
SELECT
  session_id,
  session_group,
  filename,
  timestamp AS event_timestamp,
  item.id AS tool_call_id,
  item.name AS tool_name,
  item.arguments AS tool_arguments,
  CAST(item.arguments AS VARCHAR) AS tool_arguments_text
FROM pi_events,
  UNNEST(message.content) AS u(item)
WHERE
  type = 'message'
  AND message.role = 'assistant'
  AND item.type = 'toolCall';

-- Tool results are separate message events linked to calls by toolCallId.
CREATE OR REPLACE VIEW pi_tool_results AS
SELECT
  session_id,
  session_group,
  filename,
  timestamp AS result_timestamp,
  message.toolCallId AS tool_call_id,
  message.toolName AS tool_name,
  message.isError AS is_error,
  string_agg(item.text, chr(10) ORDER BY ordinality) AS result_text
FROM pi_events,
  UNNEST(message.content) WITH ORDINALITY AS u(item, ordinality)
WHERE
  type = 'message'
  AND message.role = 'toolResult'
  AND item.type = 'text'
GROUP BY
  session_id,
  session_group,
  filename,
  timestamp,
  message.toolCallId,
  message.toolName,
  message.isError;

-- Calls joined to their results for execution and failure analysis.
CREATE OR REPLACE VIEW pi_tool_executions AS
SELECT
  calls.session_id,
  calls.session_group,
  calls.filename,
  calls.event_timestamp AS call_timestamp,
  results.result_timestamp,
  calls.tool_call_id,
  calls.tool_name,
  calls.tool_arguments,
  calls.tool_arguments_text,
  results.is_error,
  results.result_text
FROM pi_tool_calls AS calls
LEFT JOIN pi_tool_results AS results
  ON calls.filename = results.filename
  AND calls.tool_call_id = results.tool_call_id;
