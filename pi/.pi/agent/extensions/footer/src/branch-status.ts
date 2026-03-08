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

export function renderDimmedFooterPath(theme: ThemeLike, text: string): string {
	const [beforeMarker, ...afterMarkerParts] = text.split(DIRTY_BRANCH_MARKER);
	if (afterMarkerParts.length === 0) {
		return theme.fg("dim", text);
	}

	const afterMarker = afterMarkerParts.join(DIRTY_BRANCH_MARKER);
	return `${theme.fg("dim", beforeMarker)}${theme.fg("warning", theme.bold("✦"))}${theme.fg("dim", afterMarker)}`;
}
