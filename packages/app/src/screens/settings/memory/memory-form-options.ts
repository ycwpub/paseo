import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import type { SelectFieldOption } from "@/components/ui/select-field";

export type MemoryStatusFilter = "all" | "active" | "superseded" | "expired" | "disputed";

export const MEMORY_CATEGORY_OPTIONS: SelectFieldOption<PaseoMemoryDetail["category"]>[] = [
  { id: "preference", value: "preference", label: "Preference" },
  { id: "fact", value: "fact", label: "Fact" },
  { id: "procedure", value: "procedure", label: "Procedure" },
  { id: "decision", value: "decision", label: "Decision" },
  { id: "project", value: "project", label: "Project" },
  { id: "other", value: "other", label: "Other" },
];

export const MEMORY_SCOPE_OPTIONS: SelectFieldOption<PaseoMemoryScope["type"]>[] = [
  { id: "global", value: "global", label: "Global" },
  { id: "project", value: "project", label: "Project" },
  { id: "assistant", value: "assistant", label: "Assistant" },
  { id: "workspace", value: "workspace", label: "Workspace" },
];

export const MEMORY_STATUS_OPTIONS: SelectFieldOption<MemoryStatusFilter>[] = [
  { id: "all", value: "all", label: "All states" },
  { id: "active", value: "active", label: "Active" },
  { id: "superseded", value: "superseded", label: "Superseded" },
  { id: "expired", value: "expired", label: "Expired" },
  { id: "disputed", value: "disputed", label: "Disputed" },
];

export const MEMORY_DETAIL_STATUS_OPTIONS: SelectFieldOption<
  NonNullable<PaseoMemoryDetail["status"]>
>[] = MEMORY_STATUS_OPTIONS.filter(
  (option): option is SelectFieldOption<NonNullable<PaseoMemoryDetail["status"]>> =>
    option.value !== "all",
);

export function memoryCategoryLabel(category: PaseoMemoryDetail["category"]): string {
  return MEMORY_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

export function memoryScopeLabel(scope: PaseoMemoryScope | undefined): string {
  if (!scope || scope.type === "global") return "Global";
  return `${scope.type[0]?.toUpperCase()}${scope.type.slice(1)} · ${scope.id ?? "unassigned"}`;
}

export function memoryStatus(
  detail: PaseoMemoryDetail,
  now = Date.now(),
): NonNullable<PaseoMemoryDetail["status"]> {
  if (detail.status && detail.status !== "active") return detail.status;
  if (detail.validUntil && new Date(detail.validUntil).getTime() <= now) return "expired";
  return "active";
}
