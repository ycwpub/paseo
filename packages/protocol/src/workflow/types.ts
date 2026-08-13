import { z } from "zod";
import { ScheduleNewAgentTargetConfigSchema } from "../schedule/types.js";
import {
  WorkflowArtifactSchema,
  WorkflowInputMappingSchema,
  WorkflowJsonSchemaSchema,
  type WorkflowArtifact,
  type WorkflowInputMapping,
  type WorkflowJsonSchema,
} from "./data-contract.js";
import { WorkflowEnvironmentSchema } from "./environment.js";
import { WorkflowInputContractSchema, WorkflowInputPresetSchema } from "./input-contract.js";

export const WorkflowPayloadSchema = z
  .object({
    control: z.string().default(""),
    error: z.string().default(""),
  })
  .catchall(z.unknown());
export type WorkflowPayload = z.infer<typeof WorkflowPayloadSchema>;

// Keep the historical name as an alias for callers that still model an executable
// node's payload as its result.
export const WorkflowNodeResultSchema = WorkflowPayloadSchema;
export type WorkflowNodeResult = z.infer<typeof WorkflowNodeResultSchema>;

export const WorkflowAgentConfigSchema = ScheduleNewAgentTargetConfigSchema.omit({
  cwd: true,
}).extend({
  cwd: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
});
export type WorkflowAgentConfig = z.infer<typeof WorkflowAgentConfigSchema>;

export const WorkflowAgentOutputTypeSchema = z.enum(["answer", "control"]);
export type WorkflowAgentOutputType = z.infer<typeof WorkflowAgentOutputTypeSchema>;

export const DEFAULT_CONTROL_AGENT_SYSTEM_PROMPT = "# 角色\n你的回答必须在下面几个选中中：是、否";

export const WorkflowRetryPolicySchema = z.object({
  maxAttempts: z.number().int().min(1).max(20),
  initialDelayMs: z
    .number()
    .int()
    .nonnegative()
    .max(60 * 60 * 1000)
    .optional(),
  maxDelayMs: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60 * 1000)
    .optional(),
  backoffMultiplier: z.number().min(1).max(10).optional(),
  jitter: z.boolean().optional(),
});
export type WorkflowRetryPolicy = z.infer<typeof WorkflowRetryPolicySchema>;

export const WorkflowTaskDefaultsSchema = z.object({
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(7 * 24 * 60 * 60 * 1000)
    .optional(),
  retry: WorkflowRetryPolicySchema.optional(),
});
export type WorkflowTaskDefaults = z.infer<typeof WorkflowTaskDefaultsSchema>;

export const WorkflowPromptVariablesSchema = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/), z.string().max(20_000))
  .refine((variables) => Object.keys(variables).length <= 100, {
    message: "Workflow template variables cannot exceed 100 entries",
  });
export type WorkflowPromptVariables = z.infer<typeof WorkflowPromptVariablesSchema>;

export interface WorkflowBashStep {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "bash";
  initialCommand: string;
  inputs?: WorkflowInputMapping;
  inputSchema?: WorkflowJsonSchema;
  outputSchema?: WorkflowJsonSchema;
  variables?: WorkflowPromptVariables;
  cwd?: string;
  shell?: string;
  timeoutMs?: number;
  retry?: WorkflowRetryPolicy;
}

export interface WorkflowPythonStep {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "python";
  code: string;
  inputs?: WorkflowInputMapping;
  inputSchema?: WorkflowJsonSchema;
  outputSchema?: WorkflowJsonSchema;
  variables?: WorkflowPromptVariables;
  cwd?: string;
  pythonPath?: string;
  timeoutMs?: number;
  retry?: WorkflowRetryPolicy;
}

export interface WorkflowAgentStep {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "agent";
  outputType?: WorkflowAgentOutputType;
  initialPrompt: string;
  inputs?: WorkflowInputMapping;
  inputSchema?: WorkflowJsonSchema;
  outputSchema?: WorkflowJsonSchema;
  promptVariables?: WorkflowPromptVariables;
  timeoutMs?: number;
  retry?: WorkflowRetryPolicy;
  config: WorkflowAgentConfig;
}

export interface WorkflowSwitchCase {
  equals: string;
  steps: WorkflowStep[];
}

export interface WorkflowSwitchStep {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "switch";
  switchOn?: string;
  cases: WorkflowSwitchCase[];
  defaultSteps?: WorkflowStep[];
  caseSensitive?: boolean;
}

