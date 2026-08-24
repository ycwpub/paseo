import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { memoryStatus, type MemoryStatusFilter } from "./memory-form-options";
import { memoryDetailScopes } from "./memory-multi-scope";

export type MemoryScopeFilter = "all" | Exclude<PaseoMemoryScope["type"], "workspace">;

export function parseMemoryImportance(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error("Importance must be a number from 0 to 1");
  }
  return parsed;
}

export function parseMemoryValidUntil(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const timestamp = new Date(trimmed);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new Error("Valid until must be an ISO date or date-time");
  }
  return timestamp.toISOString();
}

export function filterMemoryDetails(input: {
  details: readonly PaseoMemoryDetail[];
  search: string;
  status: MemoryStatusFilter;
  scope: MemoryScopeFilter;
  now?: number;
}): PaseoMemoryDetail[] {
  const query = input.search.trim().toLowerCase();
  return input.details.filter((detail) => {
    if (input.status !== "all" && memoryStatus(detail, input.now) !== input.status) return false;
    const scopes = memoryDetailScopes(detail);
    if (input.scope !== "all" && !scopes.some((scope) => scope.type === input.scope)) return false;
    if (!query) return true;
    return [
      detail.title,
      detail.content,
      detail.category,
      ...detail.keywords,
      ...scopes.flatMap((scope) => [scope.type, scope.id ?? ""]),
    ]
      .join("\n")
      .toLowerCase()
      .includes(query);
  });
}
