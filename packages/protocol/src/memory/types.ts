import { z } from "zod";

export const PaseoMemoryScopeSchema = z.object({
  type: z.enum(["global", "project", "assistant", "workspace"]),
  id: z.string().min(1).optional(),
});
export type PaseoMemoryScope = z.infer<typeof PaseoMemoryScopeSchema>;

export const PaseoMemoryUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PaseoMemoryUser = z.infer<typeof PaseoMemoryUserSchema>;

export const PaseoMemoryUserOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create"),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal("rename"),
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  z.object({
    type: z.literal("select"),
    id: z.string().min(1),
  }),
  z.object({
    type: z.literal("delete"),
    id: z.string().min(1),
  }),
]);
export type PaseoMemoryUserOperation = z.infer<typeof PaseoMemoryUserOperationSchema>;

export const PaseoMemoryPolicyTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("project"),
    id: z.string().min(1),
  }),
  z.object({
    type: z.literal("conversation"),
    id: z.string().min(1),
  }),
]);
export type PaseoMemoryPolicyTarget = z.infer<typeof PaseoMemoryPolicyTargetSchema>;

export const PaseoMemoryPolicySchema = z.object({
  target: PaseoMemoryPolicyTargetSchema,
  enabled: z.boolean(),
  extractionInstructions: z.string(),
});
export type PaseoMemoryPolicy = z.infer<typeof PaseoMemoryPolicySchema>;

export const PaseoMemoryScopePolicySchema = z.object({
  scope: PaseoMemoryScopeSchema,
  enabled: z.boolean(),
  extractionInstructions: z.string(),
});
export type PaseoMemoryScopePolicy = z.infer<typeof PaseoMemoryScopePolicySchema>;

export const PaseoMemorySourceRefSchema = z.object({
  agentId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  timestamp: z.string(),
});
export type PaseoMemorySourceRef = z.infer<typeof PaseoMemorySourceRefSchema>;

export const PaseoMemorySyncOriginSchema = z.object({
  hostId: z.string().min(1),
  memoryId: z.string().min(1),
});
export type PaseoMemorySyncOrigin = z.infer<typeof PaseoMemorySyncOriginSchema>;

export const PaseoMemorySettingsSchema = z.object({
  enabled: z.boolean(),
  autoExtract: z.boolean(),
  maxInjectedChars: z.number().int().min(1_000).max(32_000),
  maxRetrievedDetails: z.number().int().min(0).max(12),
  // COMPAT(memoryV2Settings): added in v0.3.2, remove optional after 2027-02-18.
  autoConsolidate: z.boolean().optional(),
  // COMPAT(memoryV2Settings): added in v0.3.2, remove optional after 2027-02-18.
  showSources: z.boolean().optional(),
  // COMPAT(memoryV2Settings): added in v0.3.2, remove optional after 2027-02-18.
  retentionDays: z.number().int().min(0).max(3_650).optional(),
  // COMPAT(memoryV2Settings): added in v0.3.2, remove optional after 2027-02-18.
  encryptAtRest: z.boolean().optional(),
  // COMPAT(memoryV2Settings): added in v0.3.2, remove optional after 2027-02-18.
  sensitiveMemoryPolicy: z.enum(["exclude", "manual-only"]).optional(),
  // COMPAT(memoryV2Settings): added in v0.3.2, remove optional after 2027-02-18.
  maxCandidates: z.number().int().min(4).max(100).optional(),
});
export type PaseoMemorySettings = z.infer<typeof PaseoMemorySettingsSchema>;

export const PaseoMemoryDetailSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(["preference", "fact", "procedure", "decision", "project", "other"]),
  keywords: z.array(z.string()),
  path: z.string().min(1),
  charCount: z.number().int().nonnegative(),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  sourceAgentIds: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastAccessedAt: z.string().nullable(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  scope: PaseoMemoryScopeSchema.optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  origin: z.enum(["automatic", "explicit"]).optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  status: z.enum(["active", "superseded", "expired", "disputed"]).optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  importance: z.number().min(0).max(1).optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  sourceRefs: z.array(PaseoMemorySourceRefSchema).optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  validFrom: z.string().nullable().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  validUntil: z.string().nullable().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  supersedes: z.array(z.string()).optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  useCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  helpfulCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  unhelpfulCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  lastUsedAt: z.string().nullable().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  sensitive: z.boolean().optional(),
  // COMPAT(memoryV2Detail): added in v0.3.2, remove optional after 2027-02-18.
  encrypted: z.boolean().optional(),
  // COMPAT(memorySync): added in v0.3.2, remove optional after 2027-02-20.
  syncOrigin: PaseoMemorySyncOriginSchema.optional(),
});
export type PaseoMemoryDetail = z.infer<typeof PaseoMemoryDetailSchema>;

export const PaseoMemorySyncDetailSchema = PaseoMemoryDetailSchema.omit({
  path: true,
  charCount: true,
}).extend({
  syncOrigin: PaseoMemorySyncOriginSchema,
});
export type PaseoMemorySyncDetail = z.infer<typeof PaseoMemorySyncDetailSchema>;

