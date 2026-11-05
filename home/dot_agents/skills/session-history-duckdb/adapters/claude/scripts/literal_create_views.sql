-- Claude Code append-log views. Keep heterogeneous payloads as JSON.
-- Strict JSON parsing: incomplete/corrupt records must not silently disappear.
CREATE OR REPLACE VIEW claude_events AS
SELECT
  filename,
  ordinality AS event_ordinal,
  COALESCE(
    json_extract_string(json, '$.sessionId'),
    NULLIF(regexp_extract(filename, '/([^/]+)/subagents/[^/]+[.]jsonl$', 1), ''),
    regexp_extract(filename, '([^/]+)[.]jsonl$', 1)
  ) AS session_id,
  COALESCE(
    json_extract_string(json, '$.agentId'),
    NULLIF(regexp_extract(filename, '/subagents/agent-([^/]+)[.]jsonl$', 1), '')
  ) AS agent_id,
  regexp_extract(filename, '/projects/([^/]+)/', 1) AS project_group,
  json_extract_string(json, '$.type') AS event_type,
  json_extract_string(json, '$.uuid') AS event_id,
  json_extract_string(json, '$.parentUuid') AS parent_uuid,
  json_extract_string(json, '$.timestamp') AS event_timestamp,
  TRY_CAST(json_extract_string(json, '$.timestamp') AS TIMESTAMPTZ) AS event_time,
  json_extract_string(json, '$.cwd') AS cwd,
  json_extract_string(json, '$.gitBranch') AS git_branch,
  COALESCE(TRY_CAST(json_extract(json, '$.isSidechain') AS BOOLEAN), false) AS is_sidechain,
  COALESCE(TRY_CAST(json_extract(json, '$.isMeta') AS BOOLEAN), false) AS is_meta,
  COALESCE(TRY_CAST(json_extract(json, '$.isCompactSummary') AS BOOLEAN), false) AS is_compact_summary,
  json_extract(json, '$.message') AS message,
  json AS event
FROM read_json_objects(
  COALESCE(NULLIF(getenv('CLAUDE_SESSION_GLOB'), ''),
           getenv('HOME') || '/.claude/projects/**/*.jsonl'),
  format = 'newline_delimited', filename = true
) WITH ORDINALITY;

-- One row per file/stream, not per shared parent session ID.
CREATE OR REPLACE VIEW claude_sessions AS
SELECT
  filename, session_id, project_group,
  first(agent_id ORDER BY event_ordinal) FILTER (WHERE agent_id IS NOT NULL) AS agent_id,
  bool_or(is_sidechain) AS is_sidechain,
  first(cwd ORDER BY event_ordinal) FILTER (WHERE cwd IS NOT NULL) AS cwd,
  first(git_branch ORDER BY event_ordinal) FILTER (WHERE git_branch IS NOT NULL) AS git_branch,
  min(event_time) AS started_at,
  max(event_time) AS last_event_at,
  count(*) AS event_count
FROM claude_events
GROUP BY filename, session_id, project_group;

CREATE OR REPLACE VIEW claude_messages AS
SELECT
  * EXCLUDE (message, event),
  json_extract_string(message, '$.id') AS message_id,
  COALESCE(json_extract_string(message, '$.role'), event_type) AS role,
  json_extract_string(message, '$.model') AS model,
  json_extract(message, '$.content') AS content,
  json_extract(message, '$.usage') AS usage
FROM claude_events
WHERE event_type IN ('user', 'assistant');

-- Normalize scalar user strings and typed arrays without inferring a struct.
CREATE OR REPLACE VIEW claude_content AS
SELECT m.* EXCLUDE (content),
  TRY_CAST(part.key AS UBIGINT) AS content_index,
  json_extract_string(part.value, '$.type') AS content_type,
  part.value AS block
FROM claude_messages AS m,
  json_each(CASE WHEN json_type(content) = 'VARCHAR'
    THEN json_array(json_object('type', 'text', 'text', json_extract_string(content, '$')))
    WHEN json_type(content) = 'ARRAY' THEN content
    ELSE '[]'::JSON END) AS part;

