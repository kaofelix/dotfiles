/**
 * Core types for the sub-bar extension
 */

export type {
	ProviderName,
	StatusIndicator,
	ProviderStatus,
	RateWindow,
	UsageSnapshot,
	UsageError,
	UsageErrorCode,
	ProviderUsageEntry,
	SubCoreState,
	SubCoreAllState,
	SubCoreEvents,
} from "../../shared.js";

export { PROVIDERS } from "../../shared.js";

export type ModelInfo = {
	provider?: string;
	id?: string;
	scopedModelPatterns?: string[];
};
