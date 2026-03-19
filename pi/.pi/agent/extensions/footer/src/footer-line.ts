import { visibleWidth } from '@mariozechner/pi-tui';

export type FooterModelInfo = {
	id: string;
	provider: string;
	reasoning?: boolean;
};

type ThemeLike = {
	fg(color: string, text: string): string;
	getThinkingBorderColor?: (level: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh') => (text: string) => string;
};

type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

function isThinkingLevel(value: string): value is ThinkingLevel {
	return ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(value);
}

function getThinkingColor(theme: ThemeLike, level: ThinkingLevel): (text: string) => string {
	if (theme.getThinkingBorderColor) return theme.getThinkingBorderColor(level);

	switch (level) {
		case 'minimal':
			return (text: string) => theme.fg('thinkingMinimal', text);
		case 'low':
			return (text: string) => theme.fg('thinkingLow', text);
		case 'medium':
			return (text: string) => theme.fg('thinkingMedium', text);
		case 'high':
			return (text: string) => theme.fg('thinkingHigh', text);
		case 'xhigh':
			return (text: string) => theme.fg('thinkingXhigh', text);
		case 'off':
		default:
			return (text: string) => theme.fg('thinkingOff', text);
	}
}

export function buildFooterRightSide(
	model: FooterModelInfo | undefined,
	availableProviderCount: number,
	thinkingLevel: string,
): { preferred: string; fallback: string } {
	const modelName = model?.id || 'no-model';
	const fallback = model?.reasoning
		? thinkingLevel === 'off'
			? `${modelName} • thinking off`
			: `${modelName} • ${thinkingLevel}`
		: modelName;

	const preferred = availableProviderCount > 1 && model ? `(${model.provider}) ${fallback}` : fallback;
	return { preferred, fallback };
}

function renderModelWithDimmedProvider(theme: ThemeLike, text: string): string {
	const providerMatch = text.match(/^(\([^)]*\)\s)(.+)$/);
	if (!providerMatch) return theme.fg('muted', text);
	return theme.fg('dim', providerMatch[1]) + theme.fg('muted', providerMatch[2]);
}

export function renderFooterRightSide(
	theme: ThemeLike,
	text: string,
	thinkingLevel: string,
	hasReasoning: boolean,
): string {
	if (!hasReasoning || !isThinkingLevel(thinkingLevel)) {
		return renderModelWithDimmedProvider(theme, text);
	}

	const suffix = thinkingLevel === 'off' ? 'thinking off' : thinkingLevel;
	const splitToken = ` • ${suffix}`;
	if (!text.endsWith(splitToken)) {
		return renderModelWithDimmedProvider(theme, text);
	}

	const prefix = text.slice(0, -splitToken.length);
	const colorThinking = getThinkingColor(theme, thinkingLevel);
	return renderModelWithDimmedProvider(theme, prefix) + theme.fg('dim', ' • ') + colorThinking(suffix);
}

export function composeFooterLine(
	left: string,
	preferredRight: string,
	fallbackRight: string,
	width: number,
	renderRight: (text: string) => string = (text) => text,
): string {
	const leftWidth = visibleWidth(left);
	const minPadding = 2;

	const preferredWidth = visibleWidth(preferredRight);
	if (leftWidth + minPadding + preferredWidth <= width) {
		const padding = ' '.repeat(width - leftWidth - preferredWidth);
		return left + padding + renderRight(preferredRight);
	}

	const fallbackWidth = visibleWidth(fallbackRight);
	if (leftWidth + minPadding + fallbackWidth <= width) {
		const padding = ' '.repeat(width - leftWidth - fallbackWidth);
		return left + padding + renderRight(fallbackRight);
	}

	const availableForRight = width - leftWidth - minPadding;
	if (availableForRight > 3) {
		const truncatedRight = fallbackRight.substring(0, availableForRight);
		const padding = ' '.repeat(width - leftWidth - truncatedRight.length);
		return left + padding + renderRight(truncatedRight);
	}

	return left;
}