export const PaseoMemorySyncSnapshotSchema = z.object({
  version: z.literal(1),
  sourceHostId: z.string().min(1),
  exportedAt: z.string(),
  users: z.array(PaseoMemoryUserSchema).min(1),
  summaries: z.array(
    z.object({
      userId: z.string().min(1),
      content: z.string(),
    }),
  ),
  details: z.array(PaseoMemorySyncDetailSchema),
  policies: z.array(PaseoMemoryPolicySchema),
  scopePolicies: z.array(PaseoMemoryScopePolicySchema),
});
export type PaseoMemorySyncSnapshot = z.infer<typeof PaseoMemorySyncSnapshotSchema>;

export const PaseoMemoryUsageSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  turnId: z.string().min(1).optional(),
  assistantMessageId: z.string().min(1).optional(),
  memoryIds: z.array(z.string().min(1)),
  createdAt: z.string(),
});
export type PaseoMemoryUsage = z.infer<typeof PaseoMemoryUsageSchema>;

export const PaseoMemoryStatsSchema = z.object({
  detailCount: z.number().int().nonnegative(),
  pendingExtractions: z.number().int().nonnegative(),
  lastExtractedAt: z.string().nullable(),
  lastExtractionError: z.string().nullable(),
  // COMPAT(memoryV2Stats): added in v0.3.2, remove optional after 2027-02-18.
  activeCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Stats): added in v0.3.2, remove optional after 2027-02-18.
  supersededCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Stats): added in v0.3.2, remove optional after 2027-02-18.
  expiredCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Stats): added in v0.3.2, remove optional after 2027-02-18.
  disputedCount: z.number().int().nonnegative().optional(),
  // COMPAT(memoryV2Stats): added in v0.3.2, remove optional after 2027-02-18.
  lastConsolidatedAt: z.string().nullable().optional(),
});
export type PaseoMemoryStats = z.infer<typeof PaseoMemoryStatsSchema>;

export const PaseoMemoryStateSchema = z.object({
  settings: PaseoMemorySettingsSchema,
  // COMPAT(memoryUsers): added in v0.3.2, remove optional after 2027-02-19.
  users: z.array(PaseoMemoryUserSchema).optional(),
  // COMPAT(memoryUsers): added in v0.3.2, remove optional after 2027-02-19.
  activeUserId: z.string().min(1).optional(),
  summary: z.string(),
  summaryPath: z.string(),
  details: z.array(PaseoMemoryDetailSchema),
  stats: PaseoMemoryStatsSchema,
  // COMPAT(memoryV2Usage): added in v0.3.2, remove optional after 2027-02-18.
  recentUsages: z.array(PaseoMemoryUsageSchema).optional(),
  // COMPAT(memoryV2Export): added in v0.3.2, remove optional after 2027-02-18.
  exportJson: z.string().optional(),
  // COMPAT(memoryPolicies): added in v0.3.2, remove optional after 2027-02-18.
  policies: z.array(PaseoMemoryPolicySchema).optional(),
  // COMPAT(memoryScopePolicies): added in v0.3.2, remove optional after 2027-02-18.
  scopePolicies: z.array(PaseoMemoryScopePolicySchema).optional(),
});
export type PaseoMemoryState = z.infer<typeof PaseoMemoryStateSchema>;

export const PaseoMemoryCreateInputSchema = z.object({
  title: z.string().min(1),
  category: PaseoMemoryDetailSchema.shape.category,
  content: z.string().min(1),
  keywords: z.array(z.string()).optional(),
  scope: PaseoMemoryScopeSchema.optional(),
  importance: z.number().min(0).max(1).optional(),
  validUntil: z.string().nullable().optional(),
  sensitive: z.boolean().optional(),
});
export type PaseoMemoryCreateInput = z.infer<typeof PaseoMemoryCreateInputSchema>;

export const PaseoMemoryUpdateInputSchema = z.object({
  settings: PaseoMemorySettingsSchema.optional(),
  // COMPAT(memoryUsers): added in v0.3.2, remove optional after 2027-02-19.
  userOperation: PaseoMemoryUserOperationSchema.optional(),
  summary: z.string().optional(),
  detailEdits: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        category: PaseoMemoryDetailSchema.shape.category.optional(),
        keywords: z.array(z.string()).optional(),
        content: z.string().optional(),
        scope: PaseoMemoryScopeSchema.optional(),
        status: PaseoMemoryDetailSchema.shape.status,
        importance: z.number().min(0).max(1).optional(),
        validUntil: z.string().nullable().optional(),
      }),
    )
    .optional(),
  deleteDetailIds: z.array(z.string().min(1)).optional(),
  createDetails: z.array(PaseoMemoryCreateInputSchema).optional(),
  feedback: z
    .array(
      z.object({
        id: z.string().min(1),
        value: z.enum(["helpful", "unhelpful", "outdated", "incorrect"]),
      }),
    )
    .optional(),
  consolidate: z.boolean().optional(),
  importJson: z.string().optional(),
  replaceOnImport: z.boolean().optional(),
  // COMPAT(memoryPolicies): added in v0.3.2, remove optional after 2027-02-18.
  policyUpdates: z.array(PaseoMemoryPolicySchema).optional(),
  // COMPAT(memoryScopePolicies): added in v0.3.2, remove optional after 2027-02-18.
  scopePolicyUpdates: z.array(PaseoMemoryScopePolicySchema).optional(),
});
export type PaseoMemoryUpdateInput = z.infer<typeof PaseoMemoryUpdateInputSchema>;
