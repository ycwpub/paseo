import type {
  PaseoMemoryDetail,
  PaseoMemoryScope,
  PaseoMemoryUpdateInput,
} from "@getpaseo/protocol/messages";
import { memoryStatus } from "./memory-form-options";
import { parseMemoryImportance, parseMemoryValidUntil } from "./memory-view-model";

export interface MemoryDetailDraft {
  title: string;
  category: PaseoMemoryDetail["category"];
  content: string;
  keywords: string;
  scopeType: PaseoMemoryScope["type"];
  scopeId: string;
  status: NonNullable<PaseoMemoryDetail["status"]>;
  importance: string;
  validUntil: string;
}

export function memoryDetailDraft(detail: PaseoMemoryDetail): MemoryDetailDraft {
  return {
    title: detail.title,
    category: detail.category,
    content: detail.content,
    keywords: detail.keywords.join(", "),
    scopeType: detail.scope?.type ?? "global",
    scopeId: detail.scope?.id ?? "",
    status: memoryStatus(detail),
    importance: String(detail.importance ?? 0.5),
    validUntil: detail.validUntil ?? "",
  };
}

export function memoryDetailEdit(input: {
  detail: PaseoMemoryDetail;
  draft: MemoryDetailDraft;
  globalUserId: string;
}): NonNullable<PaseoMemoryUpdateInput["detailEdits"]>[number] {
  const scope: PaseoMemoryScope =
    input.draft.scopeType === "global"
      ? { type: "global", id: input.globalUserId }
      : { type: input.draft.scopeType, id: input.draft.scopeId.trim() };
  if (scope.type !== "global" && !scope.id) {
    throw new Error(`${scope.type} scope requires an ID`);
  }
  return {
    id: input.detail.id,
    title: input.draft.title.trim(),
    category: input.draft.category,
    content: input.draft.content.trim(),
    keywords: input.draft.keywords
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    scope,
    status: input.draft.status,
    importance: parseMemoryImportance(input.draft.importance),
    validUntil: parseMemoryValidUntil(input.draft.validUntil),
  };
}
