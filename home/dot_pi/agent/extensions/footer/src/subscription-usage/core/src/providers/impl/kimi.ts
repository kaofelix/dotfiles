/**
 * Kimi Code usage provider
 */

import * as path from 'node:path';
import type { Dependencies, RateWindow, UsageSnapshot } from '../../types.js';
import { BaseProvider } from '../../provider.js';
import { fetchFailed, httpError, noCredentials } from '../../errors.js';
import { API_TIMEOUT_MS } from '../../config.js';
import { createTimeoutController, formatReset } from '../../utils.js';

const KIMI_USAGE_URL = 'https://api.kimi.com/coding/v1/usages';

type KimiUsageDetail = {
	name?: string;
	title?: string;
	used?: number | string;
	remaining?: number | string;
	limit?: number | string;
	resetTime?: string | number;
	reset_at?: string | number;
	reset_time?: string | number;
	reset_in?: number;
};

type KimiLimit = KimiUsageDetail & {
	detail?: KimiUsageDetail;
	window?: {
		duration?: number;
		timeUnit?: string;
		time_unit?: string;
	};
};

function readCredential(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseNumber(value: unknown): number | undefined {
	if (typeof value !== 'number' && typeof value !== 'string') return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function loadKimiApiKey(deps: Dependencies): string | undefined {
	const envKey =
		readCredential(deps.env.KIMI_CODING_API_KEY) ?? readCredential(deps.env.KIMI_API_KEY);
	if (envKey) return envKey;

	const authPath = path.join(deps.homedir(), '.pi', 'agent', 'auth.json');
	try {
		if (deps.fileExists(authPath)) {
			const auth = JSON.parse(deps.readFile(authPath) ?? '{}');
			const entry = auth['kimi-coding'] ?? auth.kimi;
			const key = readCredential(entry?.key) ?? readCredential(entry?.access);
			if (key) return key;
		}
	} catch {
		// Ignore malformed auth files.
	}

	const kimiHome = deps.env.KIMI_SHARE_DIR || path.join(deps.homedir(), '.kimi');
	const configPath = path.join(kimiHome, 'config.json');
	try {
		if (deps.fileExists(configPath)) {
			const config = JSON.parse(deps.readFile(configPath) ?? '{}');
			const providers = config.providers;
			if (providers && typeof providers === 'object') {
				for (const provider of Object.values(providers) as Array<Record<string, unknown>>) {
					const baseUrl = readCredential(provider?.base_url);
					if (baseUrl?.replace(/\/$/, '') !== 'https://api.kimi.com/coding/v1') continue;
					const key = readCredential(provider?.api_key);
					if (key) return key;
				}
			}
		}
	} catch {
		// Ignore malformed Kimi CLI configuration.
	}

	return undefined;
}

function parseReset(detail: KimiUsageDetail): Date | undefined {
	const raw = detail.resetTime ?? detail.reset_at ?? detail.reset_time;
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
	}
	if (typeof raw === 'string' && raw.trim()) {
		const date = new Date(raw);
		if (!Number.isNaN(date.getTime())) return date;
	}
	if (typeof detail.reset_in === 'number' && Number.isFinite(detail.reset_in)) {
		return new Date(Date.now() + detail.reset_in * 1000);
	}
	return undefined;
}

function windowLabel(limit: KimiLimit, index: number): string {
	const detail = limit.detail ?? limit;
	const explicit = detail.name ?? detail.title ?? limit.name ?? limit.title;
	if (explicit?.trim()) return explicit.trim();

	const duration = limit.window?.duration;
	const unit = (limit.window?.timeUnit ?? limit.window?.time_unit ?? '').toUpperCase();
	if (typeof duration === 'number' && duration > 0) {
		if (unit.includes('MINUTE')) {
			return duration >= 60 && duration % 60 === 0 ? `${duration / 60}h` : `${duration}m`;
		}
		if (unit.includes('HOUR')) return `${duration}h`;
		if (unit.includes('DAY')) return duration === 7 ? 'Week' : `${duration}d`;
		if (unit.includes('MONTH')) return duration === 1 ? 'Month' : `${duration}mo`;
	}
	return `Limit ${index + 1}`;
}

function toRateWindow(detail: KimiUsageDetail, label: string): RateWindow | undefined {
	const limit = parseNumber(detail.limit);
	if (limit === undefined || limit <= 0) return undefined;

	const explicitUsed = parseNumber(detail.used);
	const remaining = parseNumber(detail.remaining);
	const used = explicitUsed ?? (remaining !== undefined ? limit - remaining : undefined);
	if (used === undefined) return undefined;

	const resetAt = parseReset(detail);
	return {
		label,
		usedPercent: Math.min(100, Math.max(0, (used / limit) * 100)),
		resetDescription: resetAt ? formatReset(resetAt) : undefined,
		resetAt: resetAt?.toISOString(),
	};
}

export class KimiProvider extends BaseProvider {
	readonly name = 'kimi' as const;
	readonly displayName = 'Kimi Code Plan';

	hasCredentials(deps: Dependencies): boolean {
		return Boolean(loadKimiApiKey(deps));
	}

	async fetchUsage(deps: Dependencies): Promise<UsageSnapshot> {
		const apiKey = loadKimiApiKey(deps);
		if (!apiKey) return this.emptySnapshot(noCredentials());

		const { controller, clear } = createTimeoutController(API_TIMEOUT_MS);
		try {
			const response = await deps.fetch(KIMI_USAGE_URL, {
				headers: {
					Authorization: `Bearer ${apiKey}`,
					Accept: 'application/json',
				},
				signal: controller.signal,
			});
			clear();
			if (!response.ok) return this.emptySnapshot(httpError(response.status));

			const payload = (await response.json()) as {
				usage?: KimiUsageDetail;
				limits?: KimiLimit[];
			};
			const windows: RateWindow[] = [];
			if (payload.usage) {
				const weekly = toRateWindow(
					payload.usage,
					payload.usage.name ?? payload.usage.title ?? 'Week',
				);
				if (weekly) windows.push(weekly);
			}
			for (const [index, limit] of (payload.limits ?? []).entries()) {
				const detail = limit.detail ?? limit;
				const window = toRateWindow(detail, windowLabel(limit, index));
				if (window) windows.push(window);
			}

			return this.snapshot({ windows });
		} catch {
			clear();
			return this.emptySnapshot(fetchFailed());
		}
	}
}
