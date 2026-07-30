import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { openInEmacs } from "./emacsclient.ts";
import { combineFileReferences, type FileReference } from "./paths.ts";
import { FilePicker } from "./picker.ts";
import { getRecentFileReferences, getRecentlyMentionedFileReferences } from "./session.ts";

async function pickFile(ctx: ExtensionContext, references: FileReference[]): Promise<FileReference | null> {
	return ctx.ui.custom<FileReference | null>((tui, theme, keybindings, done) =>
		new FilePicker(references, tui, theme, keybindings, done, () => done(null)),
	);
}

async function openRecentFile(ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("open-in-editor requires interactive mode", "error");
		return;
	}

	const branch = ctx.sessionManager.getBranch();
	const mentioned = getRecentlyMentionedFileReferences(branch, ctx.cwd);
	const recent = getRecentFileReferences(branch, ctx.cwd);
	const references = combineFileReferences(mentioned, recent);
	if (references.length === 0) {
		ctx.ui.notify("No mentioned or recently accessed files found", "warning");
		return;
	}

	const selected = await pickFile(ctx, references);
	if (!selected) return;

	try {
		await openInEmacs(selected);
		ctx.ui.notify(`Opened ${selected.displayPath} in Emacs`, "info");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Could not open ${selected.displayPath}: ${message}`, "error");
	}
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("open-in-editor", {
		description: "Fuzzy-pick a mentioned or recently accessed file and open it in Emacs",
		handler: async (_args, ctx) => openRecentFile(ctx),
	});

	pi.registerShortcut("ctrl+shift+o", {
		description: "Open a mentioned or recently accessed file in Emacs",
		handler: openRecentFile,
	});
}
