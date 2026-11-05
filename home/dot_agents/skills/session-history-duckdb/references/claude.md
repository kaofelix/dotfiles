# Claude Code adapter

## Commands and scope

Run from the project directory; these absolute helper paths leave it unchanged:

```bash
skill_dir="$HOME/.agents/skills/session-history-duckdb"
CLAUDE_SESSION_GLOB="$HOME/.claude/projects/<project>/*.jsonl" \
  bash "$skill_dir/adapters/claude/scripts/query.sh" -box <<'SQL'
SELECT filename, session_id, agent_id, started_at, last_event_at, event_count
FROM claude_sessions ORDER BY started_at;
SQL

bash "$skill_dir/adapters/claude/scripts/conversation-text.sh" /absolute/path/to/session.jsonl
```

Replace `<project>` with a discovered directory. `CLAUDE_SESSION_GLOB` accepts
one absolute file or DuckDB glob. Default: `$HOME/.claude/projects/**/*.jsonl`;
use an explicit glob for nonstandard Claude storage. `*.jsonl` selects top-level
files; `**/*.jsonl` includes subagents. Main files are usually `<session>.jsonl`,
children `<session>/subagents/agent-<id>.jsonl`.

Read [claude-queries.md](claude-queries.md) for the discovery-first funnel,
profiling, bounded episodes, tools, subagents, compaction, and usage. Read
[claude-schema.md](claude-schema.md) when those records' meanings matter.

## Projection and identity

- `claude_events`: raw `event` JSON, filename, event ID/parent UUID, append
  position, timestamps, flags, project metadata, session/agent IDs.
- `claude_sessions`: per source stream (filename), not per parent session ID.
  Children may share `session_id` with their parent; scope tool joins by file.
- `claude_messages` / `claude_content`: user/assistant records and normalized
  typed blocks. A `user` event can carry a tool result or injected context.
- `claude_conversation`: scalar strings and text blocks, omitting `isMeta` and
  `isCompactSummary`; `claude_conversation_full` retains those text messages.
  The helper's `--include-context` selects full text, not thinking or tools.
  Unflagged notifications and command output can still remain.
- `claude_tool_calls` / `claude_tool_results` / `claude_tool_executions`: JSON
  inputs, searchable input text, joined results, error flags and raw content.
- `claude_token_usage`: latest usage-bearing record per assistant message ID
  within each file; assistant block counts are not response counts.

If a selected child's text lacks its completion report, follow the
[handback recipe](claude-queries.md#child-completion-reports) before concluding
that the work was unfinished.

Order a transcript by `event_ordinal` (and `content_index` inside a record).
This is append history, not active-branch reconstruction. For resumes/forks or
compaction interpretation, inspect parent links and system boundaries; copied
history can duplicate work across files. Keep token cache categories separate.

Parsing is strict: malformed/actively truncated JSON fails rather than silently
losing records. A missing tool result or image-only result text is not proof of
failure; inspect raw `result_content` when needed.
