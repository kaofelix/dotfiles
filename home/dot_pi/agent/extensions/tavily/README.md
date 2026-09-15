# Tavily Extension for Pi

This extension provides web search and content extraction capabilities via [Tavily](https://tavily.com/).

## Installation

1. Get your Tavily API key from [https://app.tavily.com](https://app.tavily.com) (1,000 free API credits per month)

2. Set your API key as an environment variable:
   ```bash
   export TAVILY_API_KEY="tvly-your-api-key"
   ```
   
   You can add this to your shell profile (e.g., `~/.zshrc`) for persistence.

3. Install dependencies (in this directory):
   ```bash
   cd ~/.pi/agent/extensions/tavily
   npm install
   ```

4. Reload pi with `/reload` or restart pi

## Tools

### `tavily_search`

Search the web for information using Tavily's AI-powered search engine.

**Parameters:**
- `query` (required): The search query
- `searchDepth`: `"basic"` or `"advanced"` - advanced retrieves more relevant content (default: basic)
- `topic`: `"general"`, `"news"`, or `"finance"` (default: general)
- `days`: Number of days back for news topic (default: 7)
- `maxResults`: Maximum results to return, 1-20 (default: 5)
- `includeAnswer`: Include AI-generated answer (default: false)
- `includeRawContent`: Include full HTML content (default: false)
- `includeDomains`: List of domains to include
- `excludeDomains`: List of domains to exclude
- `includeImages`: Include related image URLs (default: false)
- `includeImageDescriptions`: Include image descriptions (default: false)

**Example:**
```
Ask pi: "Search for the latest Swift 6 concurrency features"
```

### `tavily_extract`

Extract and parse content from web URLs.

**Parameters:**
- `urls` (required): List of URLs to extract (max 20)

**Example:**
```
Ask pi: "Extract the content from https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/"
```

## Credit Usage

- **Search (basic)**: 1 API credit per request
- **Search (advanced)**: 2 API credits per request
- **Extract**: 1 API credit per 5 successful extractions

Free tier includes 1,000 API credits per month. See [Tavily Pricing](https://docs.tavily.com/documentation/api-credits) for details.
