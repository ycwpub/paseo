import type { PaseoMemoryDetail, PaseoMemoryScope } from "@getpaseo/protocol/messages";
import type { SelectFieldOption } from "@/components/ui/select-field";

export type MemoryStatusFilter = "all" | "active" | "superseded" | "expired" | "disputed";

export const MEMORY_CATEGORY_OPTIONS: SelectFieldOption<PaseoMemoryDetail["category"]>[] = [
  { id: "preference", value: "preference", label: "偏好" },
  { id: "fact", value: "fact", label: "事实" },
  { id: "procedure", value: "procedure", label: "流程" },
  { id: "decision", value: "decision", label: "决策" },
  { id: "project", value: "project", label: "项目知识" },
  { id: "other", value: "other", label: "其他" },
];

export const MEMORY_SCOPE_OPTIONS: SelectFieldOption<PaseoMemoryScope["type"]>[] = [
  { id: "global", value: "global", label: "全局" },
  { id: "project", value: "project", label: "Project" },
  { id: "assistant", value: "assistant", label: "助手" },
  { id: "workspace", value: "workspace", label: "Workspace" },
];

export const MEMORY_STATUS_OPTIONS: SelectFieldOption<MemoryStatusFilter>[] = [
  { id: "all", value: "all", label: "全部状态" },
  { id: "active", value: "active", label: "有效" },
  { id: "superseded", value: "superseded", label: "已被替代" },
  { id: "expired", value: "expired", label: "已过期" },
  { id: "disputed", value: "disputed", label: "有争议" },
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
  if (!scope || scope.type === "global") return "全局";
  let label = "Workspace";
  if (scope.type === "assistant") label = "助手";
  if (scope.type === "project") label = "Project";
  return `${label} · ${scope.id ?? "未指定"}`;
}

export function memoryStatus(
  detail: PaseoMemoryDetail,
  now = Date.now(),
): NonNullable<PaseoMemoryDetail["status"]> {
  if (detail.status && detail.status !== "active") return detail.status;
  if (detail.validUntil && new Date(detail.validUntil).getTime() <= now) return "expired";
  return "active";
}
