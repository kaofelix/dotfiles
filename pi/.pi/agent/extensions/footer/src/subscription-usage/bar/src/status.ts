/**
 * Status indicator helpers.
 */

import type { ProviderStatus } from "./types.js";
import type { StatusIconPack } from "./settings-types.js";

const STATUS_ICON_PACKS: Record<Exclude<StatusIconPack, "custom">, Record<ProviderStatus["indicator"], string>> = {
	minimal: {
		none: "✓",
		minor: "⚠",
		major: "⚠",
		critical: "×",
		maintenance: "~",
		unknown: "?",
	},
	emoji: {
		none: "✅",
		minor: "⚠️",
		major: "🟠",
		critical: "🔴",
		maintenance: "🔧",
		unknown: "❓",
	},
};

const DEFAULT_CUSTOM_ICONS = ["✓", "⚠", "×", "?"];
const CUSTOM_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function parseCustomIcons(value?: string): [string, string, string, string] {
	if (!value) return DEFAULT_CUSTOM_ICONS as [string, string, string, string];
	const segments = Array.from(CUSTOM_SEGMENTER.segment(value), (entry) => entry.segment)
		.map((segment) => segment.trim())
		.filter(Boolean);
	if (segments.length < 3) return DEFAULT_CUSTOM_ICONS as [string, string, string, string];
	if (segments.length === 3) {
		return [segments[0], segments[1], segments[2], DEFAULT_CUSTOM_ICONS[3]] as [string, string, string, string];
	}
	return [segments[0], segments[1], segments[2], segments[3]] as [string, string, string, string];
}

function buildCustomPack(custom?: string): Record<ProviderStatus["indicator"], string> {
	const [ok, warn, error, unknown] = parseCustomIcons(custom);
	return {
		none: ok,
		minor: warn,
		major: error,
		critical: error,
		maintenance: warn,
		unknown,
	};
}

export function getStatusIcon(
	status: ProviderStatus | undefined,
	pack: StatusIconPack,
	custom?: string,
): string {
	if (!status) return "";
	if (pack === "custom") {
		return buildCustomPack(custom)[status.indicator] ?? "";
	}
	return STATUS_ICON_PACKS[pack][status.indicator] ?? "";
}

export function getStatusLabel(
	status: ProviderStatus | undefined,
	useAbbreviated = false,
): string {
	if (!status) return "";
	if (useAbbreviated) {
		switch (status.indicator) {
			case "none":
				return "Status OK";
			case "minor":
				return "Status Degr.";
			case "major":
			case "critical":
				return "Status Crit.";
			case "maintenance":
				return "Status Maint.";
			case "unknown":
			default:
				return "Status Unk.";
		}
	}
	if (status.description) return status.description;
	switch (status.indicator) {
		case "none":
			return "Operational";
		case "minor":
			return "Degraded";
		case "major":
			return "Outage";
		case "critical":
			return "Outage";
		case "maintenance":
			return "Maintenance";
		case "unknown":
		default:
			return "Status Unknown";
	}
}
