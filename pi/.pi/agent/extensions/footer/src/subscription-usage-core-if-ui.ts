import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type SessionStartHandler = (event: any, ctx: ExtensionContext) => void | Promise<void>;

/**
 * Load the subscription usage core only when a UI is available.
 *
 * The usage core powers the subscription data shown by the custom footer, but
 * in print/JSON mode there is no footer. Loading it there leaves background
 * refresh/event callbacks holding a non-UI session context and can trip pi's
 * stale-context guard after the print session is replaced or shuts down.
 */
export default function (pi: ExtensionAPI) {
	let loaded = false;

	pi.on("session_start", async (event, ctx) => {
		if (loaded || !ctx.hasUI) {
			return;
		}
		loaded = true;

		const sessionStartHandlers: SessionStartHandler[] = [];
		const wrappedPi = new Proxy(pi, {
			get(target, prop, receiver) {
				if (prop !== "on") {
					return Reflect.get(target, prop, receiver);
				}

				return (eventName: string, handler: SessionStartHandler) => {
					if (eventName === "session_start") {
						sessionStartHandlers.push(handler);
					}
					return (target.on as any)(eventName, handler);
				};
			},
		}) as ExtensionAPI;

		const usageCore = await import("./subscription-usage/core/index.ts");
		usageCore.default(wrappedPi);

		// The usage core was loaded during the current session_start event, after pi
		// had already dispatched that event to registered handlers. Replay the current
		// session_start only to handlers registered during initialization so
		// it can publish the initial usage state for the footer.
		for (const handler of sessionStartHandlers) {
			await handler(event, ctx);
		}
	});
}
