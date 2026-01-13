# Surf - Advanced Command Reference

Complete reference for all advanced surf commands beyond basic navigation and screenshotting.

## AI Queries (No API Keys)

Query AI models using your browser's logged-in session - no API keys, no rate limits, no cost.

### ChatGPT
```bash
surf chatgpt "explain this code"
surf chatgpt "summarize" --with-page        # Include page context
surf chatgpt "analyze" --model gpt-4o       # Specify model
surf chatgpt "review" --file code.ts         # Attach file
```

### Gemini
```bash
surf gemini "explain quantum computing"
surf gemini "summarize" --with-page                           # Include page context
surf gemini "analyze" --file data.csv                         # Attach file
surf gemini "a robot surfing" --generate-image /tmp/robot.png # Generate image
surf gemini "add sunglasses" --edit-image photo.jpg --output out.jpg  # Edit image
surf gemini "summarize" --youtube "https://youtube.com/..."   # YouTube analysis
surf gemini "hello" --model gemini-2.5-flash                  # Model selection
```

### Perplexity
```bash
surf perplexity "what is quantum computing"
surf perplexity "explain this page" --with-page      # Include page context
surf perplexity "deep dive" --mode research           # Research mode (Pro)
surf perplexity "latest news" --model sonar           # Model selection (Pro)
```

**Requires**: Being logged into chatgpt.com, gemini.google.com, or perplexity.ai in Chrome.

## Network Capture

Surf automatically captures all network requests while active. No explicit start needed.

### Overview (Token-Efficient)
```bash
surf network                       # Recent requests, compact table
surf network --urls                # Just URLs (minimal output)
surf network --format curl         # As curl commands
```

### Filtering
```bash
surf network --origin api.github.com  # Filter by origin/domain
surf network --method POST            # Only POST requests
surf network --type json              # Only JSON responses
surf network --status 4xx,5xx         # Only errors
surf network --since 5m               # Last 5 minutes
surf network --exclude-static         # Skip images/fonts/css/js
```

### Drill Down
```bash
surf network.get r_001           # Full request/response details
surf network.body r_001          # Response body (for piping to jq)
surf network.curl r_001          # Generate curl command
surf network.origins             # List captured domains
```

### Management
```bash
surf network.clear               # Clear captured data
surf network.stats               # Capture statistics
surf network.export              # Export captured requests
surf network.path                # Get file paths for request data
```

**Storage**: `/tmp/surf/` (override with `--network-path` or `SURF_NETWORK_PATH` env)
**Auto-cleanup**: 24 hours TTL, 200MB max

## Tab Management (Advanced)

### Tab Groups
```bash
surf tab.group --name "Work" --color blue        # Add to/create group
surf tab.ungroup                                 # Remove from group
surf tab.groups                                  # List all groups
```

### Tab Naming
```bash
surf tab.name "dashboard"         # Name current tab
surf tab.unname "dashboard"       # Unregister a named tab
surf tab.named                    # List all named tabs
```

## Window Management

Complete window isolation for agent work without disturbing user browsing.

### Window Commands
```bash
surf window.new "https://example.com"    # Create new browser window
surf window.list                         # List all browser windows
surf window.list --tabs                  # Include tab details
surf window.focus 123456                 # Bring window to front
surf window.close 123456                 # Close window
surf window.resize                       # Resize or reposition window
```

### Targeting Windows
All commands accept `--window-id <id>` to target a specific window:
```bash
surf read --window-id 123456
surf click e5 --window-id 123456
surf tab.new "https://other.com" --window-id 123456
```

## Waiting (Advanced)

```bash
surf wait.element ".loaded"    # Wait for element to appear
surf wait.network              # Wait for network idle
surf wait.url "/dashboard"     # Wait for URL pattern
surf wait.dom                  # Wait for DOM to stabilize
surf wait.load                 # Wait for page to fully load
```

## JavaScript Execution

```bash
surf js "return document.title"           # Execute JavaScript (return value shown)
surf js "document.querySelector('.btn').click()"  # Execute without return
```

## Scrolling (Advanced)

```bash
surf scroll.to              # Scroll element into view (needs selector/ref)
surf scroll.info            # Get scroll position info
```

## Cookie Management

```bash
surf cookie.list            # List all cookies for current tab's domain
surf cookie.get             # Get specific cookie by name
surf cookie.set             # Set a cookie (name, value, domain, etc.)
surf cookie.clear           # Clear cookies for current domain
```

## Bookmark Management

```bash
surf bookmark.add           # Bookmark current page
surf bookmark.remove        # Remove bookmark for current page
surf bookmark.list          # List bookmarks
```

## History

```bash
surf history.list           # Recent history
surf history.search "query" # Search history
```

## Dialog Handling

```bash
surf dialog.accept          # Accept current dialog (alert, confirm, prompt)
surf dialog.dismiss         # Dismiss current dialog
surf dialog.info            # Get current dialog info
```

