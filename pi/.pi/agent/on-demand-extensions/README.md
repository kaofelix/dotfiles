# On-Demand Extensions

Extensions in this folder are meant to be loaded on-demand via the `--extensions` flag, not added to `~/.pi/agent/settings.json`.

## Available Extensions

### auto-exit.ts
Exits pi automatically after the agent completes a single loop turn.

**Usage:**
```bash
pi --extensions ~/.pi/agent/on-demand-extensions/auto-exit.ts
```

**Example use cases:**
- Running pi from scripts that need it to exit after one turn
- Quick one-off tasks where you don't want to manually exit
- Automated workflows

## Creating New On-Demand Extensions

Add your extension file to this directory. It should export a default function that receives the `ExtensionAPI` and sets up event handlers.

See the [pi documentation](https://github.com/badlogic/pi/blob/main/docs/extensions.md) for more details on extension APIs.
