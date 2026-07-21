import type { FileReference, FileReferenceSource } from "./paths.ts";

export interface FileReferenceSection {
	source: FileReferenceSource;
	title: string;
	references: FileReference[];
}

const sectionDefinitions: Array<{ source: FileReferenceSource; title: string }> = [
	{ source: "mentioned", title: "Mentioned in last response" },
	{ source: "edited", title: "Recent edits" },
	{ source: "read", title: "Recent reads" },
];

export function groupFileReferences(references: FileReference[]): FileReferenceSection[] {
	return sectionDefinitions.flatMap(({ source, title }) => {
		const sectionReferences = references.filter((reference) => reference.source === source);
		return sectionReferences.length > 0 ? [{ source, title, references: sectionReferences }] : [];
	});
}