## Device and Network Emulation

### Network Emulation
```bash
surf emulate.network slow3g  # Presets: offline, slow3g, fast3g, 4g
surf emulate.network custom --download 500 --upload 100 --latency 50
```

### CPU Throttling
```bash
surf emulate.cpu 4           # Rate >= 1 (1x = no throttling, 4x = 4x slower)
```

### Geolocation Override
```bash
surf emulate.geo             # Override geolocation (interactive prompts)
```

## Form Automation

```bash
surf form.fill               # Batch fill form fields (interactive mode)
```

### Example (type command with ref)
The `type` command with `--ref` uses `form.fill` internally for better modal/form support:
```bash
surf type "email@example.com" --ref e12
surf type "password" --ref e13
```

## Performance Tracing

```bash
surf perf.start              # Start performance trace
surf perf.stop               # Stop trace and get metrics
surf perf.metrics            # Get current performance metrics
```

## File Upload

```bash
surf upload                  # Upload file(s) to input (interactive)
```

## Iframe Handling

```bash
surf frame.list              # List all frames in page
surf frame.js                # Execute JS in specific frame
```

## Zoom and Window Resize

```bash
surf zoom                    # Get or set zoom level
surf resize                  # Resize browser window
```

## Batch Execution

Execute multiple commands in sequence:

```bash
surf batch                   # Run commands from stdin or file
```

### Example Batch File
```json
[
  {"tool": "navigate", "args": {"url": "https://example.com"}},
  {"tool": "wait.load"},
  {"tool": "page.read"},
  {"tool": "screenshot"}
]
```

```bash
cat batch.json | surf batch
```

## Dev Tools

```bash
surf console                 # Read console messages (logs, errors, warnings)
```

## Page Commands (Advanced)

```bash
surf page.read               # Accessibility tree + visible text (see basic)
surf page.text               # Raw text content only
surf page.state              # Modals, loading state, scroll position
```

## Search (Advanced)

```bash
surf search "term"           # Search for text in page
# or
surf find "term"
```

## Smoke Testing

```bash
surf smoke                   # Run smoke tests on URLs (config-driven)
```

## Health Checks

```bash
surf health                  # Wait for URL or element (configurable)
```

## Command Groups Reference

| Group | Commands |
|-------|----------|
| `ai` | `chatgpt`, `gemini`, `perplexity`, `ai` |
| `tab.*` | `list`, `new`, `switch`, `close`, `name`, `unname`, `named`, `group`, `ungroup`, `groups`, `reload` |
| `window.*` | `new`, `list`, `focus`, `close`, `resize` |
| `scroll.*` | `top`, `bottom`, `to`, `info` |
| `page.*` | `read`, `text`, `state` |
| `wait.*` | `element`, `network`, `url`, `dom`, `load` |
| `cookie.*` | `list`, `get`, `set`, `clear` |
| `bookmark.*` | `add`, `remove`, `list` |
| `history.*` | `list`, `search` |
| `dialog.*` | `accept`, `dismiss`, `info` |
| `emulate.*` | `network`, `cpu`, `geo` |
| `network.*` | `get`, `body`, `curl`, `origins`, `clear`, `stats`, `export`, `path` |
| `frame.*` | `list`, `js` |
| `perf.*` | `start`, `stop`, `metrics` |

## All Aliases

| Alias | Command |
|-------|---------|
| `snap` | `screenshot` |
| `read` | `page.read` |
| `find` | `search` |
| `go` | `navigate` |

## Help Commands

```bash
surf --help                    # Basic help
surf --help-full               # All 50+ commands
surf <command> --help          # Command details
surf --find <query>            # Search commands
surf --help-topic <topic>     # Topic guide (refs, selectors, cookies, batch, screenshots, automation)
```

## Topics for `--help-topic`

- `refs` - Understanding element references (e1, e2, etc.)
- `selectors` - CSS selector usage
- `cookies` - Cookie management details
- `batch` - Batch execution format
- `screenshots` - Screenshot options and formats
- `automation` - Automation patterns and workflows

## Script Mode

Run workflows from JSON files:

```bash
surf --script <file>          # Run workflow from JSON
surf --script <file> --dry-run
```

## Socket API

For programmatic integration, send JSON to `/tmp/surf.sock`:

```bash
echo '{"type":"tool_request","method":"execute_tool","params":{"tool":"tab.list","args":{}},"id":"1"}' | nc -U /tmp/surf.sock
```

## Environment Variables

- `SURF_NETWORK_PATH` - Custom path for network logs (default: `/tmp/surf`)

## Architecture

```
CLI (surf) → Unix Socket → Native Host → Chrome Extension → CDP/Scripting API
```

Surf uses Chrome DevTools Protocol for most operations, with automatic fallback to `chrome.scripting` API when CDP is unavailable (restricted pages, certain contexts). Screenshots fall back to `captureVisibleTab` when CDP capture fails.
