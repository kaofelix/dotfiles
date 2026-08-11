import { visibleWidth } from '@earendil-works/pi-tui';

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

type CacheUsage = {
	input: number;
	cacheRead: number;
	cacheWrite: number;
};

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	if (count < 1000000) return `${Math.round(count / 1000)}k`;
	if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
	return `${Math.round(count / 1000000)}M`;
}

function readCacheUsage(value: unknown): CacheUsage | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const usage = value as Partial<CacheUsage>;
	if (
		typeof usage.input !== 'number' ||
		typeof usage.cacheRead !== 'number' ||
		typeof usage.cacheWrite !== 'number'
	) {
		return undefined;
	}
	return usage as CacheUsage;
}

export function buildCacheStats(entries: readonly unknown[]): string {
	let cacheRead = 0;
	let cacheWrite = 0;
	let latestCacheHitRate: number | undefined;

	for (const value of entries) {
		if (!value || typeof value !== 'object') continue;
		const entry = value as { type?: string; message?: { role?: string; usage?: unknown }; usage?: unknown };
		const isAssistant = entry.type === 'message' && entry.message?.role === 'assistant';
		const isToolResult = entry.type === 'message' && entry.message?.role === 'toolResult';
		const isSummary = entry.type === 'branch_summary' || entry.type === 'compaction';
		const usage = readCacheUsage(isAssistant || isToolResult ? entry.message?.usage : isSummary ? entry.usage : undefined);
		if (!usage) continue;

		cacheRead += usage.cacheRead;
		cacheWrite += usage.cacheWrite;
		if (isAssistant) {
			const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
			latestCacheHitRate = promptTokens > 0 ? (usage.cacheRead / promptTokens) * 100 : undefined;
		}
	}

	if ((cacheRead === 0 && cacheWrite === 0) || latestCacheHitRate === undefined) return '';

	const parts: string[] = [];
	if (cacheRead > 0) parts.push(`R${formatTokens(cacheRead)}`);
	if (cacheWrite > 0) parts.push(`W${formatTokens(cacheWrite)}`);
	parts.push(`CH${latestCacheHitRate.toFixed(1)}%`);
	return parts.join(' ');
}

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
