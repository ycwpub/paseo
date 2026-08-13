import { z } from "zod";

const WORKFLOW_INT64_MIN = -(1n << 63n);
const WORKFLOW_INT64_MAX = (1n << 63n) - 1n;
const WORKFLOW_VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

export const WorkflowDataSchema = z.record(z.string(), z.unknown());
export type WorkflowData = z.infer<typeof WorkflowDataSchema>;

export const WorkflowJsonSchemaSchema = z.record(z.string(), z.unknown());
export type WorkflowJsonSchema = z.infer<typeof WorkflowJsonSchemaSchema>;

export const WorkflowInputMappingSchema = z.record(z.string(), z.unknown());
export type WorkflowInputMapping = z.infer<typeof WorkflowInputMappingSchema>;

export const WorkflowVariableTypeSchema = z.enum(["string", "int64"]);
export type WorkflowVariableType = z.infer<typeof WorkflowVariableTypeSchema>;

export const WorkflowVariableDefinitionSchema = z
  .object({
    type: WorkflowVariableTypeSchema,
    default: z.string().max(20_000).optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    if (
      definition.type === "int64" &&
      definition.default !== undefined &&
      !isWorkflowInt64(definition.default)
    ) {
      context.addIssue({
        code: "custom",
        path: ["default"],
        message: "int64 defaults must be decimal strings in the signed 64-bit range",
      });
    }
  });
export type WorkflowVariableDefinition = z.infer<typeof WorkflowVariableDefinitionSchema>;

export const WorkflowVariableDefinitionsSchema = z
  .record(
    z.string().regex(WORKFLOW_VARIABLE_NAME_PATTERN).max(128),
    WorkflowVariableDefinitionSchema,
  )
  .refine((definitions) => Object.keys(definitions).length <= 1_000, {
    message: "Workflow variable definitions cannot exceed 1000 entries",
  });
export type WorkflowVariableDefinitions = z.infer<typeof WorkflowVariableDefinitionsSchema>;

export const WorkflowVariableValuesSchema = z.record(z.string(), z.string());
export type WorkflowVariableValues = z.infer<typeof WorkflowVariableValuesSchema>;

export const WorkflowNodeInputEnvelopeSchema = z
  .object({
    data: WorkflowDataSchema,
    workflow: z.object({
      var: WorkflowVariableValuesSchema,
    }),
    node: z.object({
      var: WorkflowVariableValuesSchema,
    }),
  })
  .strict();
export type WorkflowNodeInputEnvelope = z.infer<typeof WorkflowNodeInputEnvelopeSchema>;

export const WorkflowVariableModificationSchema = z
  .object({
    workflow: z
      .object({
        var: WorkflowVariableValuesSchema.default({}),
      })
      .strict()
      .default({ var: {} }),
    node: z
      .object({
        var: WorkflowVariableValuesSchema.default({}),
      })
      .strict()
      .default({ var: {} }),
  })
  .strict()
  .default({
    workflow: { var: {} },
    node: { var: {} },
  });
export type WorkflowVariableModification = z.infer<typeof WorkflowVariableModificationSchema>;

export const WorkflowBaseResponseSchema = z
  .object({
    status_code: z.number().int().default(0),
    status_msg: z.string().max(20_000).default(""),
    forbid_retry: z.number().int().default(0),
  })
  .strict()
  .default({
    status_code: 0,
    status_msg: "",
    forbid_retry: 0,
  });
export type WorkflowBaseResponse = z.infer<typeof WorkflowBaseResponseSchema>;

export const WorkflowArtifactSchema = z
  .object({
    name: z.string().trim().min(1).max(256),
    uri: z.string().trim().min(1).max(8_192),
    mediaType: z.string().trim().min(1).max(256).optional(),
    size: z.number().int().nonnegative().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
export type WorkflowArtifact = z.infer<typeof WorkflowArtifactSchema>;

export const WorkflowNodeResultEnvelopeSchema = z
  .object({
    data: WorkflowDataSchema.default({}),
    modify: WorkflowVariableModificationSchema,
    base_resp: WorkflowBaseResponseSchema,
    artifacts: z.array(WorkflowArtifactSchema).max(1_000).default([]),
  })
  .strict();
export type WorkflowNodeResultEnvelope = z.infer<typeof WorkflowNodeResultEnvelopeSchema>;

export function isWorkflowInt64(value: string): boolean {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) {
    return false;
  }
  try {
    const parsed = BigInt(value);
    return parsed >= WORKFLOW_INT64_MIN && parsed <= WORKFLOW_INT64_MAX;
  } catch {
    return false;
  }
}
