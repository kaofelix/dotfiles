#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

exec duckdb \
  -cmd ".read \"$script_dir/create_views.sql\"" \
  "$@" \
  :memory:
