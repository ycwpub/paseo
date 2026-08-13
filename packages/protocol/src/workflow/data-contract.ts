import { z } from "zod";

export const WorkflowDataSchema = z.record(z.string(), z.unknown());
export type WorkflowData = z.infer<typeof WorkflowDataSchema>;

export const WorkflowJsonSchemaSchema = z.record(z.string(), z.unknown());
export type WorkflowJsonSchema = z.infer<typeof WorkflowJsonSchemaSchema>;

export const WorkflowInputMappingSchema = z.record(z.string(), z.unknown());
export type WorkflowInputMapping = z.infer<typeof WorkflowInputMappingSchema>;

export const WorkflowFlowActionSchema = z.enum(["next", "continue", "break", "branch"]);
export type WorkflowFlowAction = z.infer<typeof WorkflowFlowActionSchema>;

export const WorkflowFlowControlSchema = z.object({
  action: WorkflowFlowActionSchema.default("next"),
  value: z.unknown().optional(),
});
export type WorkflowFlowControl = z.infer<typeof WorkflowFlowControlSchema>;

export const WorkflowArtifactSchema = z.object({
  name: z.string().trim().min(1).max(256),
  uri: z.string().trim().min(1).max(8_192),
  mediaType: z.string().trim().min(1).max(256).optional(),
  size: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type WorkflowArtifact = z.infer<typeof WorkflowArtifactSchema>;

export const WorkflowNodeResultEnvelopeSchema = z
  .object({
    outputs: WorkflowDataSchema.default({}),
    artifacts: z.array(WorkflowArtifactSchema).max(1_000).default([]),
    flow: WorkflowFlowControlSchema.default({ action: "next" }),
  })
  .strict();
export type WorkflowNodeResultEnvelope = z.infer<typeof WorkflowNodeResultEnvelopeSchema>;

export const DEFAULT_WORKFLOW_FLOW: WorkflowFlowControl = {
  action: "next",
};
