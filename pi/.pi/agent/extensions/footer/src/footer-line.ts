import { visibleWidth } from '@mariozechner/pi-tui';

export type FooterModelInfo = {
	id: string;
	provider: string;
	reasoning?: boolean;
};

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
