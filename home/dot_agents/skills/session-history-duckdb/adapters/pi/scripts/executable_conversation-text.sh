#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--include-skills] /absolute/path/to/session.jsonl"
  echo "Print compact user/assistant text as CSV; --include-skills retains skill bodies."
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
fi

view=pi_conversation
if [[ ${1:-} == --include-skills ]]; then
  view=pi_conversation_full
  shift
fi

if [[ $# -ne 1 || $1 != /* ]]; then
  usage >&2
  exit 2
fi

session_file=$1
if [[ $session_file == *[\*\?\[\]\{\}]* ]]; then
  echo "Expected one literal session path, not a glob: $session_file" >&2
  exit 2
fi
if [[ ! -f $session_file ]]; then
  echo "Session file not found: $session_file" >&2
  exit 1
fi

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PI_SESSION_GLOB=$session_file bash "$script_dir/query.sh" -csv -c "
SELECT event_timestamp AS timestamp, role, text
FROM $view
ORDER BY event_timestamp NULLS LAST, event_ordinal;
"
