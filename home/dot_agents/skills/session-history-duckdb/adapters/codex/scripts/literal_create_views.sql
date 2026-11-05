-- Convenience views for local Codex rollout inspection and analytics.
-- CODEX_SESSION_GLOB may be one absolute JSONL file or a DuckDB glob.

CREATE OR REPLACE VIEW codex_events AS
SELECT
  filename,
  regexp_extract(filename, '([0-9a-f-]{36})[.]jsonl$', 1) AS session_id,
  timestamp AS event_timestamp,
  TRY_CAST(timestamp AS TIMESTAMP) AS event_time,
  ordinal AS event_ordinal,
  type AS event_type,
  json_extract_string(payload, '$.type') AS payload_type,
  payload
FROM read_json(
  COALESCE(
    NULLIF(getenv('CODEX_SESSION_GLOB'), ''),
    getenv('HOME') || '/.codex/sessions/**/*.jsonl'
  ),
  format = 'newline_delimited',
  filename = true,
  ignore_errors = true,
  columns = {
    timestamp: 'VARCHAR',
    type: 'VARCHAR',
    payload: 'JSON',
    ordinal: 'UBIGINT'
  }
);

CREATE OR REPLACE VIEW codex_sessions AS
SELECT
  session_id,
  filename,
  COALESCE(
    json_extract_string(payload, '$.session_id'),
    json_extract_string(payload, '$.id'),
    session_id
  ) AS metadata_session_id,
  event_timestamp AS started_at,
  json_extract_string(payload, '$.cwd') AS cwd,
  json_extract_string(payload, '$.source') AS source,
  json_extract_string(payload, '$.originator') AS originator,
  json_extract_string(payload, '$.thread_source') AS thread_source,
  json_extract_string(payload, '$.model_provider') AS model_provider,
  json_extract_string(payload, '$.cli_version') AS cli_version,
  json_extract_string(payload, '$.git.branch') AS git_branch,
  json_extract_string(payload, '$.git.commit_hash') AS git_commit,
  json_extract_string(payload, '$.git.repository_url') AS git_repository
FROM codex_events
WHERE event_type = 'session_meta';

CREATE OR REPLACE VIEW codex_messages AS
SELECT
  session_id,
  filename,
  event_timestamp,
  event_time,
  event_ordinal,
  json_extract_string(payload, '$.id') AS message_id,
  json_extract_string(payload, '$.role') AS role,
  json_extract_string(payload, '$.phase') AS phase,
  json_extract(payload, '$.content') AS content
FROM codex_events
WHERE event_type = 'response_item'
  AND payload_type IN ('message', 'agent_message');

CREATE OR REPLACE VIEW codex_conversation_full AS
SELECT
  session_id,
  filename,
  event_timestamp,
  event_time,
  event_ordinal,
  message_id,
  role,
  phase,
  string_agg(
    json_extract_string(item.value, '$.text'),
    chr(10) ORDER BY TRY_CAST(item.key AS UBIGINT)
  ) AS text
FROM codex_messages,
  json_each(content) AS item
WHERE role IN ('user', 'assistant')
  AND json_extract_string(item.value, '$.type') IN ('input_text', 'output_text')
GROUP BY ALL;

-- Codex records repository instructions and environment context as a synthetic
-- user message before the actual request. Keep it available in the full view.
CREATE OR REPLACE VIEW codex_conversation AS
SELECT *
FROM codex_conversation_full
WHERE NOT (
  role = 'user'
  AND starts_with(text, '# AGENTS.md instructions for ')
);

CREATE OR REPLACE VIEW codex_tool_calls AS
SELECT
  session_id,
  filename,
  event_timestamp,
  event_time,
  event_ordinal,
  json_extract_string(payload, '$.id') AS item_id,
  json_extract_string(payload, '$.call_id') AS tool_call_id,
  json_extract_string(payload, '$.namespace') AS tool_namespace,
  json_extract_string(payload, '$.name') AS tool_name,
  json_extract_string(payload, '$.status') AS status,
  COALESCE(
    json_extract_string(payload, '$.arguments'),
    json_extract_string(payload, '$.input')
  ) AS tool_arguments_text
FROM codex_events
WHERE event_type = 'response_item'
  AND payload_type IN ('function_call', 'custom_tool_call');

CREATE OR REPLACE VIEW codex_tool_results AS
SELECT
  session_id,
  filename,
  event_timestamp AS result_timestamp,
  event_time AS result_time,
  event_ordinal AS result_ordinal,
  json_extract_string(payload, '$.id') AS item_id,
  json_extract_string(payload, '$.call_id') AS tool_call_id,
  json_extract_string(payload, '$.output') AS result_text
FROM codex_events
WHERE event_type = 'response_item'
  AND payload_type IN ('function_call_output', 'custom_tool_call_output');

CREATE OR REPLACE VIEW codex_tool_executions AS
SELECT
  calls.session_id,
  calls.filename,
  calls.event_timestamp AS call_timestamp,
  results.result_timestamp,
  calls.event_ordinal AS call_ordinal,
  results.result_ordinal,
  calls.tool_call_id,
  calls.tool_namespace,
  calls.tool_name,
  calls.status,
  calls.tool_arguments_text,
  results.result_text
FROM codex_tool_calls AS calls
LEFT JOIN codex_tool_results AS results
  ON calls.filename = results.filename
  AND calls.tool_call_id = results.tool_call_id;

CREATE OR REPLACE VIEW codex_token_usage AS
SELECT
  session_id,
  filename,
  event_timestamp,
  event_time,
  event_ordinal,
  json_extract_string(payload, '$.response_id') AS response_id,
  json_extract_string(payload, '$.root_turn_id') AS root_turn_id,
  json_extract_string(payload, '$.turn_id') AS turn_id,
  TRY_CAST(json_extract_string(payload, '$.usage.input_tokens') AS UBIGINT) AS input_tokens,
  TRY_CAST(json_extract_string(payload, '$.usage.cached_input_tokens') AS UBIGINT) AS cached_input_tokens,
  TRY_CAST(json_extract_string(payload, '$.usage.cache_write_input_tokens') AS UBIGINT) AS cache_write_input_tokens,
  TRY_CAST(json_extract_string(payload, '$.usage.output_tokens') AS UBIGINT) AS output_tokens,
  TRY_CAST(json_extract_string(payload, '$.usage.reasoning_output_tokens') AS UBIGINT) AS reasoning_output_tokens,
  TRY_CAST(json_extract_string(payload, '$.usage.total_tokens') AS UBIGINT) AS total_tokens
FROM codex_events
WHERE event_type = 'token_usage_record';
