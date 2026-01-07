/**
 * Auto-exit extension - exits pi after the agent completes a loop turn.
 *
 * Use this when you want pi to run a single turn and then automatically exit.
 * Load on demand by passing the file path to pi with --extensions flag:
 *
 *   pi --extensions ~/.pi/agent/on-demand-extensions/auto-exit.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	// When the agent ends after a turn, use the shutdown method for clean exit
	pi.on("agent_end", async (_event, ctx) => {
		// Give async operations a moment to complete
		await new Promise(resolve => setTimeout(resolve, 200));

		// Use ctx.shutdown() for clean terminal cleanup
		ctx.shutdown();
	});
}
