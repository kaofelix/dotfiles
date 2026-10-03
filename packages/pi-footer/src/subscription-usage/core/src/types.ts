/**
 * Core types for the sub-bar extension
 */

import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";

export type {
	ProviderName,
	StatusIndicator,
	ProviderStatus,
	RateWindow,
	UsageSnapshot,
	UsageError,
	UsageErrorCode,
	ProviderUsageEntry,
} from "../../shared.js";

export { PROVIDERS } from "../../shared.js";

/**
 * Dependencies that can be injected for testing
 */
export interface Dependencies {
	fetch: typeof globalThis.fetch;
	readFile: (path: string) => string | undefined;
	fileExists: (path: string) => boolean;
	// Use static commands/args only (no user-controlled input).
	execFileSync: (file: string, args: string[], options?: ExecFileSyncOptionsWithStringEncoding) => string;
	homedir: () => string;
	env: NodeJS.ProcessEnv;
}
