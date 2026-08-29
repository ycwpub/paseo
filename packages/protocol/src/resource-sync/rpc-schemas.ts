import { z } from "zod";

export const LocalResourceMissingPolicySchema = z.enum(["skip", "create"]);
export const LocalResourceExistingPolicySchema = z.enum(["skip", "overwrite", "merge"]);

export const LocalResourceSnapshotEntrySchema = z.object({
  path: z.string(),
  kind: z.enum(["file", "directory"]),
  size: z.number().int().nonnegative(),
  modifiedAt: z.string(),
  hash: z.string().optional(),
  contentBase64: z.string().optional(),
});

export const LocalResourceSnapshotSchema = z.object({
  version: z.literal(1),
  rootKind: z.enum(["file", "directory"]),
  entries: z.array(LocalResourceSnapshotEntrySchema),
  totalFiles: z.number().int().nonnegative(),
  totalDirectories: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  skippedPaths: z.array(z.string()),
});

export const LocalResourceExportRequestSchema = z.object({
  type: z.literal("resource_sync.local.export.request"),
  requestId: z.string(),
  path: z.string().min(1),
});

export const LocalResourceExportResponseSchema = z.object({
  type: z.literal("resource_sync.local.export.response"),
  payload: z.object({
    requestId: z.string(),
    snapshot: LocalResourceSnapshotSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LocalResourceApplyRequestSchema = z.object({
  type: z.literal("resource_sync.local.apply.request"),
  requestId: z.string(),
  path: z.string().min(1),
  snapshot: LocalResourceSnapshotSchema,
  missingPolicy: LocalResourceMissingPolicySchema,
  existingPolicy: LocalResourceExistingPolicySchema,
  sourceLabel: z.string().optional(),
});

export const LocalResourceApplyResultSchema = z.object({
  status: z.enum(["applied", "skipped_missing", "skipped_existing"]),
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  bytesWritten: z.number().int().nonnegative(),
  conflictPaths: z.array(z.string()),
});

export const LocalResourceApplyResponseSchema = z.object({
  type: z.literal("resource_sync.local.apply.response"),
  payload: z.object({
    requestId: z.string(),
    result: LocalResourceApplyResultSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export type LocalResourceMissingPolicy = z.infer<typeof LocalResourceMissingPolicySchema>;
export type LocalResourceExistingPolicy = z.infer<typeof LocalResourceExistingPolicySchema>;
export type LocalResourceSnapshotEntry = z.infer<typeof LocalResourceSnapshotEntrySchema>;
export type LocalResourceSnapshot = z.infer<typeof LocalResourceSnapshotSchema>;
export type LocalResourceApplyResult = z.infer<typeof LocalResourceApplyResultSchema>;
export type LocalResourceExportRequest = z.infer<typeof LocalResourceExportRequestSchema>;
export type LocalResourceApplyRequest = z.infer<typeof LocalResourceApplyRequestSchema>;
