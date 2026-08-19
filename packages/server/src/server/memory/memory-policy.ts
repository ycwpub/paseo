import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";

export type AgentMemoryMode = "on" | "off" | "read-only";

export type MemoryCommand =
  | { type: "set-mode"; mode: AgentMemoryMode }
  | { type: "forget"; query: string; all: boolean };

const MEMORY_MODE_LABEL = "paseo.memory-mode";

export function parseMemoryCommand(value: string): MemoryCommand | null {
  const trimmed = value.trim();
  const normalized = trimmed.toLowerCase();
  if (normalized === "/memory off" || normalized === "/记忆 关闭") {
    return { type: "set-mode", mode: "off" };
  }
  if (normalized === "/memory read-only" || normalized === "/记忆 只读") {
    return { type: "set-mode", mode: "read-only" };
  }
  if (normalized === "/memory on" || normalized === "/记忆 开启") {
    return { type: "set-mode", mode: "on" };
  }

  const allPatterns = [
    /^\/memory\s+forget\s+(?:all|everything)$/iu,
    /^\/记忆\s+忘记\s+(?:全部|所有)$/u,
    /^(?:forget|delete)\s+(?:all|everything)\s+(?:memory|memories)$/iu,
    /^(?:忘记|删除)(?:全部|所有)记忆$/u,
  ];
  if (allPatterns.some((pattern) => pattern.test(trimmed))) {
    return { type: "forget", query: "", all: true };
  }

  const forgetMatch =
    trimmed.match(/^\/memory\s+forget\s+(.+)$/iu) ??
    trimmed.match(/^\/记忆\s+忘记\s+(.+)$/u) ??
    trimmed.match(/^(?:please\s+)?forget\s+(.+)$/iu) ??
    trimmed.match(/^(?:请)?忘记(.+)$/u);
  const query = forgetMatch?.[1]?.trim();
  return query ? { type: "forget", query, all: false } : null;
}

export function resolveMemoryMode(labels: Record<string, string>): AgentMemoryMode {
  const value = labels[MEMORY_MODE_LABEL];
  return value === "off" || value === "read-only" ? value : "on";
}

export function isExplicitMemoryRequest(value: string): boolean {
  return /\b(?:remember|save this|store this)\b|(?:记住|请记忆|保存到记忆)/iu.test(value);
}

export function selectMemoryScope(
  requested: PaseoMemoryScope["type"] | undefined,
  scopes: readonly PaseoMemoryScope[],
  category: PaseoMemoryDetail["category"],
): PaseoMemoryScope {
  if (requested) {
    const match = scopes.find((scope) => scope.type === requested);
    if (match) return match;
  }
  const projectScope = scopes.find((scope) => scope.type === "project");
  if (
    projectScope &&
    (category === "project" || category === "procedure" || category === "decision")
  ) {
    return projectScope;
  }
  return scopes.find((scope) => scope.type === "global") ?? scopes[0] ?? { type: "global" };
}

export function describeMemoryScope(scope: PaseoMemoryScope): string {
  if (scope.type === "global") return "global";
  return `${scope.type}:${scope.id}`;
}
