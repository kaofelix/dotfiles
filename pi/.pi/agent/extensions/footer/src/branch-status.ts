type ThemeLike = {
	fg(color: string, text: string): string;
	bold(text: string): string;
};

export const DIRTY_BRANCH_MARKER = "__PI_FOOTER_DIRTY_BRANCH_MARKER__";

export function formatBranchSuffix(branch: string, isDirty: boolean | null): string {
	if (!isDirty) {
		return ` (${branch})`;
	}

	return ` (${branch}${DIRTY_BRANCH_MARKER})`;
}

export function truncateFooterPath(text: string, width: number): string {
	const markerToken = Symbol("dirty-branch-marker");
	const units: Array<string | typeof markerToken> = [];
	const parts = text.split(DIRTY_BRANCH_MARKER);

	for (const [index, part] of parts.entries()) {
		units.push(...part);
		if (index < parts.length - 1) {
			units.push(markerToken);
		}
	}

	const joinUnits = (selected: Array<string | typeof markerToken>): string =>
		selected.map((unit) => (unit === markerToken ? DIRTY_BRANCH_MARKER : unit)).join("");

	if (units.length <= width) {
		return text;
	}

	const half = Math.floor(width / 2) - 2;
	if (half > 1) {
		const start = joinUnits(units.slice(0, half));
		const end = joinUnits(units.slice(-(half - 1)));
		return `${start}...${end}`;
	}

	return joinUnits(units.slice(0, Math.max(1, width)));
}

export function renderDimmedFooterPath(theme: ThemeLike, text: string): string {
	const [beforeMarker, ...afterMarkerParts] = text.split(DIRTY_BRANCH_MARKER);
	if (afterMarkerParts.length === 0) {
		return theme.fg("dim", text);
	}

	const afterMarker = afterMarkerParts.join(DIRTY_BRANCH_MARKER);
	return `${theme.fg("dim", beforeMarker)}${theme.fg("warning", theme.bold("✦"))}${theme.fg("dim", afterMarker)}`;
}
