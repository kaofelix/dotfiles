/**
 * Tree extension - shortcuts for tree navigation
 *
 * Commands:
 *   /branch:fold - Fold current branch into a summary (to crease or top)
 *   /branch:drop - Drop current branch without summary (to crease or top)
 *   /tree:crease - Mark current position as the fold/drop target
 *   /tree:back - Go back to the last user message
 *   /tree:forward - Go forward to the position before the last back
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Text, type TUI, type Theme } from "@mariozechner/pi-tui";

/** Label used to mark crease points */
const CREASE_LABEL = "crease";

/**
 * Find the target entry for fold/drop operations.
 * Priority: crease > branch_summary > top
 */
function findFoldTarget(ctx: ExtensionCommandContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();
	const topId = branch[0]?.id;

	if (!topId) return undefined;

	// Walk backwards from current position (excluding current)
	for (let i = branch.length - 2; i >= 0; i--) {
		const entryId = branch[i]!.id;

		// Check for crease label first
		const label = ctx.sessionManager.getLabel(entryId);
		if (label === CREASE_LABEL) {
			return entryId;
		}

		// Check for branch_summary
		const entry = ctx.sessionManager.getEntry(entryId);
		if (entry?.type === "branch_summary") {
			return entryId;
		}
	}

	return topId;
}

/** Animated dot component that cycles through frames */
class AnimatedDot extends Text {
	private frames = ["●", "○", "●", "○"];
	private currentFrame = 0;
	private intervalId: ReturnType<typeof setInterval> | null = null;

	constructor(
		private tui: TUI,
		private theme: Theme,
		private message: string,
	) {
		super("", 1, 0);
		this.start();
	}

	private updateDisplay(): void {
		const frame = this.frames[this.currentFrame]!;
		this.setText(this.theme.fg("accent", frame + " ") + this.theme.fg("muted", this.message));
		this.tui.requestRender();
	}

	private start(): void {
		this.updateDisplay();
		this.intervalId = setInterval(() => {
			this.currentFrame = (this.currentFrame + 1) % this.frames.length;
			this.updateDisplay();
		}, 400);
	}

	dispose(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}
}

export default function (_pi: ExtensionAPI) {
	// Stack to track positions for tree:forward
	const forwardStack: string[] = [];

	_pi.registerCommand("branch:fold", {
		description: "Fold current branch into a summary (to crease or top). Optional: provide custom instructions.",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("branch:fold requires interactive mode", "error");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("No model selected", "error");
				return;
			}

			const targetId = findFoldTarget(ctx);

			if (!targetId) {
				ctx.ui.notify("No conversation to fold", "error");
				return;
			}

			// Show animated summarizing indicator
			ctx.ui.setWidget("branch:fold", (tui, theme) => new AnimatedDot(tui, theme, "Summarizing..."));

			let navResult;
			try {
				navResult = await ctx.navigateTree(targetId, {
					summarize: true,
					customInstructions: args || undefined,
				});
			} finally {
				ctx.ui.setWidget("branch:fold", undefined);
			}

			if (navResult.cancelled) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			ctx.ui.notify("Branch folded", "info");
		},
	});

	_pi.registerCommand("branch:drop", {
		description: "Drop current branch without summary (to crease or top)",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("branch:drop requires interactive mode", "error");
				return;
			}

			const targetId = findFoldTarget(ctx);

			if (!targetId) {
				ctx.ui.notify("No conversation to drop", "error");
				return;
			}

			const navResult = await ctx.navigateTree(targetId, {
				summarize: false,
			});

			if (navResult.cancelled) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			ctx.ui.notify("Branch dropped", "info");
		},
	});

	_pi.registerCommand("tree:crease", {
		description: "Mark current position as the fold/drop target",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("tree:crease requires interactive mode", "error");
				return;
			}

			const leafId = ctx.sessionManager.getLeafId();

			if (!leafId) {
				ctx.ui.notify("No position to mark", "error");
				return;
			}

			_pi.setLabel(leafId, CREASE_LABEL);
			ctx.ui.notify("Crease marked", "info");
		},
	});

	_pi.registerCommand("tree:back", {
		description: "Go back to the last user message",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("tree:back requires interactive mode", "error");
				return;
			}

			const branch = ctx.sessionManager.getBranch();

			if (branch.length === 0) {
				ctx.ui.notify("Nothing to go back to", "error");
				return;
			}

			// Find the last user message before the current position
			// Skip the very last entry if it's a user message (we want the one before)
			let targetId: string | undefined;
			for (let i = branch.length - 2; i >= 0; i--) {
				const entry = ctx.sessionManager.getEntry(branch[i]!.id);
				if (entry?.type === "message" && entry.message.role === "user") {
					targetId = entry.id;
					break;
				}
			}

			if (!targetId) {
				ctx.ui.notify("No previous user message to go back to", "info");
				return;
			}

			// Push current position to forward stack before navigating
			const currentLeafId = ctx.sessionManager.getLeafId();
			if (currentLeafId) {
				forwardStack.push(currentLeafId);
			}

			await ctx.navigateTree(targetId, { summarize: false });
		},
	});

	_pi.registerCommand("tree:forward", {
		description: "Go forward to the position before the last back",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("tree:forward requires interactive mode", "error");
				return;
			}

			const targetId = forwardStack.pop();

			if (!targetId) {
				ctx.ui.notify("Nothing to go forward to", "info");
				return;
			}

			await ctx.navigateTree(targetId, { summarize: false });
		},
	});
}
