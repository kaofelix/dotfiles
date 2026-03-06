/**
 * Tree extension - shortcuts for tree navigation
 *
 * Commands:
 *   /branch:fold - Fold current branch into a summary at the top
 *   /branch:drop - Drop current branch, go to top without summary
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
	_pi.registerCommand("branch:fold", {
		description: "Fold current branch into a summary at the top",
		handler: async (_args, ctx) => {
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

			// Show animated summarizing indicator
			ctx.ui.setWidget("branch:fold", (tui, theme) => new AnimatedDot(tui, theme, "Summarizing..."));

			let navResult;
			try {
				navResult = await ctx.navigateTree(topId, {
					summarize: true,
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
}
