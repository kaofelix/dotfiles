/**
 * Tree extension - shortcuts for tree navigation
 *
 * Commands:
 *   /branch:fold - Fold current branch into a summary at the top
 *   /branch:drop - Drop current branch, go to top without summary
 *   /undo - Go back to the last user message (pushes current position to redo stack)
 *   /redo - Go forward to the position before the last undo
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text, type TUI, type Theme } from "@mariozechner/pi-tui";

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
	// Stack to track positions for redo
	const redoStack: string[] = [];

	_pi.registerCommand("branch:fold", {
		description: "Fold current branch into a summary at the top (optional: provide custom instructions for the summary)",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("branch:fold requires interactive mode", "error");
				return;
			}

			if (!ctx.model) {
				ctx.ui.notify("No model selected", "error");
				return;
			}

			const branch = ctx.sessionManager.getBranch();
			const topId = branch[0]?.id;

			if (!topId) {
				ctx.ui.notify("No conversation to fold", "error");
				return;
			}

			// Find the last branch_summary in the branch (walking from current position back)
			// This ensures summaries chain sequentially rather than all going to root
			let targetId = topId;
			for (let i = branch.length - 1; i >= 0; i--) {
				const entry = ctx.sessionManager.getEntry(branch[i]!.id);
				if (entry?.type === "branch_summary") {
					targetId = entry.id;
					break;
				}
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
		description: "Drop current branch, go to top without summary",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("branch:drop requires interactive mode", "error");
				return;
			}

			const branch = ctx.sessionManager.getBranch();
			const topId = branch[0]?.id;

			if (!topId) {
				ctx.ui.notify("No conversation to drop", "error");
				return;
			}

			const navResult = await ctx.navigateTree(topId, {
				summarize: false,
			});

			if (navResult.cancelled) {
				ctx.ui.notify("Cancelled", "info");
				return;
			}

			ctx.ui.notify("Branch dropped", "info");
		},
	});

	_pi.registerCommand("undo", {
		description: "Go back to the last user message",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("undo requires interactive mode", "error");
				return;
			}

			const branch = ctx.sessionManager.getBranch();

			if (branch.length === 0) {
				ctx.ui.notify("Nothing to undo", "error");
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

			// Push current position to redo stack before navigating
			const currentLeafId = ctx.sessionManager.getLeafId();
			if (currentLeafId) {
				redoStack.push(currentLeafId);
			}

			await ctx.navigateTree(targetId, { summarize: false });
		},
	});

	_pi.registerCommand("redo", {
		description: "Go forward to the position before the last undo",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("redo requires interactive mode", "error");
				return;
			}

			const targetId = redoStack.pop();

			if (!targetId) {
				ctx.ui.notify("Nothing to redo", "info");
				return;
			}

			await ctx.navigateTree(targetId, { summarize: false });
		},
	});
}
