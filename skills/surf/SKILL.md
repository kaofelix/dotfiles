---
name: surf
description: >
  Browser automation CLI for basic navigation, reading pages, clicking elements, and taking screenshots.
  Use for day-to-day web browsing tasks like navigating to URLs, reading page content, clicking buttons,
  filling forms, and capturing screenshots. Trigger with phrases like "go to", "browse", "click", "take screenshot",
  "read page", or when the user wants to interact with web pages through the browser.
---

# Surf - Basic Browser Automation

CLI for AI agents to control Chrome. Zero config, agent-agnostic. Use for day-to-day web browsing tasks.

## Prerequisites

**Required**:
- **surf CLI**: Installed globally (`npm install -g surf-cli`)
- **Chrome Extension**: Loaded and installed native host
- **Extension ID**: Known to user (from `chrome://extensions`)

**First-Time Setup** (humans run once):
```bash
# Install globally
npm install -g surf-cli

# Load extension in Chrome
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Paste path from: surf extension-path

# Install native host (copy extension ID from chrome://extensions)
surf install <extension-id>

# Restart Chrome and test
surf tab.list
```

**Verify Installation**:
```bash
surf tab.list  # Should show open tabs
```

## Basic Navigation

### Go to URL
```bash
surf go "https://example.com"
# or
surf navigate "https://example.com"
```

### Navigate History
```bash
surf back          # Go back
surf forward       # Go forward
surf tab.reload    # Reload current page
```

## Reading Pages

### Read Page Content
```bash
surf read              # Accessibility tree + visible text (AI-optimized)
surf read --no-text    # Accessibility tree only (no text content)
surf page.text         # Raw text content only
surf page.state        # Modals, loading state, scroll position
```

**Output**: Accessibility tree with element refs (`e1`, `e2`, `e3`...) for reliable element selection.

### Find Text in Page
```bash
surf search "login"    # Find text
# or
surf find "login"
```

## Interaction

### Click Elements
```bash
surf click e5                       # Click by element ref (from `surf read`)
surf click --selector ".btn"        # Click by CSS selector
surf click 100 200                  # Click by coordinates (x y)
```

### Type Text
```bash
surf type "hello world"             # Type at current cursor position
surf type "hello" --submit          # Type and press Enter
surf type "email@example.com" --ref e12  # Type into specific element
```

### Keyboard Input
```bash
surf key Escape     # Press Escape key
surf key Enter      # Press Enter
```

### Scrolling
```bash
surf scroll                    # Scroll down (default direction)
surf scroll.top               # Scroll to top of page
surf scroll.bottom            # Scroll to bottom of page
```

## Screenshots

Screenshots are auto-resized to 1200px (saves tokens) by default.

### Capture Screenshot
```bash
surf screenshot                     # Save to /tmp/ with auto-resize
surf screenshot --full               # Full resolution
surf screenshot --fullpage           # Entire page
surf screenshot --output /tmp/shot.png  # Custom path
```

### Quick Save
```bash
surf snap       # Quick save to /tmp (alias for screenshot)
```

**Auto-capture**: Commands like `click`, `type`, and `scroll` automatically capture a screenshot after execution - no extra command needed.

## Tab Management

### List and Switch Tabs
```bash
surf tab.list              # List all tabs
surf tab.switch 123        # Switch to tab by ID
surf tab.close 123         # Close tab by ID
```

### Open New Tab
```bash
surf tab.new "https://example.com"
```

### Named Tabs (Optional Convenience)
```bash
surf tab.name "dashboard"           # Name current tab
surf tab.switch "dashboard"         # Switch by name
surf tab.named                      # List named tabs
```

## Window Isolation (Keep Your Browsing Separate)

Work in an isolated window without interfering with user's browsing:

```bash
# Create isolated window for agent
surf window.new "https://example.com"
# Returns: Window 123456 (tab 789)

# All subsequent commands target that window
surf click e5 --window-id 123456
surf read --window-id 123456
```

## Waiting

```bash
surf wait 2                    # Wait 2 seconds
surf wait.element ".loaded"    # Wait for element to appear
surf wait.network              # Wait for network idle
```

## Common Patterns

### Navigate and Read Page
```bash
surf go "https://example.com"
surf wait.load
surf read
surf screenshot
```

### Find and Click Element
```bash
surf read
surf search "login"
surf click e5      # Use element ref from read output
```

### Fill Simple Form
```bash
surf type "email@example.com" --ref e12
surf type "password123" --ref e13
surf type --submit  # Press Enter
surf wait.load
```

### Quick Check Multiple Tabs
```bash
surf tab.list
surf tab.switch 123
surf read
surf tab.switch 456
surf read
```

## Global Options

```bash
--window-id <id>    # Target specific window (isolate from your browsing)
--tab-id <id>       # Target specific tab
--json              # Output raw JSON
--no-screenshot     # Skip auto-screenshot after actions
--full              # Full resolution screenshots
--soft-fail         # Warn instead of error on restricted pages
```

## Aliases

| Alias | Command |
|-------|---------|
| `snap` | `screenshot` |
| `read` | `page.read` |
| `find` | `search` |
| `go` | `navigate` |

## Limitations

- Cannot automate `chrome://` pages or Chrome Web Store (Chrome restriction)
- First operation on new tab takes ~100-500ms (debugger attachment)
- Some operations on restricted pages return warnings instead of errors

## When to Use Advanced Commands

For advanced features like:
- AI queries (ChatGPT, Gemini, Perplexity without API keys)
- Network request capture and inspection
- Cookie, bookmark, and history management
- Device emulation, performance tracing
- Form automation, file uploads
- Tab groups, batch execution

See [references/REFERENCE.md](references/REFERENCE.md) for complete command reference.
