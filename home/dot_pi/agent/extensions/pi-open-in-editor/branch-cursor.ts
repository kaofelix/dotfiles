export interface BranchManager<T> {
	getBranch(fromId?: string): T[];
}

export class BranchCursor {
	private leafId: string | null | undefined;

	setLeaf(leafId: string | null | undefined): void {
		this.leafId = leafId;
	}

	getBranch<T>(manager: BranchManager<T>): T[] {
		if (this.leafId === null) return [];
		return manager.getBranch(this.leafId);
	}
}
