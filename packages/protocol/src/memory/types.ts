import { z } from "zod";

export const PaseoMemorySettingsSchema = z.object({
  enabled: z.boolean(),
  autoExtract: z.boolean(),
  maxInjectedChars: z.number().int().min(1_000).max(32_000),
  maxRetrievedDetails: z.number().int().min(0).max(12),
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
});
export type PaseoMemoryDetail = z.infer<typeof PaseoMemoryDetailSchema>;

export const PaseoMemoryStatsSchema = z.object({
  detailCount: z.number().int().nonnegative(),
  pendingExtractions: z.number().int().nonnegative(),
  lastExtractedAt: z.string().nullable(),
  lastExtractionError: z.string().nullable(),
});
export type PaseoMemoryStats = z.infer<typeof PaseoMemoryStatsSchema>;

export const PaseoMemoryStateSchema = z.object({
  settings: PaseoMemorySettingsSchema,
  summary: z.string(),
  summaryPath: z.string(),
  details: z.array(PaseoMemoryDetailSchema),
  stats: PaseoMemoryStatsSchema,
});
export type PaseoMemoryState = z.infer<typeof PaseoMemoryStateSchema>;

export const PaseoMemoryUpdateInputSchema = z.object({
  settings: PaseoMemorySettingsSchema.optional(),
  summary: z.string().optional(),
  detailEdits: z
    .array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).optional(),
        category: PaseoMemoryDetailSchema.shape.category.optional(),
        keywords: z.array(z.string()).optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
  deleteDetailIds: z.array(z.string().min(1)).optional(),
});
export type PaseoMemoryUpdateInput = z.infer<typeof PaseoMemoryUpdateInputSchema>;
