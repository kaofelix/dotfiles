#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
script="$repo_dir/bin/.local/bin/pi-auth-setup"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT

agent_dir="$test_dir/agent"
fake_bin="$test_dir/bin"
mkdir -p "$agent_dir" "$fake_bin"

cat > "$agent_dir/auth.op.json" <<'JSON'
{
  "deepseek": {
    "type": "api_key",
    "key": "!op read 'op://Secrets/Inference/deepseek'"
  }
}
JSON

cat > "$agent_dir/auth.json" <<'JSON'
{
  "deepseek": { "type": "api_key", "key": "old-key" },
  "openai-codex": { "type": "oauth", "access": "preserved-token" }
}
JSON

cat > "$fake_bin/op" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "read" ]]
[[ "$2" == "op://Secrets/Inference/deepseek" ]]
printf 'resolved-deepseek-key\n'
SH
chmod +x "$fake_bin/op"

PATH="$fake_bin:$PATH" PI_CODING_AGENT_DIR="$agent_dir" \
  "$script" >/dev/null

jq -e '
  .deepseek == {"type":"api_key", "key":"resolved-deepseek-key"} and
  .["openai-codex"] == {"type":"oauth", "access":"preserved-token"}
' "$agent_dir/auth.json" >/dev/null

[[ $(stat -f '%Lp' "$agent_dir/auth.json" 2>/dev/null || stat -c '%a' "$agent_dir/auth.json") == 600 ]]

echo "pi-auth-setup generation test passed"
