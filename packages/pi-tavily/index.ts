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

import { SearchParams, ExtractParams, OutputSchema } from "./schemas.ts";
import { toolResult, errorResult } from "./output.ts";
import { searchOptions, extractOptions } from "./options.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { keyHint, type AgentToolResult } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

import type { TavilySearchResponse, TavilyExtractResponse } from "@tavily/core";
import { requestTavily, type RequestRunner } from "./transport.ts";

type TavilySearchResult = TavilySearchResponse["results"][number];
type TavilyImage = TavilySearchResponse["images"][number];
type TavilyExtractResult = TavilyExtractResponse["results"][number];
type TavilyExtractFailedResult = TavilyExtractResponse["failedResults"][number];

function getConfig(sessionId: string) {
	const apiKey = process.env.TAVILY_API_KEY;
	if (!apiKey) throw new Error("TAVILY_API_KEY environment variable is not set. Get your API key at https://app.tavily.com");
	return { apiKey, projectId: process.env.TAVILY_PROJECT, sessionId, clientName: "pi-tavily" };
}

type RenderMetadata = {
	usage?: TavilySearchResponse["usage"];
	requestId?: string;
	autoParameters?: TavilySearchResponse["autoParameters"];
	truncated?: boolean;
	fullOutputPath?: string;
	fullResponsePath?: string;
};

function resultText(result: AgentToolResult<unknown>) {
	return result.content.find(part => part.type === "text")?.text ?? "Unknown error";
}

function renderMetadata(result: AgentToolResult<unknown>, expanded: boolean) {
	const data = result.details as RenderMetadata | undefined;
	let text = data?.usage ? ` | ${data.usage.credits} credits` : "";
	if (data?.truncated) text += " | truncated";
	if (expanded && data?.requestId) text += `\nRequest: ${data.requestId}`;
	if (expanded && data?.autoParameters) text += `\nApplied auto parameters: ${JSON.stringify(data.autoParameters)}`;
	if (data?.fullOutputPath) text += `\nFull output: ${data.fullOutputPath}`;
	if (data?.fullResponsePath) text += `\nFull structured response: ${data.fullResponsePath}`;
	return text;
}

function formatImages(images: (TavilyImage | string)[]) {
	return images.map(image => typeof image === "string" ? `- ${image}` : `- ${image.url}${image.description ? ` — ${image.description}` : ""}`).join("\n");
}

// Format search results for display
export function formatSearchResults(results: TavilySearchResult[], answer?: string, images: TavilyImage[] = []): string {
	let output = "";

	if (answer) {
		output += `## Answer\n${answer}\n\n`;
	}

	output += "## Sources\n\n";
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		output += `### ${i + 1}. [${result.title}](${result.url})\n`;
		output += `${result.content}\n`;
		if (result.rawContent) output += `\n${result.rawContent}\n`;
		if (result.images?.length) output += `\nImages:\n${formatImages(result.images)}\n`;
		output += `*Score: ${result.score.toFixed(2)}*\n\n`;
	}

	if (images.length) {
		output += "## Images\n\n";
		output += formatImages(images) + "\n";
	}
	return output;
}