export interface WorkflowForStep {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "for";
  items?: string;
  steps: WorkflowStep[];
  separator?: string;
  maxIterations?: number;
  concurrency?: number;
  breakControl?: string;
}

export type WorkflowStep =
  | WorkflowBashStep
  | WorkflowPythonStep
  | WorkflowAgentStep
  | WorkflowSwitchStep
  | WorkflowForStep;

const WorkflowStepIdSchema = z.string().trim().min(1).max(128);
const WorkflowStepNameSchema = z.string().trim().min(1).max(256).optional();

export const WorkflowStepSchema: z.ZodType<WorkflowStep> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      id: WorkflowStepIdSchema,
      name: WorkflowStepNameSchema,
      nextStepId: WorkflowStepIdSchema.nullable().optional(),
      type: z.literal("bash"),
      initialCommand: z.string().trim().min(1),
      inputs: WorkflowInputMappingSchema.optional(),
      inputSchema: WorkflowJsonSchemaSchema.optional(),
      outputSchema: WorkflowJsonSchemaSchema.optional(),
      variables: WorkflowPromptVariablesSchema.optional(),
      cwd: z.string().trim().min(1).optional(),
      shell: z.string().trim().min(1).optional(),
      timeoutMs: WorkflowTaskDefaultsSchema.shape.timeoutMs,
      retry: WorkflowRetryPolicySchema.optional(),
    }),
    z.object({
      id: WorkflowStepIdSchema,
      name: WorkflowStepNameSchema,
      nextStepId: WorkflowStepIdSchema.nullable().optional(),
      type: z.literal("python"),
      code: z.string().refine((value) => value.trim().length > 0, {
        message: "Python code is required",
      }),
      inputs: WorkflowInputMappingSchema.optional(),
      inputSchema: WorkflowJsonSchemaSchema.optional(),
      outputSchema: WorkflowJsonSchemaSchema.optional(),
      variables: WorkflowPromptVariablesSchema.optional(),
      cwd: z.string().trim().min(1).optional(),
      pythonPath: z.string().trim().min(1).optional(),
      timeoutMs: WorkflowTaskDefaultsSchema.shape.timeoutMs,
      retry: WorkflowRetryPolicySchema.optional(),
    }),
    z.object({
      id: WorkflowStepIdSchema,
      name: WorkflowStepNameSchema,
      nextStepId: WorkflowStepIdSchema.nullable().optional(),
      type: z.literal("agent"),
      outputType: WorkflowAgentOutputTypeSchema.default("answer"),
      initialPrompt: z.string().trim().min(1),
      inputs: WorkflowInputMappingSchema.optional(),
      inputSchema: WorkflowJsonSchemaSchema.optional(),
      outputSchema: WorkflowJsonSchemaSchema.optional(),
      promptVariables: WorkflowPromptVariablesSchema.optional(),
      timeoutMs: WorkflowTaskDefaultsSchema.shape.timeoutMs,
      retry: WorkflowRetryPolicySchema.optional(),
      config: WorkflowAgentConfigSchema,
    }),
    z.object({
      id: WorkflowStepIdSchema,
      name: WorkflowStepNameSchema,
      nextStepId: WorkflowStepIdSchema.nullable().optional(),
      type: z.literal("switch"),
      switchOn: z.string().trim().min(1).optional(),
      cases: z
        .array(
          z.object({
            equals: z.string(),
            steps: z.array(WorkflowStepSchema),
          }),
        )
        .min(1),
      defaultSteps: z.array(WorkflowStepSchema).optional(),
      caseSensitive: z.boolean().optional(),
    }),
    z.object({
      id: WorkflowStepIdSchema,
      name: WorkflowStepNameSchema,
      nextStepId: WorkflowStepIdSchema.nullable().optional(),
      type: z.literal("for"),
      items: z.string().trim().min(1).optional(),
      steps: z.array(WorkflowStepSchema).min(1),
      separator: z.string().min(1).optional(),
      maxIterations: z.number().int().positive().max(10_000).default(100),
      concurrency: z.number().int().positive().max(100).default(1),
      breakControl: z.string().optional(),
    }),
  ]),
);

