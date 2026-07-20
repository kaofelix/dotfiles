export interface FileReference {
	path: string;
	displayPath: string;
	line?: number;
	column?: number;
}

import { statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";

function resolveCandidate(candidate: string, cwd: string): string {
	const expanded = candidate === "~" || candidate.startsWith("~/")
		? homedir() + candidate.slice(1)
		: candidate;
	return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

interface Candidate {
	value: string;
	index: number;
}

function collectCandidates(text: string): Candidate[] {
	const patterns = [
		/`([^`\n]+)`/g,
		/\]\(([^)\n]+)\)/g,
		/(?:~|\.{0,2})?\/?[A-Za-z0-9_@+.-]+(?:\/[A-Za-z0-9_@+.-]+)*(?::\d+(?::\d+)?|#L\d+(?:C\d+)?)?/g,
	];
	const candidates: Candidate[] = [];

	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) {
			candidates.push({ value: match[1] ?? match[0], index: match.index });
		}
	}

	return candidates.sort((a, b) => a.index - b.index);
}

export function extractFileReferences(text: string, cwd: string): FileReference[] {
	const references: FileReference[] = [];
	const seen = new Set<string>();

	for (const candidate of collectCandidates(text)) {
		const token = candidate.value
			.trim()
			.replace(/^<|>$/g, "")
			.replace(/^[`'"([]+|[`'"\]),;!?]+$/g, "")
			.replace(/\.$/, "")
			.replace(/^@/, "");
		if (/^[a-z][a-z\d+.-]*:\/\//i.test(token)) continue;
		const colonLocation = token.match(/:(\d+)(?::(\d+))?$/);
		const hashLocation = token.match(/#L(\d+)(?:C(\d+))?$/i);
		const location = colonLocation ?? hashLocation;
		const displayPath = location ? token.slice(0, location.index) : token;
		if (!displayPath) continue;
		const path = resolveCandidate(displayPath, cwd);
		if (!isFile(path) || seen.has(path)) continue;
		seen.add(path);
		references.push({
			path,
			displayPath,
			...(location ? { line: Number(location[1]), ...(location[2] ? { column: Number(location[2]) } : {}) } : {}),
		});
	}

	return references;
}
