# Codex rollout schema

Local Codex sessions are newline-delimited JSON event streams under `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. This describes observed local rollout data; payload variants can change across Codex versions, so the bundled views retain every payload as DuckDB `JSON` and extract only stable fields.

## Event envelope

Common top-level fields:

- `timestamp` — ISO timestamp
- `type` — envelope type
- `ordinal` — event order when present
- `payload` — type-specific JSON object

`codex_events` also derives `filename`, `session_id`, and a parsed `event_time`.

## Session metadata

`type = 'session_meta'` describes a rollout. Common payload fields include:

- `id` or `session_id`
- `timestamp`, `cwd`, `source`, `originator`, `thread_source`
- `model_provider`, `cli_version`
- `git.branch`, `git.commit_hash`, `git.repository_url`

The filename ends in the session UUID and the containing folders encode the session date.

## Messages and conversation

Conversation records use `type = 'response_item'` and `payload.type = 'message'` (or occasionally `agent_message`). The payload commonly contains:

- `id`
- `role` — `user`, `assistant`, or `developer`
- `phase` — assistant phase such as `commentary` or `final`
- `content[]` — items such as `input_text` or `output_text`, each with `text`

Codex can persist repository instructions and environment metadata as an initial synthetic `user` message. `codex_conversation_full` retains it; `codex_conversation` removes a user message beginning with the recognized `# AGENTS.md instructions for` marker. Both projections exclude developer messages.

## Reasoning

Reasoning records are response items whose payload type is `reasoning`. They can contain encrypted content and summary items. The standard views do not expose reasoning. Inspect raw `payload` only when the user's question specifically requires available reasoning-summary evidence; never attempt to decrypt encrypted content.

## Tool calls and results

Tool calls are response items with either:

- `payload.type = 'custom_tool_call'`, usually using `input`
- `payload.type = 'function_call'`, usually using `arguments`

Both expose `call_id`, `name`, and sometimes `namespace`, `status`, or `id`. Arguments and custom inputs are strings, often containing JSON or source code.

Outputs are separate response items with `payload.type = 'custom_tool_call_output'` or `function_call_output`. They link back through `call_id`. `codex_tool_executions` joins calls to outputs by filename and call ID.

Collaboration operations such as `spawn_agent`, `send_message`, and `wait_agent` use function calls and therefore appear in the same tool views.

## Token usage

`type = 'token_usage_record'` carries identifiers plus usage objects. `codex_token_usage` projects the per-response `usage` values:

- `input_tokens`
- `cached_input_tokens`
- `cache_write_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`
- `total_tokens`

The payload may also include cumulative `turn_token_usage` and `thread_token_usage`; query those from the raw JSON when cumulative values are required.

## Other envelopes

Rollouts can include `event_msg`, `turn_context`, `world_state`, `compacted`, and inter-agent metadata. Their shapes vary and some duplicate higher-level information already present in response items. Query them through `codex_events` when necessary instead of adding them to the default transcript.
