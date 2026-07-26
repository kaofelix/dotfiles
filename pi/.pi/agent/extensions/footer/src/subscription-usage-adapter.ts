import { formatUsageStatusWithWidth } from "./subscription-usage/bar/src/formatting.ts";
import { loadSettings } from "./subscription-usage/bar/src/settings.ts";
import { applyFooterDisplayDefaults } from "./subscription-usage-defaults.ts";

export type SubscriptionUsageFormatter = typeof formatUsageStatusWithWidth;
export type SubscriptionUsageSettings = ReturnType<typeof loadSettings>;

export function getSubscriptionUsageFormatter(): SubscriptionUsageFormatter {
	return formatUsageStatusWithWidth;
}

export function getSubscriptionUsageSettings(): SubscriptionUsageSettings {
	const loaded = loadSettings();
	return {
		...loaded,
		display: applyFooterDisplayDefaults(loaded.display),
	};
}
