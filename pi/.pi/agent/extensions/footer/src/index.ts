import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { formatBranchSuffix, renderDimmedFooterPath } from "./branch-status.ts";
import { renderContextUsageLine } from "./context-usage.ts";
import { buildFooterRightSide, composeFooterLine, renderFooterRightSide } from "./footer-line.ts";
import { getSubbarFormatter, getSubbarSettings, type SubbarFormatter, type SubbarSettings } from "./subbar-adapter.ts";

function sanitizeStatusText(text: string): string {
	return text
		.replace(/[\r\n\t]/g, " ")
		.replace(/ +/g, " ")
		.trim();
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
					const contextUsage = ctx.getContextUsage();

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

					const rightSide = buildFooterRightSide(
						ctx.model
							? {
									id: ctx.model.id,
									provider: ctx.model.provider,
									reasoning: ctx.model.reasoning,
							  }
							: undefined,
						footerData.getAvailableProviderCount(),
						pi.getThinkingLevel() || "off",
					);
					const firstLine = truncateToWidth(
						composeFooterLine(pwdLine, rightSide.preferred, rightSide.fallback, width, (text) =>
							renderFooterRightSide(theme, text, pi.getThinkingLevel() || "off", !!ctx.model?.reasoning),
						),
						width,
						theme.fg("dim", "..."),
					);

					const contextLeft = renderContextUsageLine(theme, {
						tokens: contextUsage?.tokens ?? null,
						contextWindow: contextUsage?.contextWindow ?? ctx.model?.contextWindow ?? 0,
						percent: contextUsage?.percent ?? null,
					});

					let secondLine = contextLeft;
					if (usageRight) {
						const leftWidth = visibleWidth(contextLeft);
						const rightWidth = visibleWidth(usageRight);
						if (leftWidth + 1 + rightWidth <= width) {
							const padding = " ".repeat(width - leftWidth - rightWidth);
							secondLine = contextLeft + padding + usageRight;
						} else {
							const availableLeft = Math.max(1, width - rightWidth - 1);
							const leftTruncated = truncateToWidth(contextLeft, availableLeft, theme.fg("dim", "..."));
							secondLine = leftTruncated + " " + usageRight;
						}
					}
					secondLine = truncateToWidth(secondLine, width, theme.fg("dim", "..."));

					const lines = [firstLine, secondLine];

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
