import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import {
  effectiveMemoryStatus,
  isMemoryScopeVisible,
  memoryFeedbackWeight,
  memoryFreshnessWeight,
  memoryScopeKey,
} from "./memory-model.js";

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

interface MemoryDocument {
  detail: PaseoMemoryDetail;
  tokens: string[];
  tokenSet: ReadonlySet<string>;
  titleTokens: ReadonlySet<string>;
  keywordTokens: ReadonlySet<string>;
}

export interface MemoryRetrievalMatch {
  detail: PaseoMemoryDetail;
  score: number;
  reasons: string[];
}

export interface MemoryRetrievalOptions {
  limit: number;
  maxCandidates?: number;
  scopes?: readonly PaseoMemoryScope[];
  now?: number;
  includeBaseline?: boolean;
}

function tokenize(value: string): string[] {
  const normalized = value.toLowerCase();
  const tokens = normalized
    .split(/[^\p{L}\p{N}]+/gu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
  const chineseRuns = normalized.match(/[\u3400-\u9fff]+/gu) ?? [];
  for (const run of chineseRuns) {
    tokens.push(run);
    for (let index = 0; index < run.length - 1; index += 1) {
      tokens.push(run.slice(index, index + 2));
    }
  }
  return tokens;
}

function createDocument(detail: PaseoMemoryDetail): MemoryDocument {
  const titleTokens = new Set(tokenize(detail.title));
  const keywordTokens = new Set(tokenize(detail.keywords.join(" ")));
  const contentTokens = tokenize(detail.content);
  return {
    detail,
    titleTokens,
    keywordTokens,
    tokens: [...titleTokens, ...keywordTokens, ...contentTokens],
    tokenSet: new Set([...titleTokens, ...keywordTokens, ...contentTokens]),
  };
}

function termFrequency(tokens: readonly string[], term: string): number {
  let count = 0;
  for (const token of tokens) {
    if (token === term) count += 1;
  }
  return count / Math.max(1, tokens.length);
}

function lexicalScore(
  query: ReadonlySet<string>,
  documents: readonly MemoryDocument[],
  index: number,
) {
  const document = documents[index]!;
  let score = 0;
  for (const term of query) {
    const documentFrequency = documents.reduce(
      (count, candidate) => count + (candidate.tokenSet.has(term) ? 1 : 0),
      0,
    );
    const inverseDocumentFrequency = Math.log(
      1 + documents.length / Math.max(1, documentFrequency),
    );
    const fieldBoost =
      (document.titleTokens.has(term) ? 4 : 0) + (document.keywordTokens.has(term) ? 2 : 0);
    score += (termFrequency(document.tokens, term) + fieldBoost) * inverseDocumentFrequency;
  }
  return score;
}

function fuzzyScore(queryText: string, detail: PaseoMemoryDetail): number {
  const queryBigrams = new Set(tokenize(queryText).filter((token) => token.length === 2));
  if (queryBigrams.size === 0) return 0;
  const candidate = new Set(
    tokenize(`${detail.title} ${detail.keywords.join(" ")} ${detail.content}`),
  );
  let overlap = 0;
  for (const token of queryBigrams) {
    if (candidate.has(token)) overlap += 1;
  }
  return overlap / queryBigrams.size;
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, left.size + right.size - overlap);
}

function diversify(
  matches: readonly MemoryRetrievalMatch[],
  limit: number,
): MemoryRetrievalMatch[] {
  const selected: MemoryRetrievalMatch[] = [];
  const remaining = [...matches];
  while (selected.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const candidateTokens = new Set(tokenize(candidate.detail.content));
      const redundancy = selected.reduce(
        (max, existing) =>
          Math.max(max, jaccard(candidateTokens, new Set(tokenize(existing.detail.content)))),
        0,
      );
      const score = candidate.score * 0.82 - redundancy * 0.18;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return selected;
}

export function retrieveRelevantMemoryMatches(
  prompt: string,
  details: readonly PaseoMemoryDetail[],
  options: MemoryRetrievalOptions,
): MemoryRetrievalMatch[] {
  if (options.limit <= 0) return [];
  const now = options.now ?? Date.now();
  const query = new Set(tokenize(prompt));
  const visible = details.filter(
    (detail) =>
      effectiveMemoryStatus(detail, now) === "active" &&
      (!options.scopes || isMemoryScopeVisible(detail.scope, options.scopes)),
  );
  const baselineMatches = options.includeBaseline
    ? visible
        .filter(
          (detail) =>
            memoryScopeKey(detail.scope) === "global" &&
            detail.category === "preference" &&
            (detail.origin === "explicit" || (detail.importance ?? 0.5) >= 0.8),
        )
        .map((detail) => ({
          detail,
          score:
            0.25 +
            (detail.origin === "explicit" ? 0.15 : 0) +
            (detail.importance ?? 0.5) * 0.1 +
            memoryFeedbackWeight(detail) * 0.05,
          reasons: ["baseline"],
        }))
        .toSorted(
          (left, right) =>
            right.score - left.score || right.detail.updatedAt.localeCompare(left.detail.updatedAt),
        )
    : [];
  if (query.size === 0) return baselineMatches.slice(0, options.limit);
  const documents = visible.map(createDocument);
  const topicalMatches = documents
    .map((document, index) => {
      const lexical = lexicalScore(query, documents, index);
      const fuzzy = fuzzyScore(prompt, document.detail);
      const confidence = document.detail.confidence;
      const importance = document.detail.importance ?? 0.5;
      const freshness = memoryFreshnessWeight(document.detail, now);
      const feedback = memoryFeedbackWeight(document.detail);
      const explicitBoost = document.detail.origin === "explicit" ? 0.18 : 0;
      const scopeBoost = memoryScopeKey(document.detail.scope) === "global" ? 0 : 0.12;
      const hasTopicalMatch = lexical > 0 || fuzzy > 0;
      const score =
        lexical * 0.58 +
        fuzzy * 0.12 +
        confidence * 0.08 +
        importance * 0.08 +
        freshness * 0.07 +
        feedback * 0.07 +
        explicitBoost +
        scopeBoost;
      const reasons = [
        lexical > 0 ? "keyword" : null,
        fuzzy > 0 ? "semantic" : null,
        explicitBoost > 0 ? "explicit" : null,
        scopeBoost > 0 ? "scope" : null,
      ].filter((value): value is string => value !== null);
      return { detail: document.detail, score, reasons, hasTopicalMatch };
    })
    .filter((entry) => entry.hasTopicalMatch && entry.score > 0.1)
    .toSorted(
      (left, right) =>
        right.score - left.score || right.detail.updatedAt.localeCompare(left.detail.updatedAt),
    )
    .slice(0, options.maxCandidates ?? Math.max(options.limit * 6, 12))
    .map(({ hasTopicalMatch: _hasTopicalMatch, ...entry }) => entry);
  const topicalIds = new Set(topicalMatches.map((match) => match.detail.id));
  return diversify(
    [...topicalMatches, ...baselineMatches.filter((match) => !topicalIds.has(match.detail.id))],
    options.limit,
  );
}

export function retrieveRelevantMemoryDetails(
  prompt: string,
  details: readonly PaseoMemoryDetail[],
  options: MemoryRetrievalOptions,
): PaseoMemoryDetail[] {
  return retrieveRelevantMemoryMatches(prompt, details, options).map((match) => match.detail);
}
