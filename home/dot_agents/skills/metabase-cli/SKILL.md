---
name: metabase-cli
description: Operate Metabase through the `mb` CLI. Use for authentication profiles; database metadata, schema sync, and field-value rescans; cards, dashboards, and collections; snippets, segments, measures, transforms, jobs, and settings; content search; Enterprise workspaces; or git sync. Trigger whenever the user asks to interact with Metabase from the terminal or invokes `mb`.
allowed-tools: Bash(mb:*), Read, Write, Edit, AskUserQuestion
---

# metabase-cli

Load the workflow content from the CLI:

```bash
mb skills get core      # start here — auth, flag conventions, every command group
mb skills list          # enumerate specialized skills bundled with this CLI version
mb skills get <name>    # load a specialized skill (workspace, transform, git-sync, …)
```

Don't drive Metabase by `curl`ing `/api/...` directly — the CLI handles auth profiles, retries, schema validation, and credential redaction.
