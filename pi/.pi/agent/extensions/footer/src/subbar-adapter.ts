import { formatUsageStatusWithWidth } from "@marckrenn/pi-sub-bar/src/formatting.ts";
import { loadSettings } from "@marckrenn/pi-sub-bar/src/settings.ts";
import { applyFooterDisplayDefaults } from "./subbar-defaults.ts";

export type SubbarFormatter = typeof formatUsageStatusWithWidth;
export type SubbarSettings = ReturnType<typeof loadSettings>;

export function getSubbarFormatter(): SubbarFormatter {
	return formatUsageStatusWithWidth;
}

export function getSubbarSettings(): SubbarSettings {
	const loaded = loadSettings();
	return {
		...loaded,
		display: applyFooterDisplayDefaults(loaded.display),
	};
}
