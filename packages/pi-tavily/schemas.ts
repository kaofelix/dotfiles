import { Type, type Static } from 'typebox';
import { StringEnum } from '@earendil-works/pi-ai';

const boolean = (description: string) => Type.Optional(Type.Boolean({description}));
const domains = (description: string, maxItems: number) => Type.Optional(Type.Array(Type.String({minLength: 1}), {description, maxItems}));
const date = (description: string) => Type.Optional(Type.String({description, pattern: '^\\d{4}-\\d{2}-\\d{2}$'}));

export const SearchParams = Type.Object({
  query: Type.String({description: 'Search query (max 400 characters)', minLength: 1, maxLength: 400}),
  searchDepth: Type.Optional(StringEnum(['basic', 'advanced', 'fast', 'ultra-fast'] as const, {description: 'basic: 1 credit; advanced: 2 credits; fast/ultra-fast: low-latency, 1 credit. Default basic unless autoParameters is enabled.'})),
  topic: Type.Optional(StringEnum(['general', 'news', 'finance'] as const, {description: 'Search category (default general)'})),
  days: Type.Optional(Type.Integer({minimum: 1, description: 'News lookback in days (news topic only)'})),
  maxResults: Type.Optional(Type.Integer({minimum: 1, maximum: 20, default: 5, description: 'Maximum results (default 5)'})),
  includeAnswer: Type.Optional(Type.Union([Type.Boolean(), StringEnum(['basic', 'advanced'] as const)], {description: 'Include a synthesized answer; true or basic/advanced (default false)'})),
  includeRawContent: Type.Optional(Type.Union([Type.Literal(false), StringEnum(['markdown', 'text'] as const)], {description: 'Include cleaned full source content, not HTML (default false)'})),
  includeDomains: domains('Domains to restrict to or prefer', 300),
  excludeDomains: domains('Domains to exclude', 150),
  includeDomainsMode: Type.Optional(StringEnum(['restrict', 'prefer'] as const, {description: 'Hard domain restriction or soft preference (default restrict)'})),
  includeImages: boolean('Include image URLs (default false)'),
  includeImageDescriptions: boolean('Describe images; requires includeImages true'),
  timeRange: Type.Optional(StringEnum(['year', 'month', 'week', 'day', 'y', 'm', 'w', 'd'] as const, {description: 'Restrict result freshness'})),
  startDate: date('Only results after this YYYY-MM-DD date'),
  endDate: date('Only results before this YYYY-MM-DD date'),
  exactMatch: boolean('Match quoted phrases exactly (default false)'),
  chunksPerSource: Type.Optional(Type.Integer({minimum: 1, maximum: 3, description: 'Relevant snippets per result for basic, advanced or fast search (not ultra-fast)'})),
  country: Type.Optional(Type.String({minLength: 1, description: 'Boost results from this country; general topic only (e.g. united states)'})),
  language: Type.Optional(Type.String({minLength: 1, description: 'Preferred language code (e.g. en)'})),
  filterByLanguage: boolean('Filter by language instead of just boosting; requires language'),
  autoParameters: boolean('Opt in to inferred search settings; may choose advanced and cost 2 credits. Explicit settings override inferred ones.'),
  timeout: Type.Optional(Type.Number({minimum: 1, maximum: 120, description: 'Total request timeout in seconds (default 60)'})),
}, {additionalProperties: false});

export const ExtractParams = Type.Object({
  urls: Type.Array(Type.String({pattern: '^https?://[^\\s]+$'}), {minItems: 1, maxItems: 20, description: 'HTTP(S) URLs to extract (max 20)'}),
  query: Type.Optional(Type.String({minLength: 1, maxLength: 400, description: 'Rerank extracted chunks for this intent; omit to retrieve full pages'})),
  chunksPerSource: Type.Optional(Type.Integer({minimum: 1, maximum: 5, description: 'Relevant chunks per page; requires query (default 3)'})),
  extractDepth: Type.Optional(StringEnum(['basic', 'advanced'] as const, {description: 'basic: 1 credit per 5 successes; advanced: tables/embedded content, 2 credits per 5 successes'})),
  format: Type.Optional(StringEnum(['markdown', 'text'] as const, {description: 'Cleaned content format (default markdown)'})),
  includeImages: boolean('Include extracted image URLs (default false)'),
  timeout: Type.Optional(Type.Number({minimum: 1, maximum: 60, description: 'Total timeout in seconds (default 30); API extraction default is 10 basic / 30 advanced'})),
}, {additionalProperties: false});

const nullableString = Type.Union([Type.String(), Type.Null()]);
const Image = Type.Object({url: Type.String(), description: Type.Optional(Type.String())});
const Source = Type.Object({
  url: Type.String(), title: Type.Optional(nullableString), content: Type.Optional(nullableString),
  rawContent: Type.Optional(nullableString), score: Type.Optional(Type.Number()),
  publishedDate: Type.Optional(nullableString), id: Type.Optional(Type.String()),
  favicon: Type.Optional(nullableString), images: Type.Optional(Type.Array(Type.Union([Image, Type.String()]))),
});

export const OutputSchema = Type.Object({
  operation: StringEnum(['search', 'extract'] as const), status: StringEnum(['success', 'partial', 'error'] as const),
  resultCount: Type.Integer(), successCount: Type.Integer(), failedCount: Type.Integer(),
  results: Type.Array(Source), failedResults: Type.Array(Type.Object({url: Type.String(), error: Type.String()})),
  images: Type.Optional(Type.Array(Image)), answer: Type.Optional(nullableString), query: Type.Optional(Type.String()),
  responseTime: Type.Optional(Type.Number()), requestId: Type.Optional(Type.String()),
  usage: Type.Optional(Type.Object({credits: Type.Number()})),
  autoParameters: Type.Optional(Type.Record(Type.String(), Type.Unknown())), favicon: Type.Optional(nullableString),
  error: Type.Optional(Type.String()), truncated: Type.Boolean(),
  fullOutputPath: Type.Optional(Type.String()), fullResponsePath: Type.Optional(Type.String()),
}, {additionalProperties: false});

export type SearchParameters = Static<typeof SearchParams>;
export type ExtractParameters = Static<typeof ExtractParams>;
