-- Read Pi event envelopes without inferring heterogeneous message/block structs.
-- PI_SESSION_GLOB accepts an absolute file or glob; the default includes children.
CREATE OR REPLACE VIEW pi_events AS
SELECT
  json AS event,
  filename,
  ordinality AS event_ordinal,
  json_extract_string(json, '$.type') AS type,
  json_extract_string(json, '$.id') AS id,
  json_extract_string(json, '$.parentId') AS parentId,
  try_cast(json_extract_string(json, '$.timestamp') AS TIMESTAMPTZ) AS timestamp,
  json_extract_string(json, '$.cwd') AS cwd,
  json_extract_string(json, '$.name') AS name,
  json_extract(json, '$.message') AS message,
  regexp_extract(filename, '([0-9a-f-]{36})\.jsonl$', 1) AS session_id,
  regexp_extract(filename, '/sessions/([^/]+)/', 1) AS session_group
FROM read_json_objects(
  coalesce(nullif(getenv('PI_SESSION_GLOB'), ''),
           getenv('HOME') || '/.pi/agent/sessions/**/*.jsonl'),
  format='newline_delimited', filename=true
) WITH ORDINALITY;

CREATE OR REPLACE VIEW pi_messages AS
SELECT
  session_id,
  session_group,
  filename,
  event_ordinal,
  id AS event_id,
  timestamp AS event_timestamp,
  message,
  json_extract_string(message, '$.role') AS role,
  json_extract(message, '$.timestamp') AS message_timestamp,
  json_extract(message, '$.content') AS content
FROM pi_events
WHERE type = 'message';

-- Scalar text is one block; arrays retain their original positions and types.
-- Other shapes remain available in pi_messages and the complete raw event JSON.
CREATE OR REPLACE VIEW pi_content AS
SELECT
  m.*,
  b.key::BIGINT AS content_index,
  b.value AS block,
  json_extract_string(b.value, '$.type') AS content_type
FROM pi_messages AS m,
json_each(CASE json_type(m.content)
  WHEN 'ARRAY' THEN m.content
  WHEN 'VARCHAR' THEN json_array(json_object(
    'type', 'text', 'text', json_extract_string(m.content, '$')))
  ELSE '[]'::JSON
END) AS b;

CREATE OR REPLACE VIEW pi_conversation_full AS
SELECT
  session_id,
  session_group,
  filename,
  event_ordinal,
  event_id,
  event_timestamp,
  role,
  string_agg(json_extract_string(block, '$.text'), chr(10)
             ORDER BY content_index) AS text
FROM pi_content
WHERE role IN ('user', 'assistant') AND content_type = 'text'
GROUP BY ALL;

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

CREATE OR REPLACE VIEW pi_tool_calls AS
SELECT
  session_id,
  session_group,
  filename,
  event_ordinal,
  content_index,
  event_timestamp,
  json_extract_string(block, '$.id') AS tool_call_id,
  json_extract_string(block, '$.name') AS tool_name,
  json_extract(block, '$.arguments') AS tool_arguments,
  cast(json_extract(block, '$.arguments') AS VARCHAR) AS tool_arguments_text
FROM pi_content
WHERE role = 'assistant' AND content_type = 'toolCall';

-- Keep results even when their payload has no text (e.g. image-only output).
CREATE OR REPLACE VIEW pi_tool_results AS
SELECT
  any_value(m.session_id) AS session_id,
  any_value(m.session_group) AS session_group,
  m.filename,
  m.event_ordinal AS result_ordinal,
  any_value(m.event_timestamp) AS result_timestamp,
  any_value(json_extract_string(m.message, '$.toolCallId')) AS tool_call_id,
  any_value(json_extract_string(m.message, '$.toolName')) AS tool_name,
  any_value(try_cast(json_extract(m.message, '$.isError') AS BOOLEAN)) AS is_error,
  any_value(m.content) AS result_content,
  string_agg(json_extract_string(c.block, '$.text'), chr(10)
             ORDER BY c.content_index) FILTER (WHERE c.content_type = 'text') AS result_text
FROM pi_messages AS m
LEFT JOIN pi_content AS c
  ON m.filename = c.filename AND m.event_ordinal = c.event_ordinal
  AND c.role = 'toolResult'
WHERE m.role = 'toolResult'
GROUP BY m.filename, m.event_ordinal;

CREATE OR REPLACE VIEW pi_tool_executions AS
SELECT
  calls.session_id,
  calls.session_group,
  calls.filename,
  calls.event_ordinal AS call_ordinal,
  calls.content_index AS call_content_index,
  calls.event_timestamp AS call_timestamp,
  results.result_ordinal,
  results.result_timestamp,
  calls.tool_call_id,
  calls.tool_name,
  calls.tool_arguments,
  calls.tool_arguments_text,
  results.is_error,
  results.result_content,
  results.result_text
FROM pi_tool_calls AS calls
LEFT JOIN pi_tool_results AS results
  ON calls.filename = results.filename
  AND calls.tool_call_id = results.tool_call_id;
