import { Value } from 'typebox/value';
import type { TavilySearchOptions, TavilyExtractOptions } from '@tavily/core';
import { SearchParams, ExtractParams, type SearchParameters, type ExtractParameters } from './schemas.ts';

export function searchOptions(params: SearchParameters): TavilySearchOptions {
  if (!Value.Check(SearchParams, params)) throw new Error('Invalid search parameters; check types, ranges and date format');
  if (!params.query.trim()) throw new Error('query must not be blank');
  if (params.days !== undefined && params.topic !== 'news') throw new Error('days requires topic news');
  if (params.country && params.topic && params.topic !== 'general') throw new Error('country requires topic general');
  if (params.includeImageDescriptions && !params.includeImages) throw new Error('includeImageDescriptions requires includeImages true');
  if (params.filterByLanguage && !params.language?.trim()) throw new Error('filterByLanguage requires language');
  if (params.chunksPerSource !== undefined && params.searchDepth === 'ultra-fast') throw new Error('chunksPerSource is unavailable for ultra-fast search');
  if (params.includeDomainsMode && !params.includeDomains?.length) throw new Error('includeDomainsMode requires includeDomains');
  for (const date of [params.startDate, params.endDate]) {
    if (date && (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Dates must be real calendar dates in YYYY-MM-DD format');
  }
  if (params.startDate && params.endDate && params.startDate > params.endDate) throw new Error('startDate must not be after endDate');
  const {query, ...options} = params;
  return {...options, maxResults: params.maxResults ?? 5, includeUsage: true};
}

export function extractOptions(params: ExtractParameters): TavilyExtractOptions {
  if (!Value.Check(ExtractParams, params)) throw new Error('Invalid extraction parameters; check types, ranges and HTTP(S) URLs');
  for (const address of params.urls) {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error('URLs must be HTTP(S) with a host and without embedded credentials');
  }
  if (params.query !== undefined && !params.query.trim()) throw new Error('query must not be blank');
  if (params.chunksPerSource !== undefined && !params.query) throw new Error('chunksPerSource requires query');
  const {urls, ...options} = params;
  return {...options, includeUsage: true};
}
