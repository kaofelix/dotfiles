# Session discovery for workflow archaeology

Run queries through the schema-loaded wrapper from `pi-sessions-duckdb`. Funnel from metadata to candidate sessions before loading complete transcripts.

## Inventory a broad scope

Start by understanding how work is distributed across projects and time.

```sql
SELECT
  session_group,
  COUNT(DISTINCT filename) AS sessions,
  COUNT(*) FILTER (WHERE role = 'user') AS user_messages,
  MIN(event_timestamp) AS first_activity,
  MAX(event_timestamp) AS last_activity
FROM pi_conversation
WHERE CAST(event_timestamp AS TIMESTAMP) >= NOW() - INTERVAL '90 days'
GROUP BY session_group
ORDER BY sessions DESC;
```

Adjust the time or project boundary to the request. An all-history search can still begin with an inventory rather than unbounded payload extraction.

## Find candidate episodes from user language

Derive terms from the suspected intent and the user's own vocabulary. Aggregate by session before opening messages.

```sql
SELECT
  filename,
  COUNT(*) AS matching_messages,
  MIN(event_timestamp) AS first_match,
  MAX(event_timestamp) AS last_match
FROM pi_conversation
WHERE role = 'user'
  AND (
    text ILIKE '%discuss%before%implement%'
    OR text ILIKE '%plan%before%edit%'
    OR text ILIKE '%don%implement%yet%'
  )
GROUP BY filename
ORDER BY last_match DESC;
```

Literal terms are discovery signals, not the workflow definition. Add related artifacts, tools, corrections, and outcomes to recover episodes using different language.

## Preview bounded matching messages

```sql
SELECT
  filename,
  event_timestamp,
  left(replace(text, chr(10), ' '), 600) AS message_preview
FROM pi_conversation
WHERE role = 'user'
  AND filename IN (<candidate filenames>)
  AND text ILIKE '%<signal>%'
ORDER BY event_timestamp;
```

Use previews to select sessions, then read every text row from the compact transcript for each selected session.

## Discover recurring tool or artifact sequences

Start with aggregate tool counts for a scoped corpus:

```sql
SELECT
  filename,
  tool_name,
  COUNT(*) AS calls,
  COUNT(*) FILTER (WHERE is_error) AS errors
FROM pi_tool_executions
WHERE filename IN (<scoped filenames>)
GROUP BY filename, tool_name
ORDER BY filename, calls DESC;
```

Search `tool_arguments_text` for recurring artifacts, commands, paths, or delegated roles only after the aggregate identifies a plausible pattern.

Tool co-occurrence alone does not prove a workflow. Confirm shared intent, ordering, and decision boundaries in the conversation.

## Prioritize explicit corrections

User corrections often reveal tacit workflow rules. Build terms from the corpus rather than treating this illustrative query as sentiment analysis.

```sql
SELECT
  filename,
  event_timestamp,
  left(replace(text, chr(10), ' '), 600) AS correction_preview
FROM pi_conversation
WHERE role = 'user'
  AND filename IN (<scoped filenames>)
  AND (
    text ILIKE '%instead%'
    OR text ILIKE '%prefer%'
    OR text ILIKE '%too far%'
    OR text ILIKE '%don%do that%'
    OR text ILIKE '%before%'
  )
ORDER BY event_timestamp;
```

A correction can be high-value evidence even when unique, but inspect its context and seek successful contrasting episodes before turning it into a general rule.

## Build a broad candidate shortlist

For each proposed cluster, record:

- number of episodes and sessions;
- number of projects or contexts;
- successful and unsuccessful examples;
- explicit user corrections;
- repeated artifacts or tool sequences;
- likely package type;
- confidence that the episodes share one intent.

Do not rank by frequency alone. Prefer coherent, valuable workflows over generic actions that happen in every coding session.

## Scoped counterexamples and near-misses

After finding confirming episodes, deliberately search for:

- the same intent handled through a different process;
- similar language with a different intended outcome;
- user corrections that reject part of the candidate workflow;
- sessions where the workflow would have been inappropriate.

These determine branches and trigger boundaries. They are especially important before writing a model-invoked description.
