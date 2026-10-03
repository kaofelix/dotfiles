/**
 * Tavily Extension for Pi
 *
 * Provides web search and content extraction capabilities via Tavily API.
 * Requires TAVILY_API_KEY environment variable to be set.
 *
 * Tools provided:
 * - tavily_search: Search the web for information
 * - tavily_extract: Extract content from URLs
 */

import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

// Types matching @tavily/core SDK
interface TavilySearchResult {
	title: string;
	url: string;
	content: string;
	rawContent?: string;
	score: number;
	publishedDate: string;
}

interface TavilyImage {
	url: string;
	description?: string;
}

interface TavilySearchResponse {
	answer?: string;
	query: string;
	responseTime: number;
	images: TavilyImage[];
	results: TavilySearchResult[];
}

interface TavilyExtractResult {
	url: string;
	rawContent: string;
}

interface TavilyExtractFailedResult {
	url: string;
	error: string;
}

interface TavilyExtractResponse {
	results: TavilyExtractResult[];
	failedResults: TavilyExtractFailedResult[];
	responseTime: number;
}

interface TavilySearchOptions {
	searchDepth?: "basic" | "advanced";
	topic?: "general" | "news" | "finance";
	days?: number;
	maxResults?: number;
	includeImages?: boolean;
	includeImageDescriptions?: boolean;
	includeAnswer?: boolean;
	includeRawContent?: boolean;
	includeDomains?: string[];
	excludeDomains?: string[];
	maxTokens?: number;
}

// Lazy-loaded Tavily client
let tavilyClient: {
	search: (query: string, options?: TavilySearchOptions) => Promise<TavilySearchResponse>;
	extract: (urls: string[]) => Promise<TavilyExtractResponse>;
} | null = null;

function getClient() {
	if (!tavilyClient) {
		const apiKey = process.env.TAVILY_API_KEY;
		if (!apiKey) {
			throw new Error("TAVILY_API_KEY environment variable is not set. Get your API key at https://app.tavily.com");
		}
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { tavily } = require("@tavily/core");
		tavilyClient = tavily({ apiKey });
	}
	return tavilyClient;
}

// Format search results for display
function formatSearchResults(results: TavilySearchResult[], answer?: string): string {
	let output = "";

	if (answer) {
		output += `## Answer\n${answer}\n\n`;
	}

	output += "## Sources\n\n";
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		output += `### ${i + 1}. [${result.title}](${result.url})\n`;
		output += `${result.content}\n`;
		output += `*Score: ${result.score.toFixed(2)}*\n\n`;
	}

	return output;
}

// Format extract results for display
function formatExtractResults(results: TavilyExtractResult[], failedResults: TavilyExtractFailedResult[]): string {
	let output = "## Extracted Content\n\n";

	for (const result of results) {
		output += `### ${result.url}\n\n`;
		output += result.rawContent;
		output += "\n\n---\n\n";
	}

	if (failedResults.length > 0) {
		output += "## Failed Extractions\n\n";
		for (const failed of failedResults) {
			output += `- **${failed.url}**: ${failed.error}\n`;
		}
	}

	return output;
}

