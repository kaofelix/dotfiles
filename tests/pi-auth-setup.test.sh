#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
script="$repo_root/bin/.local/bin/pi-auth-setup"
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

mkdir -p "$tmp_dir/agent" "$tmp_dir/bin"
cat > "$tmp_dir/bin/op" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$tmp_dir/bin/op"

marker="$tmp_dir/executed"
jq -n --arg key "!op read 'op://Secrets/test'; touch '$marker'" \
  '{test: {type: "api_key", key: $key}}' > "$tmp_dir/agent/auth.op.json"

if PATH="$tmp_dir/bin:$PATH" PI_CODING_AGENT_DIR="$tmp_dir/agent" \
  "$script" --check >/dev/null 2>&1; then
  echo "expected malformed command-backed key to be rejected" >&2
  exit 1
fi

if [[ -e "$marker" ]]; then
  echo "malformed command-backed key executed shell code" >&2
  exit 1
fi

echo "pi-auth-setup security test passed"