// Format extract results for display
function formatExtractResults(results: TavilyExtractResult[], failedResults: TavilyExtractFailedResult[]): string {
	let output = "## Extracted Content\n\n";

	for (const result of results) {
		output += `### ${result.title ? `[${result.title}](${result.url})` : result.url}\n\n`;
		output += result.rawContent;
		if (result.images?.length) output += `\n\nImages:\n${formatImages(result.images)}`;
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

export default function tavilyExtension(pi: ExtensionAPI, run: RequestRunner = requestTavily) {
	const namespace = {
		name: "tavily",
		description: "Web search and page extraction with source URLs and credit reporting",
		instructions: "Use tavily_search to discover sources and tavily_extract to read known URLs. " +
			"Codemode receives structured results: check status (success, partial, error) before using results. " +
			"Partial extraction retains successful pages; failedResults identifies URLs to retry without repeating successes. " +
			"Intent extraction with query returns selected chunks, not the complete page. " +
			"For truncated responses, read fullResponsePath for complete JSON or fullOutputPath for Markdown. " +
			"usage.credits reports Tavily credits, not model-token usage; zero may precede extraction billing thresholds. " +
			"Search costs 1 credit, or 2 for advanced; autoParameters can select advanced unless searchDepth is explicit. " +
			"Basic/advanced extraction costs 1/2 credits per 5 successful URLs. Cancellation cannot undo remote billing.",
	};
	// Register tavily_search tool
	pi.registerTool({
		name: "tavily_search",
		namespace,
		label: "Tavily Search",
		description:
			"Search the web for current information. Returns source snippets, optional cleaned full content, images and synthesized answers. Text and structured output are bounded to 50KB; text also to 2000 lines. Truncated responses include full-output file paths.",
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		promptSnippet: "Search the web for current information",
		promptGuidelines: [
			"Use tavily_search when you need current information from the web.",
			"Set includeAnswer to true for a quick synthesized answer to factual queries.",
			"Use searchDepth 'advanced' for more thorough research on complex topics.",
			"Use topic 'news' for recent events; timeRange or startDate/endDate also filter freshness for other topics.",
			"Use fast or ultra-fast for low-latency lookups; exactMatch matches quoted phrases exactly.",
			"autoParameters is opt-in and may choose advanced search (2 credits); explicit settings override inference.",
			"Read fullOutputPath or fullResponsePath when a response is truncated.",
		],
		parameters: SearchParams,
		outputSchema: OutputSchema,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const options = searchOptions(params);

				const response = await run({ operation: "search", input: params.query, options }, getConfig(ctx.sessionManager.getSessionId()), signal) as TavilySearchResponse;

				const formatted = formatSearchResults(response.results, response.answer, response.images);

				return await toolResult("search", response, formatted);
			} catch (error) {
				return errorResult("search", error);
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

		renderResult(result, { expanded }, theme, context) {
			if (context.isError) {
				return new Text(theme.fg("error", `✗ ${resultText(result)}`) + theme.fg("muted", renderMetadata(result, expanded)), 0, 0);
			}

			const details = result.details as {
				resultCount?: number;
				responseTime?: number;
				answer?: string;
				results?: TavilySearchResult[];
			};

			// Compact: 3 results; expanded: every returned source
			const compactLimit = 3;
			const expandedLimit = Infinity;

			const limit = expanded ? expandedLimit : compactLimit;
			const allResults = details?.results ?? [];
			const results = allResults.slice(0, limit);
			const count = details?.resultCount ?? 0;

			// Header line with count and time
			const headerText = `${count} ${count === 1 ? "result" : "results"} (${details?.responseTime?.toFixed(2) ?? "?"}s)`;
			let text = theme.fg("muted", headerText + renderMetadata(result, expanded));

			// Content - show titles with scores
			for (const r of results) {
				text += `\n\n${theme.fg("accent", r.title)} ${theme.fg("dim", `(${r.score.toFixed(2)})`)}`;
				text += `\n${theme.fg("toolOutput", r.url)}`;
			}

			// Truncation hint at the end
			if (!expanded && allResults.length > compactLimit) {
				text += `\n\n${theme.fg("muted", `... (${allResults.length - compactLimit} more results, ${keyHint("app.tools.expand", "to expand")})`)}`;
			}

			return new Text(text, 0, 0);
		},
	});

	// Register tavily_extract tool
	pi.registerTool({
		name: "tavily_extract",
		namespace,
		label: "Tavily Extract",
		description:
			"Read cleaned content from HTTP(S) URLs, optionally selecting relevant chunks with query. Text and structured output are bounded to 50KB; text also to 2000 lines. Truncated responses include full-output file paths.",
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		promptSnippet: "Extract content from web URLs",
		promptGuidelines: [
			"Use tavily_extract to read content from specific URLs.",
			"Provide multiple URLs (up to 20) for batch extraction.",
			"For focused reading, provide query and chunksPerSource; omit query when the entire page is needed.",
			"Advanced extraction improves tables and embedded content but costs 2 credits per 5 successful URLs.",
			"Partial failures retain successful pages; retry only failed URLs if needed.",
			"Read fullOutputPath or fullResponsePath when a response is truncated.",
		],
		parameters: ExtractParams,
		outputSchema: OutputSchema,

		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			try {
				const options = extractOptions(params);
				const response = await run({ operation: "extract", input: params.urls, options }, getConfig(ctx.sessionManager.getSessionId()), signal) as TavilyExtractResponse;

				const formatted = formatExtractResults(response.results, response.failedResults);

				return await toolResult("extract", response, formatted);
			} catch (error) {
				return errorResult("extract", error);
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("tavily_extract "));
			const urls = args.urls ?? [];
			if (urls.length === 0) {
				text += theme.fg("muted", "...");
			} else if (urls.length === 1) {
				text += theme.fg("muted", urls[0]);
			} else {
				text += theme.fg("muted", `${urls.length} URLs`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, context) {
			if (context.isError) {
				return new Text(theme.fg("error", `✗ ${resultText(result)}`) + theme.fg("muted", renderMetadata(result, expanded)), 0, 0);
			}

			const details = result.details as {
				successCount?: number;
				failedCount?: number;
				responseTime?: number;
				results?: TavilyExtractResult[];
				failedResults?: TavilyExtractFailedResult[];
			};

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
			text += theme.fg("muted", ` (${details?.responseTime?.toFixed(2) ?? "?"}s)` + renderMetadata(result, expanded));

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
					text += `\n\n${theme.fg("muted", `... (${hints.join(", ")}, ${keyHint("app.tools.expand", "to expand")})`)}`;
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
		if (!process.env.TAVILY_API_KEY && ctx.hasUI) {
			ctx.ui.notify("Tavily: Set TAVILY_API_KEY to enable web search and extraction", "info");
		}
	});
}
