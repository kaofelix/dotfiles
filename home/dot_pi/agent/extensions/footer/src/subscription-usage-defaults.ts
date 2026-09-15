type UsageColorTargets = {
	title: boolean;
	timer: boolean;
	bar: boolean;
	usageLabel: boolean;
	status: boolean;
};

export type FooterDisplaySettings = {
	alignment: "left" | "center" | "right" | "split";
	barStyle: "bar" | "percentage" | "both";
	barType: "horizontal-bar" | "horizontal-single" | "vertical" | "braille" | "shade";
	barWidth: number | "fill";
	barCharacter: string;
	containBar: boolean;
	brailleFillEmpty: boolean;
	brailleFullBlocks: boolean;
	colorScheme: "monochrome" | "base-warning-error" | "success-base-warning-error";
	usageColorTargets: UsageColorTargets;
	resetTimePosition: "front" | "back" | "integrated";
	resetTimeFormat: "relative" | "datetime";
	resetTimeContainment: "none" | "blank" | "()" | "[]" | "<>" | string;
	statusIndicatorMode: "icon" | "text" | "icon+text";
	statusIconPack: "minimal" | "emoji" | "custom";
	statusIconCustom: string;
	statusProviderDivider: boolean;
	statusDismissOk: boolean;
	showProviderName: boolean;
	providerLabel: "plan" | "subscription" | "sub" | "none" | string;
	providerLabelColon: boolean;
	providerLabelBold: boolean;
	baseTextColor: string;
	backgroundColor: string;
	showWindowTitle: boolean;
	boldWindowTitle: boolean;
	showUsageLabels: boolean;
	dividerCharacter: string;
	dividerColor: string;
	dividerBlanks: number | "fill";
	showProviderDivider: boolean;
	dividerFooterJoin: boolean;
	showTopDivider: boolean;
	showBottomDivider: boolean;
	paddingLeft: number;
	paddingRight: number;
	widgetPlacement: "belowEditor";
	errorThreshold: number;
	warningThreshold: number;
	overflow: "truncate" | "wrap";
	successThreshold: number;
};

export const FOOTER_DISPLAY_DEFAULTS: FooterDisplaySettings = {
	alignment: "right",
	barStyle: "both",
	barType: "horizontal-bar",
	barWidth: 8,
	barCharacter: "heavy",
	containBar: false,
	brailleFillEmpty: false,
	brailleFullBlocks: false,
	colorScheme: "success-base-warning-error",
	usageColorTargets: {
		title: false,
		timer: false,
		bar: true,
		usageLabel: true,
		status: true,
	},
	resetTimePosition: "integrated",
	resetTimeFormat: "relative",
	resetTimeContainment: "none",
	statusIndicatorMode: "icon",
	statusIconPack: "emoji",
	statusIconCustom: "😎😳😵🤔",
	statusProviderDivider: false,
	statusDismissOk: true,
	showProviderName: false,
	providerLabel: "none",
	providerLabelColon: false,
	providerLabelBold: true,
	baseTextColor: "muted",
	backgroundColor: "text",
	showWindowTitle: true,
	boldWindowTitle: true,
	showUsageLabels: true,
	dividerCharacter: "•",
	dividerColor: "dim",
	dividerBlanks: 1,
	showProviderDivider: true,
	dividerFooterJoin: true,
	showTopDivider: false,
	showBottomDivider: false,
	paddingLeft: 1,
	paddingRight: 1,
	widgetPlacement: "belowEditor",
	errorThreshold: 25,
	warningThreshold: 50,
	overflow: "truncate",
	successThreshold: 75,
};

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
	const result = { ...target };
	for (const key of Object.keys(source) as (keyof T)[]) {
		const sourceValue = source[key];
		const targetValue = target[key];
		if (
			sourceValue !== undefined &&
			typeof sourceValue === "object" &&
			sourceValue !== null &&
			!Array.isArray(sourceValue) &&
			typeof targetValue === "object" &&
			targetValue !== null &&
			!Array.isArray(targetValue)
		) {
			result[key] = deepMerge(targetValue as object, sourceValue as Partial<object>) as T[keyof T];
		} else if (sourceValue !== undefined) {
			result[key] = sourceValue as T[keyof T];
		}
	}
	return result;
}

export function applyFooterDisplayDefaults(display: Partial<FooterDisplaySettings> | undefined): FooterDisplaySettings {
	if (!display) return { ...FOOTER_DISPLAY_DEFAULTS };
	return deepMerge(FOOTER_DISPLAY_DEFAULTS, display);
}
