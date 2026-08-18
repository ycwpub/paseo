import type { PaseoMemoryDetail } from "@getpaseo/protocol/messages";

const STOP_WORDS = new Set([
  "and",
  "are",
  "for",
  "from",
  "the",
  "this",
  "that",
  "then",
  "with",
  "you",
  "your",
]);

function tokenize(value: string): Set<string> {
  const normalized = value.toLowerCase();
  const tokens = new Set(
    normalized
      .split(/[^\p{L}\p{N}]+/gu)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  );
  const chineseRuns = normalized.match(/[\u3400-\u9fff]+/gu) ?? [];
  for (const run of chineseRuns) {
    if (run.length <= 2) {
      tokens.add(run);
      continue;
    }
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.add(run.slice(index, index + 2));
    }
  }
  return tokens;
}

function overlapScore(query: ReadonlySet<string>, value: string): number {
  const candidate = tokenize(value);
  let overlap = 0;
  for (const token of query) {
    if (candidate.has(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

export function retrieveRelevantMemoryDetails(
  prompt: string,
  details: readonly PaseoMemoryDetail[],
  options: { limit: number },
): PaseoMemoryDetail[] {
  if (options.limit <= 0) {
    return [];
  }
  const query = tokenize(prompt);
  if (query.size === 0) {
    return [];
  }
  return details
    .map((detail) => ({
      detail,
      score:
        overlapScore(query, detail.title) * 5 +
        overlapScore(query, detail.keywords.join(" ")) * 3 +
        overlapScore(query, detail.content),
    }))
    .filter((entry) => entry.score > 0)
    .toSorted(
      (left, right) =>
        right.score - left.score || right.detail.updatedAt.localeCompare(left.detail.updatedAt),
    )
    .slice(0, options.limit)
    .map((entry) => entry.detail);
}
