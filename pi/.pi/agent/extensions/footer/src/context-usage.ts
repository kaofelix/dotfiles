const CONTEXT_BLOCK_TOKENS = 100_000;
const BLOCK_GLYPHS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

type ThemeLike = {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  getColorMode?: () => "truecolor" | "256color";
};

export type ContextUsageInfo = {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
};

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function getBarColor(percent: number): "accent" | "warning" | "error" {
  if (percent > 90) return "error";
  if (percent > 70) return "warning";
  return "accent";
}

function getPercentColor(percent: number): "dim" | "warning" | "error" {
  if (percent > 90) return "error";
  if (percent > 70) return "warning";
  return "dim";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getNeutralSlotBackground(theme: ThemeLike): string | undefined {
  const mode = theme.getColorMode?.();
  if (mode === "truecolor") return "\x1b[48;2;80;80;80m";
  if (mode === "256color") return "\x1b[48;5;238m";
  return undefined;
}

export function renderContextSlot(theme: ThemeLike, content: string): string {
  const background = getNeutralSlotBackground(theme);
  if (!background) return theme.bg("toolPendingBg", content);
  return `${background}${content}\x1b[49m`;
}

export function getContextBlockLevels(
  tokens: number,
  contextWindow: number,
  blockSize: number = CONTEXT_BLOCK_TOKENS,
): number[] {
  if (contextWindow <= 0 || blockSize <= 0) return [];

  const blockCount = Math.max(1, Math.ceil(contextWindow / blockSize));
  let remainingTokens = clamp(tokens, 0, contextWindow);
  const levels: number[] = [];

  for (let i = 0; i < blockCount; i++) {
    const blockCapacity = Math.min(
      blockSize,
      Math.max(0, contextWindow - i * blockSize),
    );
    const blockTokens = Math.min(remainingTokens, blockCapacity);
    remainingTokens -= blockTokens;

    if (blockTokens <= 0 || blockCapacity <= 0) {
      levels.push(0);
      continue;
    }

    const ratio = blockTokens / blockCapacity;
    levels.push(
      clamp(Math.round(ratio * BLOCK_GLYPHS.length), 1, BLOCK_GLYPHS.length),
    );
  }

  return levels;
}

export function renderContextUsageLine(
  theme: ThemeLike,
  usage: ContextUsageInfo,
): string {
  if (usage.tokens === null || usage.contextWindow <= 0) {
    return theme.fg("dim", "context unavailable");
  }

  const percentValue =
    usage.percent ?? (usage.tokens / usage.contextWindow) * 100;
  const barColor = getBarColor(percentValue);
  const percentColor = getPercentColor(percentValue);
  const blocks = getContextBlockLevels(usage.tokens, usage.contextWindow)
    .map((level) => {
      const glyph =
        level === 0 ? " " : theme.fg(barColor, BLOCK_GLYPHS[level - 1]);
      return renderContextSlot(theme, glyph);
    })
    .join(" ");

  const framedBlocks = `${theme.fg("dim", "⟦")}${blocks}${theme.fg("dim", "⟧")}`;
  const usageTokens = theme.fg(
    "dim",
    `${formatTokens(usage.tokens)}/${formatTokens(usage.contextWindow)}`,
  );
  const percent = theme.fg(percentColor, `${percentValue.toFixed(1)}%`);

  return `${framedBlocks} ${usageTokens} ${percent}`;
}
