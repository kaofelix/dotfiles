import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { openInEmacs } from "./emacsclient.ts";
import { extractFileReferences, type FileReference } from "./paths.ts";
import { FilePicker } from "./picker.ts";
import { getLastAssistantText } from "./session.ts";

async function pickFile(ctx: ExtensionContext, references: FileReference[]): Promise<FileReference | null> {
	return ctx.ui.custom<FileReference | null>((tui, theme, keybindings, done) =>
		new FilePicker(references, tui, theme, keybindings, done, () => done(null)),
	);
}

async function openMentionedFile(ctx: ExtensionContext): Promise<void> {
	if (ctx.mode !== "tui") {
		ctx.ui.notify("open-in-editor requires interactive mode", "error");
		return;
	}

	const text = getLastAssistantText(ctx.sessionManager.getBranch());
	if (!text) {
		ctx.ui.notify("The last agent message has no text", "warning");
		return;
	}

	const references = extractFileReferences(text, ctx.cwd);
	if (references.length === 0) {
		ctx.ui.notify("No existing file paths found in the last agent message", "warning");
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
		description: "Fuzzy-pick a file from the last agent message and open it in Emacs",
		handler: async (_args, ctx) => openMentionedFile(ctx),
	});

	pi.registerShortcut("ctrl+shift+o", {
		description: "Open a file from the last agent message in Emacs",
		handler: openMentionedFile,
	});
}
