import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { visibleWidth, type Component, type TUI, type TuiAltScreen } from "@earendil-works/pi-tui";

const MARKER = "︾";
const WIDGET_KEY = "scroll-continuation-marker";

class ScrollContinuationMarker implements Component {
	constructor(
		private readonly tui: TUI,
		private readonly style: (text: string) => string,
	) {}

	render(width: number): string[] {
		if (this.tui.mode !== "fullscreen") return [];

		const fullscreenTui = this.tui as unknown as TuiAltScreen;
		if (fullscreenTui.isFollowingOutput) return [];

		const markerWidth = visibleWidth(MARKER);
		if (width < markerWidth) return [];

		const leftPadding = Math.floor((width - markerWidth) / 2);
		return [`${" ".repeat(leftPadding)}${this.style(MARKER)}`];
	}

	invalidate(): void {}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setWidget(
			WIDGET_KEY,
			(tui, theme) => new ScrollContinuationMarker(tui, (text) => theme.fg("accent", text)),
			{ placement: "aboveEditor" },
		);
	});
}