CREATE OR REPLACE VIEW claude_conversation_full AS
SELECT filename, session_id, agent_id, event_ordinal, event_timestamp, event_time,
  event_id, parent_uuid, message_id, role, is_meta, is_compact_summary,
  string_agg(json_extract_string(block, '$.text'), chr(10) ORDER BY content_index) AS text
FROM claude_content
WHERE role IN ('user', 'assistant') AND content_type = 'text'
GROUP BY ALL;

CREATE OR REPLACE VIEW claude_conversation AS
SELECT * FROM claude_conversation_full
WHERE NOT is_meta AND NOT is_compact_summary;

CREATE OR REPLACE VIEW claude_tool_calls AS
SELECT filename, session_id, agent_id, event_ordinal, event_timestamp, event_id,
  content_index,
  json_extract_string(block, '$.id') AS tool_call_id,
  json_extract_string(block, '$.name') AS tool_name,
  json_extract(block, '$.input') AS tool_arguments,
  CAST(json_extract(block, '$.input') AS VARCHAR) AS tool_arguments_text
FROM claude_content
WHERE role = 'assistant' AND content_type = 'tool_use';

CREATE OR REPLACE VIEW claude_tool_results AS
SELECT filename, session_id, agent_id,
  event_ordinal AS result_ordinal, event_timestamp AS result_timestamp,
  event_id AS result_event_id, content_index AS result_content_index,
  json_extract_string(block, '$.tool_use_id') AS tool_call_id,
  COALESCE(TRY_CAST(json_extract(block, '$.is_error') AS BOOLEAN), false) AS is_error,
  json_extract(block, '$.content') AS result_content,
  CASE WHEN json_type(block, '$.content') = 'VARCHAR'
    THEN json_extract_string(block, '$.content')
    WHEN json_type(block, '$.content') = 'ARRAY' THEN (
      SELECT string_agg(json_extract_string(part.value, '$.text'), chr(10)
                        ORDER BY TRY_CAST(part.key AS UBIGINT))
      FROM json_each(json_extract(block, '$.content')) AS part
      WHERE json_extract_string(part.value, '$.type') = 'text'
    ) END AS result_text
FROM claude_content
WHERE role = 'user' AND content_type = 'tool_result';

CREATE OR REPLACE VIEW claude_tool_executions AS
SELECT calls.*, results.result_ordinal, results.result_timestamp,
  results.result_event_id, results.is_error, results.result_content, results.result_text
FROM claude_tool_calls AS calls
LEFT JOIN claude_tool_results AS results
  ON calls.filename = results.filename AND calls.tool_call_id = results.tool_call_id;

CREATE OR REPLACE VIEW claude_token_usage AS
SELECT filename, session_id, agent_id, event_ordinal, event_timestamp,
  event_id, message_id, model,
  TRY_CAST(json_extract_string(usage, '$.input_tokens') AS UBIGINT) AS input_tokens,
  TRY_CAST(json_extract_string(usage, '$.cache_read_input_tokens') AS UBIGINT) AS cache_read_input_tokens,
  TRY_CAST(json_extract_string(usage, '$.cache_creation_input_tokens') AS UBIGINT) AS cache_creation_input_tokens,
  TRY_CAST(json_extract_string(usage, '$.output_tokens') AS UBIGINT) AS output_tokens,
  usage
FROM claude_messages
WHERE role = 'assistant' AND usage IS NOT NULL AND json_type(usage) = 'OBJECT'
-- Claude may persist each response block separately with repeated/final usage.
-- Choose the latest usage-bearing record; scope IDs to the source file.
QUALIFY row_number() OVER (
  PARTITION BY filename,
    COALESCE(message_id, event_id, 'ordinal:' || CAST(event_ordinal AS VARCHAR))
  ORDER BY event_ordinal DESC
) = 1;