export const WorkflowScriptSchema = z.object({
  apiVersion: z.literal("paseo.sh/workflow/v1").optional(),
  kind: z.literal("Workflow").optional(),
  version: z.union([z.literal(1), z.literal(2)]),
  name: z.string().trim().min(1).max(256),
  description: z.string().max(4_000).nullable().optional(),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .max(30 * 24 * 60 * 60 * 1000)
    .optional(),
  taskDefaults: WorkflowTaskDefaultsSchema.optional(),
  inputContract: WorkflowInputContractSchema.optional(),
  inputPresets: z.array(WorkflowInputPresetSchema).max(100).optional(),
  environment: WorkflowEnvironmentSchema.optional(),
  labels: z
    .record(z.string().trim().min(1).max(128), z.string().max(512))
    .refine((labels) => Object.keys(labels).length <= 100, {
      message: "Workflow labels cannot exceed 100 entries",
    })
    .optional(),
  steps: z.array(WorkflowStepSchema).min(1),
});
export type WorkflowScript = z.infer<typeof WorkflowScriptSchema>;

export const WorkflowScriptFileSchema = z.object({
  path: z.string(),
  script: WorkflowScriptSchema,
});
export type WorkflowScriptFile = z.infer<typeof WorkflowScriptFileSchema>;

export const WorkflowScriptSummarySchema = z.object({
  path: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  stepCount: z.number().int().nonnegative(),
  modifiedAt: z.string(),
});
export type WorkflowScriptSummary = z.infer<typeof WorkflowScriptSummarySchema>;

export const WorkflowNodeRunSchema = z.object({
  id: z.string(),
  stepId: z.string(),
  stepName: z.string().nullable(),
  stepType: z.enum(["bash", "agent", "workflow", "switch", "for"]),
  // COMPAT(workflowPython): added in v0.3.2, remove after 2027-02-12 once
  // clients accept "python" directly in stepType.
  executor: z.literal("python").optional(),
  iterationPath: z.array(z.number().int().nonnegative()),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.enum(["running", "succeeded", "failed", "cancelled", "timed_out"]),
  attempt: z.number().int().positive().default(1),
  maxAttempts: z.number().int().positive().default(1),
  retryDelayMs: z.number().int().nonnegative().nullable().default(null),
  inputPayload: z.string().nullable().default(null),
  outputPayload: z.string().nullable().default(null),
  inputFilePath: z.string(),
  outputFilePath: z.string().nullable(),
  inputControl: z.string(),
  outputControl: z.string().nullable(),
  error: z.string().nullable(),
  errorCode: z.string().nullable().default(null),
  agentId: z.guid().nullable(),
  agentPrompt: z.string().nullable().default(null),
  agentResponse: z.string().nullable().default(null),
  workflowPath: z.string().nullable().default(null),
  workflowRunId: z.string().nullable().default(null),
  output: z.string().nullable(),
  expandedInstruction: z.string().nullable().optional(),
  cwd: z.string().nullable().optional(),
  stdout: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  exitCode: z.number().int().nullable().optional(),
  signal: z.string().nullable().optional(),
  environmentSource: z.enum(["daemon", "login-shell"]).nullable().optional(),
  environmentPath: z.string().nullable().optional(),
  skippedReason: z.string().nullable().optional(),
  artifacts: z.array(WorkflowArtifactSchema).optional(),
});
export type WorkflowNodeRun = z.infer<typeof WorkflowNodeRunSchema>;

export const WorkflowRunSchema = z.object({
  id: z.string(),
  scriptPath: z.string(),
  scriptSnapshot: WorkflowScriptSchema,
  // COMPAT(workflowNodeRun): added in v0.3.2, remove default after 2027-02-12.
  targetNodeId: z.string().nullable().default(null),
  status: z.enum(["running", "succeeded", "failed", "cancelled", "timed_out"]),
  inputPayload: z.string().nullable().default(null),
  outputPayload: z.string().nullable().default(null),
  inputFilePath: z.string(),
  outputFilePath: z.string().nullable(),
  control: z.string(),
  error: z.string().nullable(),
  errorCode: z.string().nullable().default(null),
  artifacts: z.array(WorkflowArtifactSchema).optional(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  nodeRuns: z.array(WorkflowNodeRunSchema),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const StoredWorkflowRunsSchema = z.object({
  runs: z.array(WorkflowRunSchema),
});
export type StoredWorkflowRuns = z.infer<typeof StoredWorkflowRunsSchema>;

export type { WorkflowArtifact };