export default function tavilyExtension(pi: ExtensionAPI) {
	// Register tavily_search tool
	pi.registerTool({
		name: "tavily_search",
		label: "Tavily Search",
		description:
			"Search the web for information using Tavily's AI-powered search engine. Returns relevant results with content snippets, and optionally an AI-generated answer. Use this when you need current information from the web.",
		promptSnippet: "Search the web for current information",
		promptGuidelines: [
			"Use tavily_search when you need current information from the web.",
			"Set includeAnswer to true for a quick synthesized answer to factual queries.",
			"Use searchDepth 'advanced' for more thorough research on complex topics.",
			"Use topic 'news' for recent events and time-sensitive information.",
		],
		parameters: Type.Object({
			query: Type.String({
				description: "The search query to execute",
			}),
			searchDepth: Type.Optional(
				StringEnum(["basic", "advanced"] as const, {
					description:
						"Search depth: 'basic' for fast results, 'advanced' for more thorough content extraction (default: 'basic')",
				}),
			),
			topic: Type.Optional(
				StringEnum(["general", "news", "finance"] as const, {
					description: "Search topic category: 'general', 'news', or 'finance' (default: 'general')",
				}),
			),
			days: Type.Optional(
				Type.Number({
					description: "Number of days back for news topic (default: 7)",
				}),
			),
			maxResults: Type.Optional(
				Type.Number({
					description: "Maximum number of results to return (1-20, default: 5)",
					minimum: 1,
					maximum: 20,
					default: 5,
				}),
			),
			includeAnswer: Type.Optional(
				Type.Boolean({
					description: "Include AI-generated answer based on search results (default: false)",
				}),
			),
			includeRawContent: Type.Optional(
				Type.Boolean({
					description: "Include full HTML content of each result (default: false)",
				}),
			),
			includeDomains: Type.Optional(
				Type.Array(Type.String(), {
					description: "List of domains to specifically include in search results",
				}),
			),
			excludeDomains: Type.Optional(
				Type.Array(Type.String(), {
					description: "List of domains to exclude from search results",
				}),
			),
			includeImages: Type.Optional(
				Type.Boolean({
					description: "Include related image URLs in response (default: false)",
				}),
			),
			includeImageDescriptions: Type.Optional(
				Type.Boolean({
					description: "Include image descriptions (default: false)",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const client = getClient();

			try {
				const options: TavilySearchOptions = {
					maxResults: params.maxResults ?? 5, // Default to 5 results
				};
				if (params.searchDepth) options.searchDepth = params.searchDepth;
				if (params.topic) options.topic = params.topic;
				if (params.days !== undefined) options.days = params.days;
				if (params.maxResults !== undefined) options.maxResults = params.maxResults;
				if (params.includeAnswer !== undefined) options.includeAnswer = params.includeAnswer;
				if (params.includeRawContent !== undefined) options.includeRawContent = params.includeRawContent;
				if (params.includeDomains) options.includeDomains = params.includeDomains;
				if (params.excludeDomains) options.excludeDomains = params.excludeDomains;
				if (params.includeImages !== undefined) options.includeImages = params.includeImages;
				if (params.includeImageDescriptions !== undefined)
					options.includeImageDescriptions = params.includeImageDescriptions;

				const response: TavilySearchResponse = await client.search(params.query, options);

				const formatted = formatSearchResults(response.results, response.answer);

				return {
					content: [{ type: "text", text: formatted }],
					details: {
						query: response.query,
						resultCount: response.results.length,
						responseTime: response.responseTime,
						images: response.images,
						results: response.results,
						answer: response.answer,
					},
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Search failed: ${message}` }],
					isError: true,
					details: { error: message },
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("tavily_search "));
			text += theme.fg("muted", `"${args.query}"`);
			if (args.topic && args.topic !== "general") {
				text += theme.fg("dim", ` [${args.topic}]`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			if (result.isError) {
				return new Text(theme.fg("error", `✗ ${result.content[0]?.text || "Unknown error"}`), 0, 0);
			}

			const details = result.details as {
				resultCount?: number;
				responseTime?: number;
				answer?: string;
				results?: TavilySearchResult[];
			};

			// Compact: 3 results; Expanded: 10 results
			const compactLimit = 3;
			const expandedLimit = 10;

			const limit = expanded ? expandedLimit : compactLimit;
			const allResults = details?.results ?? [];
			const results = allResults.slice(0, limit);
			const count = details?.resultCount ?? 0;

			// Header line with count and time
			const headerText = `${count} ${count === 1 ? "result" : "results"} (${details?.responseTime?.toFixed(2) ?? "?"}s)`;
			let text = theme.fg("muted", headerText);

			// Content - show titles with scores
			for (const r of results) {
				text += `\n\n${theme.fg("accent", r.title)} ${theme.fg("dim", `(${r.score.toFixed(2)})`)}`;
				text += `\n${theme.fg("toolOutput", r.url)}`;
			}

			// Truncation hint at the end
			if (!expanded && allResults.length > compactLimit) {
				text += `\n\n${theme.fg("muted", `... (${allResults.length - compactLimit} more results, ${keyHint("expandTools", "to expand")})`)}`;
			}

			return new Text(text, 0, 0);
		},
	});

	// Register tavily_extract tool
	pi.registerTool({
		name: "tavily_extract",
		label: "Tavily Extract",
		description:
			"Extract and parse content from web URLs. Returns cleaned and structured content. Useful for reading articles, documentation, or any web content.",
		promptSnippet: "Extract content from web URLs",
		promptGuidelines: [
			"Use tavily_extract to read content from specific URLs.",
			"Provide multiple URLs (up to 20) for batch extraction.",
		],
		parameters: Type.Object({
			urls: Type.Array(Type.String(), {
				description: "List of URLs to extract content from (max 20)",
				minItems: 1,
				maxItems: 20,
			}),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const client = getClient();

			try {
				const response: TavilyExtractResponse = await client.extract(params.urls);

				const formatted = formatExtractResults(response.results, response.failedResults);

				return {
					content: [{ type: "text", text: formatted }],
					details: {
						successCount: response.results.length,
						failedCount: response.failedResults.length,
						responseTime: response.responseTime,
						results: response.results,
						failedResults: response.failedResults,
					},
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `Extraction failed: ${message}` }],
					isError: true,
					details: { error: message },
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("tavily_extract "));
			const urls = args.urls as string[];
			if (urls.length === 1) {
				text += theme.fg("muted", urls[0]);
			} else {
				text += theme.fg("muted", `${urls.length} URLs`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			if (result.isError) {
				return new Text(theme.fg("error", `✗ ${result.content[0]?.text || "Unknown error"}`), 0, 0);
			}

			const details = result.details as {
				successCount?: number;
				failedCount?: number;
				responseTime?: number;
				results?: TavilyExtractResult[];
				failedResults?: TavilyExtractFailedResult[];
			};

			// If all extractions failed, show as error
			if (details?.successCount === 0 && details?.failedCount && details.failedCount > 0) {
				const failed = details.failedResults ?? [];
				let text = theme.fg("error", `✗ All ${failed.length} URL${failed.length === 1 ? "" : "s"} failed`);
				for (const f of failed) {
					text += `\n${theme.fg("error", `  • ${f.url}: ${f.error}`)}`;
				}
				return new Text(text, 0, 0);
			}

			// Compact: 2 pages with 2 preview lines; Expanded: all content
			const compactPageLimit = 2;
			const compactLineLimit = 2;

			const allResults = details?.results ?? [];
			const count = details?.successCount ?? 0;

			// Header line with count and time
			let text = theme.fg("muted", `${count} ${count === 1 ? "page" : "pages"}`);
			if (details?.failedCount && details.failedCount > 0) {
				text += theme.fg("muted", " (") + theme.fg("error", `${details.failedCount} failed`) + theme.fg("muted", ")");
			}
			text += theme.fg("muted", ` (${details?.responseTime?.toFixed(2) ?? "?"}s)`);

			// Content
			const pageLimit = expanded ? Infinity : compactPageLimit;
			const lineLimit = expanded ? Infinity : compactLineLimit;
			const results = allResults.slice(0, pageLimit === Infinity ? undefined : pageLimit);

			let totalRemainingLines = 0;

			for (const r of results) {
				// URL as section header
				text += `\n\n${theme.fg("accent", r.url)}`;

				// Content
				const lines = r.rawContent.split("\n");
				const contentLines = lines.slice(0, lineLimit === Infinity ? undefined : lineLimit);
				for (const line of contentLines) {
					text += `\n${theme.fg("toolOutput", line)}`;
				}

				// Track remaining lines for this page
				if (lines.length > lineLimit) {
					totalRemainingLines += lines.length - lineLimit;
				}
			}

			// Truncation hint at the end
			if (!expanded) {
				const hints: string[] = [];
				if (totalRemainingLines > 0) {
					hints.push(`${totalRemainingLines} more lines`);
				}
				if (allResults.length > compactPageLimit) {
					hints.push(`${allResults.length - compactPageLimit} more pages`);
				}
				if (hints.length > 0) {
					text += `\n\n${theme.fg("muted", `... (${hints.join(", ")}, ${keyHint("expandTools", "to expand")})`)}`;
				}
			}

			// Show failed results with error styling (same pattern as successful)
			if (details?.failedResults && details.failedResults.length > 0) {
				for (const f of details.failedResults) {
					text += `\n\n${theme.fg("error", f.url)}`;
					text += `\n${theme.fg("error", f.error)}`;
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// Notify on session start
	pi.on("session_start", async (_event, ctx) => {
		if (!process.env.TAVILY_API_KEY) {
			ctx.ui.notify("Tavily: Set TAVILY_API_KEY to enable web search and extraction", "info");
		}
	});
}
