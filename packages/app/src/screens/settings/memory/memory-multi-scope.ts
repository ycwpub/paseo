import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";

const SCOPE_TYPES = new Set<PaseoMemoryScope["type"]>(["global", "project", "assistant"]);

function scopeKey(scope: PaseoMemoryScope): string {
  return `${scope.type}:${scope.id ?? ""}`;
}

export function memoryDetailScopes(
  detail: Pick<PaseoMemoryDetail, "scope" | "scopes">,
): PaseoMemoryScope[] {
  const values = detail.scopes?.length ? detail.scopes : [detail.scope ?? { type: "global" }];
  const unique = new Map<string, PaseoMemoryScope>();
  for (const scope of values) {
    // COMPAT(memory-workspace-scope): old daemons may still return Workspace
    // projections. The removed level is not exposed by the current UI.
    if (scope.type === "workspace") continue;
    unique.set(scopeKey(scope), scope);
  }
  return [...unique.values()];
}

export function memoryDetailHasScope(
  detail: Pick<PaseoMemoryDetail, "scope" | "scopes">,
  scope: PaseoMemoryScope,
): boolean {
  return memoryDetailScopes(detail).some((candidate) => scopeKey(candidate) === scopeKey(scope));
}

export function formatAdditionalMemoryScopes(
  detail: Pick<PaseoMemoryDetail, "scope" | "scopes">,
): string {
  return memoryDetailScopes(detail)
    .slice(1)
    .map((scope) => (scope.type === "global" ? "global" : `${scope.type}:${scope.id ?? ""}`))
    .join(", ");
}

export function parseMemoryScopes(input: {
  primary: PaseoMemoryScope;
  additional: string;
  globalUserId: string;
}): PaseoMemoryScope[] {
  if (input.primary.type === "workspace") {
    throw new Error("Workspace 记忆已移除，请选择所属 Project。");
  }
  const scopes = new Map<string, PaseoMemoryScope>();
  const add = (scope: PaseoMemoryScope) => scopes.set(scopeKey(scope), scope);
  add(input.primary);
  for (const rawValue of input.additional.split(/[,\n]/u)) {
    const value = rawValue.trim();
    if (!value) continue;
    if (value === "global") {
      add({ type: "global", id: input.globalUserId });
      continue;
    }
    const separator = value.indexOf(":");
    const type = value.slice(0, separator) as PaseoMemoryScope["type"];
    const id = value.slice(separator + 1).trim();
    if (type === "workspace") {
      throw new Error("Workspace 记忆已移除，请选择所属 Project。");
    }
    if (separator <= 0 || !SCOPE_TYPES.has(type) || type === "global" || !id) {
      throw new Error(`无效的记忆作用域：${value}`);
    }
    add({ type, id });
  }
  return [...scopes.values()];
}
