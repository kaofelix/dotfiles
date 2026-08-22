#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 [--include-skills] /absolute/path/to/session.jsonl" >&2
}

include_skills=false
if [[ ${1:-} == "--include-skills" ]]; then
  include_skills=true
  shift
fi

if [[ $# -ne 1 ]]; then
  usage
  exit 2
fi

session_file=$1

if [[ ! -f "$session_file" ]]; then
  echo "session file not found: $session_file" >&2
  exit 1
fi

text_expression="string_agg(item.text, chr(10) ORDER BY ordinality)"
if [[ $include_skills == false ]]; then
  text_expression="regexp_replace(
    $text_expression,
    '<skill name=\"([^\"]+)\"[^>]*>.*?</skill>',
    '[skill \\1 omitted]',
    'gs'
  )"
fi

PI_SESSION_FILE=$session_file duckdb -csv -c "
SELECT
  e.timestamp,
  e.message.role AS role,
  $text_expression AS text
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
"
