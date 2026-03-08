import type { AssistantMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { formatBranchSuffix, renderDimmedFooterPath } from "./branch-status.ts";
import { getSubbarFormatter, getSubbarSettings, type SubbarFormatter, type SubbarSettings } from "./subbar-adapter.ts";

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

export default function (pi: ExtensionAPI) {
	let isDirty: boolean | null = null;
	let subBarUsage: any | undefined;
	let subBarSettings: SubbarSettings | undefined;
	let lastContext: ExtensionContext | undefined;
	let formatUsageStatusWithWidth: SubbarFormatter | undefined;

	async function refreshDirtyState(ctx: ExtensionContext): Promise<void> {
		const repoCheck = await pi.exec("git", ["-C", ctx.cwd, "rev-parse", "--is-inside-work-tree"]);
		if (repoCheck.code !== 0) {
			isDirty = null;
			return;
		}

		const status = await pi.exec("git", ["-C", ctx.cwd, "status", "--porcelain"]);
		isDirty = status.stdout.trim().length > 0;
	}

	function refreshSubBarIntegration(): void {
		formatUsageStatusWithWidth = getSubbarFormatter();
		subBarSettings = getSubbarSettings();
	}

	function requestSubCoreCurrentUsage(): void {
		const request = {
			type: "current" as const,
			reply: (payload: { state?: { usage?: any } }) => {
				subBarUsage = payload.state?.usage;
			},
		};
		pi.events.emit("sub-core:request", request);
	}

	function installFooter(ctx: ExtensionContext): void {
		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsubscribe = footerData.onBranchChange(() => {
				void refreshDirtyState(ctx).then(() => tui.requestRender());
			});

			return {
				dispose: unsubscribe,
				invalidate() {},
				render(width: number): string[] {
					let totalInput = 0;
					let totalOutput = 0;
					let totalCacheRead = 0;
					let totalCacheWrite = 0;
					let totalCost = 0;

					for (const entry of ctx.sessionManager.getEntries()) {
						if (entry.type === "message" && entry.message.role === "assistant") {
							const message = entry.message as AssistantMessage;
							totalInput += message.usage.input;
							totalOutput += message.usage.output;
							totalCacheRead += message.usage.cacheRead;
							totalCacheWrite += message.usage.cacheWrite;
							totalCost += message.usage.cost.total;
						}
					}

					const contextUsage = ctx.getContextUsage();
					const contextWindow = contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0;
					const contextPercentValue = contextUsage?.percent ?? 0;
					const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";

					let pwd = process.cwd();
					const home = process.env.HOME || process.env.USERPROFILE;
					if (home && pwd.startsWith(home)) {
						pwd = `~${pwd.slice(home.length)}`;
					}

					const branch = footerData.getGitBranch();
					if (branch) {
						pwd = `${pwd}${formatBranchSuffix(branch, isDirty)}`;
					}

					const sessionName = ctx.sessionManager.getSessionName();
					if (sessionName) {
						pwd = `${pwd} • ${sessionName}`;
					}

					if (pwd.length > width) {
						const half = Math.floor(width / 2) - 2;
						if (half > 1) {
							const start = pwd.slice(0, half);
							const end = pwd.slice(-(half - 1));
							pwd = `${start}...${end}`;
						} else {
							pwd = pwd.slice(0, Math.max(1, width));
						}
					}

					const statsParts: string[] = [];
					if (totalInput) statsParts.push(`↑${formatTokens(totalInput)}`);
					if (totalOutput) statsParts.push(`↓${formatTokens(totalOutput)}`);
					if (totalCacheRead) statsParts.push(`R${formatTokens(totalCacheRead)}`);
					if (totalCacheWrite) statsParts.push(`W${formatTokens(totalCacheWrite)}`);

					const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
					if (totalCost || usingSubscription) {
						const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
						statsParts.push(costStr);
					}

					let contextPercentStr: string;
					const autoIndicator = " (auto)";
					const contextPercentDisplay =
						contextPercent === "?"
							? `?/${formatTokens(contextWindow)}${autoIndicator}`
							: `${contextPercent}%/${formatTokens(contextWindow)}${autoIndicator}`;
					if (contextPercentValue > 90) {
						contextPercentStr = theme.fg("error", contextPercentDisplay);
					} else if (contextPercentValue > 70) {
						contextPercentStr = theme.fg("warning", contextPercentDisplay);
					} else {
						contextPercentStr = contextPercentDisplay;
					}
					statsParts.push(contextPercentStr);

					let statsLeft = statsParts.join(" ");
					const modelName = ctx.model?.id || "no-model";
					let statsLeftWidth = visibleWidth(statsLeft);

					if (statsLeftWidth > width) {
						const plainStatsLeft = statsLeft.replace(/\x1b\[[0-9;]*m/g, "");
						statsLeft = `${plainStatsLeft.substring(0, width - 3)}...`;
						statsLeftWidth = visibleWidth(statsLeft);
					}

					const minPadding = 2;

					let rightSideWithoutProvider = modelName;
					if (ctx.model?.reasoning) {
						const thinkingLevel = pi.getThinkingLevel() || "off";
						rightSideWithoutProvider =
							thinkingLevel === "off" ? `${modelName} • thinking off` : `${modelName} • ${thinkingLevel}`;
					}

					let rightSide = rightSideWithoutProvider;
					if (footerData.getAvailableProviderCount() > 1 && ctx.model) {
						rightSide = `(${ctx.model.provider}) ${rightSideWithoutProvider}`;
						if (statsLeftWidth + minPadding + visibleWidth(rightSide) > width) {
							rightSide = rightSideWithoutProvider;
						}
					}

					const rightSideWidth = visibleWidth(rightSide);
					const totalNeeded = statsLeftWidth + minPadding + rightSideWidth;

					let statsLine: string;
					if (totalNeeded <= width) {
						const padding = " ".repeat(width - statsLeftWidth - rightSideWidth);
						statsLine = statsLeft + padding + rightSide;
					} else {
						const availableForRight = width - statsLeftWidth - minPadding;
						if (availableForRight > 3) {
							const plainRightSide = rightSide.replace(/\x1b\[[0-9;]*m/g, "");
							const truncatedPlain = plainRightSide.substring(0, availableForRight);
							const padding = " ".repeat(width - statsLeftWidth - truncatedPlain.length);
							statsLine = statsLeft + padding + truncatedPlain;
						} else {
							statsLine = statsLeft;
						}
					}

					const dimStatsLeft = theme.fg("dim", statsLeft);
					const remainder = statsLine.slice(statsLeft.length);
					const dimRemainder = theme.fg("dim", remainder);

					const pwdLine = renderDimmedFooterPath(theme, pwd);

					let usageRight = "";
					if (formatUsageStatusWithWidth && subBarUsage && subBarSettings) {
						const cu = ctx.getContextUsage();
						const contextInfo =
							cu && cu.tokens !== null ? { tokens: cu.tokens, contextWindow: cu.contextWindow, percent: cu.percent ?? 0 } : undefined;
						const usageLine = formatUsageStatusWithWidth(
							theme,
							subBarUsage,
							Math.max(20, Math.floor(width * 0.55)),
							ctx.model
								? {
										provider: ctx.model.provider,
										id: ctx.model.id,
										scopedModelPatterns: [],
								  }
								: undefined,
							subBarSettings,
							{ labelGapFill: false },
							contextInfo,
						);
						if (usageLine) {
							usageRight = truncateToWidth(usageLine, Math.max(20, Math.floor(width * 0.55)), "");
						}
					}

					let firstLine = pwdLine;
					if (usageRight) {
						const leftWidth = visibleWidth(pwdLine);
						const rightWidth = visibleWidth(usageRight);
						if (leftWidth + 1 + rightWidth <= width) {
							const padding = " ".repeat(width - leftWidth - rightWidth);
							firstLine = pwdLine + padding + usageRight;
						} else {
							const availableLeft = Math.max(1, width - rightWidth - 1);
							const leftTruncated = truncateToWidth(pwdLine, availableLeft, theme.fg("dim", "..."));
							firstLine = leftTruncated + " " + usageRight;
						}
					}

					const lines = [firstLine, dimStatsLeft + dimRemainder];

					const extensionStatuses = footerData.getExtensionStatuses();
					if (extensionStatuses.size > 0) {
						const sortedStatuses = Array.from(extensionStatuses.entries())
							.sort(([a], [b]) => a.localeCompare(b))
							.map(([, text]) => sanitizeStatusText(text));
						const statusLine = sortedStatuses.join(" ");
						lines.push(truncateToWidth(statusLine, width, theme.fg("dim", "...")));
					}

					return lines;
				},
			};
		});
	}

	async function refreshAndRender(ctx: ExtensionContext): Promise<void> {
		lastContext = ctx;
		await refreshDirtyState(ctx);
		refreshSubBarIntegration();
		requestSubCoreCurrentUsage();
		installFooter(ctx);
	}

	pi.on("session_start", async (_event, ctx) => {
		await refreshAndRender(ctx);
		ctx.ui.setWidget("usage", undefined);
	});

	pi.on("session_switch", async (_event, ctx) => {
		await refreshAndRender(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshAndRender(ctx);
	});

	pi.on("tool_execution_end", async (_event, ctx) => {
		await refreshAndRender(ctx);
	});

	pi.on("model_select", async (_event, ctx) => {
		refreshSubBarIntegration();
		installFooter(ctx);
	});

	pi.events.on("sub-core:update-current", (payload) => {
		const data = payload as { state?: { usage?: any } };
		subBarUsage = data.state?.usage;
		if (lastContext) {
			lastContext.ui.setWidget("usage", undefined);
			installFooter(lastContext);
		}
	});

	pi.events.on("sub-core:ready", (payload) => {
		const data = payload as { state?: { usage?: any } };
		subBarUsage = data.state?.usage;
		if (lastContext) {
			lastContext.ui.setWidget("usage", undefined);
			installFooter(lastContext);
		}
	});

	pi.events.on("sub-core:update-all", (payload) => {
		const data = payload as { state?: { entries?: Array<{ usage?: any }>; currentProvider?: string } };
		const entries = data.state?.entries ?? [];
		const byProvider = new Map<string, any>();
		for (const entry of entries) {
			if (entry?.usage?.provider) byProvider.set(entry.usage.provider, entry.usage);
		}
		const currentProvider = data.state?.currentProvider;
		if (currentProvider && byProvider.has(currentProvider)) {
			subBarUsage = byProvider.get(currentProvider);
		}
		if (lastContext) {
			lastContext.ui.setWidget("usage", undefined);
			installFooter(lastContext);
		}
	});
}
