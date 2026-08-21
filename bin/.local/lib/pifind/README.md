# pifind

`pifind` asks a one-shot Pi SDK agent to find saved Pi sessions, presents its ranked candidates in `fzf`, and resumes the selected session with `pi --session`.

```bash
pifind "where did I debug the OAuth callback?"
```

## How it works

1. A Pi SDK session runs in memory with extensions, skills, context files, and mutating tools disabled.
2. The agent searches compact user/assistant conversation text through the `pi-sessions-duckdb` skill's read-only DuckDB views.
3. A terminating tool captures and validates up to eight ranked candidates.
4. `fzf` displays each candidate's confidence, explanation, and evidence.
5. The selected JSONL path is validated beneath `~/.pi/agent/sessions` before launching Pi.

## Requirements

- `pi`, with a configured model and credentials
- Node.js 22.19 or newer
- DuckDB
- `fzf`
- The `pi-sessions-duckdb` skill at `~/.pi/agent/skills/pi-sessions-duckdb`

Install JavaScript dependencies from the dotfiles repository:

```bash
make pifind-deps
```

Override the DuckDB skill location when necessary:

```bash
PI_SESSIONS_DUCKDB_SKILL_DIR=/path/to/pi-sessions-duckdb pifind "query"
```

## Development

```bash
cd bin/.local/lib/pifind
npm test
```
