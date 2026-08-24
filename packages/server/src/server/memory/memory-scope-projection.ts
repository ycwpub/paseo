import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { memoryScopeKey, normalizeMemoryScope } from "./memory-model.js";
import { selectMemoryScope } from "./memory-policy.js";

const GLOBAL_KNOWLEDGE_PATTERNS = [
  /\b(?:cli|command|commands|skill|skills|plugin|plugins|repository|repositories|repo|repos)\b/iu,
  /(?:命令行|命令|技能|插件|代码仓库|仓库|术语|缩写|常用工具|工具链)/u,
];

function uniqueScopes(scopes: readonly PaseoMemoryScope[]): PaseoMemoryScope[] {
  const unique = new Map<string, PaseoMemoryScope>();
  for (const rawScope of scopes) {
    const scope = normalizeMemoryScope(rawScope);
    unique.set(memoryScopeKey(scope), scope);
  }
  return [...unique.values()];
}

export function shouldPromoteMemoryToGlobal(input: {
  title: string;
  content: string;
  keywords: readonly string[];
  category: PaseoMemoryDetail["category"];
}): boolean {
  if (input.category === "preference") return true;
  const searchable = [input.title, input.content, ...input.keywords].join("\n");
  return GLOBAL_KNOWLEDGE_PATTERNS.some((pattern) => pattern.test(searchable));
}

export function projectMemoryScopes(input: {
  requestedScopeType?: PaseoMemoryScope["type"];
  availableScopes: readonly PaseoMemoryScope[];
  category: PaseoMemoryDetail["category"];
  title: string;
  content: string;
  keywords: readonly string[];
}): PaseoMemoryScope[] {
  // COMPAT(memory-workspace-scope): old callers may still send Workspace,
  // but new memories are never projected to that removed storage level.
  const availableScopes = uniqueScopes(input.availableScopes).filter(
    (scope) => scope.type !== "workspace",
  );
  const selected = selectMemoryScope(input.requestedScopeType, availableScopes, input.category);
  const project = availableScopes.find((scope) => scope.type === "project");
  const assistant = availableScopes.find((scope) => scope.type === "assistant");
  const global = availableScopes.find((scope) => scope.type === "global");
  const primary = project ?? assistant ?? selected;
  const projected: PaseoMemoryScope[] = [primary];

  if (assistant && primary.type !== "global") projected.push(assistant);
  if (selected.type !== "global" && selected.type !== "workspace") projected.push(selected);
  if (
    global &&
    (selected.type === "global" ||
      shouldPromoteMemoryToGlobal({
        title: input.title,
        content: input.content,
        keywords: input.keywords,
        category: input.category,
      }))
  ) {
    projected.push(global);
  }
  return uniqueScopes(projected);
}
