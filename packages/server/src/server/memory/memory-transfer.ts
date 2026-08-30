import { z } from "zod";
import {
  PaseoMemoryDetailSchema,
  PaseoMemorySettingsSchema,
  PaseoMemorySyncSnapshotSchema,
  type PaseoMemoryScope,
  type PaseoMemoryScopePolicy,
  type PaseoMemorySyncDetail,
  type PaseoMemorySyncSnapshot,
  type PaseoMemoryTransferSelection,
  type PaseoMemoryUser,
} from "@getpaseo/protocol/messages";
import { memoryScopeKey, normalizeMemoryScopes } from "./memory-model.js";

export const MemoryExportSchema = z.object({
  version: z.literal(2),
  exportedAt: z.string(),
  settings: PaseoMemorySettingsSchema,
  summary: z.string(),
  details: z.array(
    PaseoMemoryDetailSchema.omit({
      path: true,
      charCount: true,
      scopeDocuments: true,
    }),
  ),
});

export type ParsedMemoryExport = z.infer<typeof MemoryExportSchema>;

export type ParsedMemoryTransfer =
  | { type: "export"; value: ParsedMemoryExport }
  | { type: "snapshot"; value: PaseoMemorySyncSnapshot };

export function parseMemoryTransferJson(value: string): ParsedMemoryTransfer {
  const parsed: unknown = JSON.parse(value);
  const snapshot = PaseoMemorySyncSnapshotSchema.safeParse(parsed);
  if (snapshot.success) return { type: "snapshot", value: snapshot.data };
  return { type: "export", value: MemoryExportSchema.parse(parsed) };
}

export function projectMemorySyncSnapshotForTransfer(input: {
  snapshot: PaseoMemorySyncSnapshot;
  selection: Exclude<PaseoMemoryTransferSelection, { type: "all" }>;
  targetScope: PaseoMemoryScope;
  targetUser: PaseoMemoryUser;
}): PaseoMemorySyncSnapshot {
  const { snapshot, selection, targetScope, targetUser } = input;
  const sourceSelection = snapshot.selection;
  const details: PaseoMemorySyncDetail[] = [];
  for (const detail of snapshot.details) {
    const selected =
      sourceSelection?.type === selection.type ||
      normalizeMemoryScopes(detail).some((scope) =>
        selection.type === "global"
          ? scope.type === "global"
          : memoryScopeKey(scope) === memoryScopeKey(targetScope),
      );
    if (selected) details.push({ ...detail, scope: targetScope, scopes: [targetScope] });
  }
  const scopePolicies: PaseoMemoryScopePolicy[] = [];
  for (const policy of snapshot.scopePolicies) {
    const selected =
      sourceSelection?.type === selection.type ||
      (selection.type === "global"
        ? policy.scope.type === "global"
        : memoryScopeKey(policy.scope) === memoryScopeKey(targetScope));
    if (selected) scopePolicies.push({ ...policy, scope: targetScope });
  }
  const incomingSummary = snapshot.summaries[0]?.content;

  return PaseoMemorySyncSnapshotSchema.parse({
    ...snapshot,
    selection:
      targetScope.type === "global"
        ? { type: "global", id: targetScope.id }
        : { type: "assistant", id: targetScope.id },
    users: selection.type === "global" ? [targetUser] : [],
    summaries:
      selection.type === "global" && incomingSummary !== undefined
        ? [{ userId: targetUser.id, content: incomingSummary }]
        : [],
    details,
    policies: [],
    scopePolicies,
  });
}
