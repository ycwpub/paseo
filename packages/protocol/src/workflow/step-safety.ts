import { z } from "zod";

export const WorkflowStepSafetySchema = z.object({
  sideEffects: z.array(z.string().trim().min(1).max(256)).max(100).optional(),
  requiresWriteBack: z.boolean().optional(),
  idempotencyKey: z.string().trim().min(1).max(2_000).optional(),
  rollbackHint: z.string().trim().min(1).max(4_000).optional(),
});

export type WorkflowStepSafety = z.infer<typeof WorkflowStepSafetySchema>;
