import { z } from "zod";
import { ScheduleNewAgentTargetConfigSchema } from "../schedule/types.js";
import {
  WorkflowArtifactSchema,
  WorkflowInputMappingSchema,
  WorkflowJsonSchemaSchema,
  WorkflowLoopVariableDefinitionsSchema,
  WorkflowVariableDefinitionsSchema,
  type WorkflowArtifact,
  type WorkflowInputMapping,
  type WorkflowJsonSchema,
  type WorkflowLoopVariableDefinitions,
  type WorkflowVariableDefinitions,
} from "./data-contract.js";
import {
  WorkflowEnvironmentSchema,
  WorkflowEnvironmentVariablesSchema,
  type WorkflowEnvironmentVariables,
} from "./environment.js";
import { WorkflowInputPresetSchema } from "./input-contract.js";
import {
  WORKFLOW_PROTOCOL_API_VERSION,
  WORKFLOW_PROTOCOL_KIND,
  WORKFLOW_PROTOCOL_VERSION,
} from "./protocol-version.js";
import { WorkflowStepSafetySchema, type WorkflowStepSafety } from "./step-safety.js";

export const WorkflowPayloadSchema = z.record(z.string(), z.unknown());
export type WorkflowPayload = z.infer<typeof WorkflowPayloadSchema>;

export const WorkflowNodeResultSchema = WorkflowPayloadSchema;
export type WorkflowNodeResult = z.infer<typeof WorkflowNodeResultSchema>;

export const WorkflowAgentConfigSchema = ScheduleNewAgentTargetConfigSchema.omit({
  cwd: true,
}).extend({
  cwd: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
});
export type WorkflowAgentConfig = z.infer<typeof WorkflowAgentConfigSchema>;

export const WorkflowAgentOutputModeSchema = z.enum(["normal", "custom"]);
export type WorkflowAgentOutputMode = z.infer<typeof WorkflowAgentOutputModeSchema>;

export const WorkflowAgentLifecycleSchema = z.enum(["workflow", "for", "single"]);
export type WorkflowAgentLifecycle = z.infer<typeof WorkflowAgentLifecycleSchema>;

export const WorkflowTargetInputModeSchema = z.enum(["upstream_output", "node_input"]);
export type WorkflowTargetInputMode = z.infer<typeof WorkflowTargetInputModeSchema>;

export const WorkflowAgentSubsequentPromptModeSchema = z.enum(["reuse_initial", "custom"]);
export type WorkflowAgentSubsequentPromptMode = z.infer<
  typeof WorkflowAgentSubsequentPromptModeSchema
>;

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

export const WorkflowTemplateVariablesSchema = z
  .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_.-]*$/), z.string().max(20_000))
  .refine((variables) => Object.keys(variables).length <= 100, {
    message: "Workflow template variables cannot exceed 100 entries",
  });
export type WorkflowTemplateVariables = z.infer<typeof WorkflowTemplateVariablesSchema>;

export interface WorkflowBashStep extends WorkflowStepSafety {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "bash";
  initialCommand: string;
  inputs?: WorkflowInputMapping;
  inputSchema?: WorkflowJsonSchema;
  outputSchema?: WorkflowJsonSchema;
  variables?: WorkflowVariableDefinitions;
  templateVariables?: WorkflowTemplateVariables;
  inputVariable?: string;
  outputVariable?: string;
  cwd?: string;
  shell?: string;
  env?: WorkflowEnvironmentVariables;
  timeoutMs?: number;
  retry?: WorkflowRetryPolicy;
}

export interface WorkflowPythonStep extends WorkflowStepSafety {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "python";
  code?: string;
  module?: string;
  function?: string;
  inputs?: WorkflowInputMapping;
  inputSchema?: WorkflowJsonSchema;
  outputSchema?: WorkflowJsonSchema;
  variables?: WorkflowVariableDefinitions;
  templateVariables?: WorkflowTemplateVariables;
  inputVariable?: string;
  outputVariable?: string;
  cwd?: string;
  pythonPath?: string;
  env?: WorkflowEnvironmentVariables;
  timeoutMs?: number;
  retry?: WorkflowRetryPolicy;
}

export interface WorkflowAgentStep extends WorkflowStepSafety {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "agent";
  lifecycle?: WorkflowAgentLifecycle;
  subsequentPromptMode?: WorkflowAgentSubsequentPromptMode;
  subsequentPrompt?: string;
  outputMode?: WorkflowAgentOutputMode;
  initialPrompt: string;
  inputs?: WorkflowInputMapping;
  inputSchema?: WorkflowJsonSchema;
  outputSchema?: WorkflowJsonSchema;
  variables?: WorkflowVariableDefinitions;
  timeoutMs?: number;
  retry?: WorkflowRetryPolicy;
  config: WorkflowAgentConfig;
}

export interface WorkflowSwitchCase {
  equals: string | number | boolean;
  steps: WorkflowStep[];
}

export interface WorkflowSwitchStep extends WorkflowStepSafety {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "switch";
  switchVar?: string;
  variables?: WorkflowVariableDefinitions;
  inputSchema?: WorkflowJsonSchema;
  cases: WorkflowSwitchCase[];
  defaultSteps?: WorkflowStep[];
  caseSensitive?: boolean;
}

export interface WorkflowForStep extends WorkflowStepSafety {
  id: string;
  name?: string;
  nextStepId?: string | null;
  type: "for";
  mode?: "array" | "number" | "true";
  executionMode?: "serial" | "parallel";
  items?: string;
  forControl?: string;
  breakWhen?: string;
  continueWhen?: string;
  loopVariables?: WorkflowLoopVariableDefinitions;
  variables?: WorkflowVariableDefinitions;
  inputSchema?: WorkflowJsonSchema;
  steps: WorkflowStep[];
  maxIterations?: number;
  concurrency?: number;
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
    z
      .object({
        id: WorkflowStepIdSchema,
        name: WorkflowStepNameSchema,
        nextStepId: WorkflowStepIdSchema.nullable().optional(),
        type: z.literal("bash"),
        initialCommand: z.string().trim().min(1),
        inputs: WorkflowInputMappingSchema.optional(),
        inputSchema: WorkflowJsonSchemaSchema.optional(),
        outputSchema: WorkflowJsonSchemaSchema.optional(),
        variables: WorkflowVariableDefinitionsSchema.optional(),
        templateVariables: WorkflowTemplateVariablesSchema.optional(),
        inputVariable: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default("input"),
        outputVariable: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default("output"),
        cwd: z.string().trim().min(1).optional(),
        shell: z.string().trim().min(1).optional(),
        env: WorkflowEnvironmentVariablesSchema.optional(),
        timeoutMs: WorkflowTaskDefaultsSchema.shape.timeoutMs,
        retry: WorkflowRetryPolicySchema.optional(),
        ...WorkflowStepSafetySchema.shape,
      })
      .strict(),
    z
      .object({
        id: WorkflowStepIdSchema,
        name: WorkflowStepNameSchema,
        nextStepId: WorkflowStepIdSchema.nullable().optional(),
        type: z.literal("python"),
        code: z
          .string()
          .refine((value) => value.trim().length > 0, {
            message: "Python code is required",
          })
          .optional(),
        module: z
          .string()
          .trim()
          .regex(/^[A-Za-z_][A-Za-z0-9_.]*$/)
          .optional(),
        function: z
          .string()
          .trim()
          .regex(/^[A-Za-z_][A-Za-z0-9_.]*$/)
          .optional(),
        inputs: WorkflowInputMappingSchema.optional(),
        inputSchema: WorkflowJsonSchemaSchema.optional(),
        outputSchema: WorkflowJsonSchemaSchema.optional(),
        variables: WorkflowVariableDefinitionsSchema.optional(),
        templateVariables: WorkflowTemplateVariablesSchema.optional(),
        inputVariable: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default("input"),
        outputVariable: z
          .string()
          .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
          .default("output"),
        cwd: z.string().trim().min(1).optional(),
        pythonPath: z.string().trim().min(1).optional(),
        env: WorkflowEnvironmentVariablesSchema.optional(),
        timeoutMs: WorkflowTaskDefaultsSchema.shape.timeoutMs,
        retry: WorkflowRetryPolicySchema.optional(),
        ...WorkflowStepSafetySchema.shape,
      })
      .strict()
      .superRefine((step, context) => {
        const hasCode = Boolean(step.code);
        const hasEntrypoint = Boolean(step.module && step.function);
        if (hasCode === hasEntrypoint) {
          context.addIssue({
            code: "custom",
            path: ["code"],
            message: "Python node must define either code or module and function",
          });
        }
        if ((step.module && !step.function) || (!step.module && step.function)) {
          context.addIssue({
            code: "custom",
            path: [step.module ? "function" : "module"],
            message: "Python module and function must be configured together",
          });
        }
      }),
    z
      .object({
        id: WorkflowStepIdSchema,
        name: WorkflowStepNameSchema,
        nextStepId: WorkflowStepIdSchema.nullable().optional(),
        type: z.literal("agent"),
        lifecycle: WorkflowAgentLifecycleSchema.default("single"),
        subsequentPromptMode: WorkflowAgentSubsequentPromptModeSchema.default("reuse_initial"),
        subsequentPrompt: z.string().trim().min(1).optional(),
        outputMode: WorkflowAgentOutputModeSchema.default("normal"),
        initialPrompt: z.string().trim().min(1),
        inputs: WorkflowInputMappingSchema.optional(),
        inputSchema: WorkflowJsonSchemaSchema.optional(),
        outputSchema: WorkflowJsonSchemaSchema.optional(),
        variables: WorkflowVariableDefinitionsSchema.optional(),
        timeoutMs: WorkflowTaskDefaultsSchema.shape.timeoutMs,
        retry: WorkflowRetryPolicySchema.optional(),
        config: WorkflowAgentConfigSchema,
        ...WorkflowStepSafetySchema.shape,
      })
      .strict()
      .superRefine((step, context) => {
        if (
          step.lifecycle !== "single" &&
          step.subsequentPromptMode === "custom" &&
          !step.subsequentPrompt
        ) {
          context.addIssue({
            code: "custom",
            path: ["subsequentPrompt"],
            message: "Custom subsequent prompt is required when Agent reuse is enabled",
          });
        }
      }),
    z
      .object({
        id: WorkflowStepIdSchema,
        name: WorkflowStepNameSchema,
        nextStepId: WorkflowStepIdSchema.nullable().optional(),
        type: z.literal("switch"),
        switchVar: z.string().trim().min(1).default("{{data.control}}"),
        variables: WorkflowVariableDefinitionsSchema.optional(),
        inputSchema: WorkflowJsonSchemaSchema.optional(),
        cases: z
          .array(
            z
              .object({
                equals: z.union([z.string(), z.number(), z.boolean()]),
                steps: z.array(WorkflowStepSchema),
              })
              .strict(),
          )
          .min(1),
        defaultSteps: z.array(WorkflowStepSchema).optional(),
        caseSensitive: z.boolean().optional(),
        ...WorkflowStepSafetySchema.shape,
      })
      .strict(),
    z
      .object({
        id: WorkflowStepIdSchema,
        name: WorkflowStepNameSchema,
        nextStepId: WorkflowStepIdSchema.nullable().optional(),
        type: z.literal("for"),
        mode: z.enum(["array", "number", "true"]).default("array"),
        executionMode: z.enum(["serial", "parallel"]).default("serial"),
        items: z.string().trim().min(1).optional(),
        forControl: z.string().trim().min(1).optional(),
        breakWhen: z.string().trim().min(1).optional(),
        continueWhen: z.string().trim().min(1).optional(),
        loopVariables: WorkflowLoopVariableDefinitionsSchema.optional(),
        variables: WorkflowVariableDefinitionsSchema.optional(),
        inputSchema: WorkflowJsonSchemaSchema.optional(),
        steps: z.array(WorkflowStepSchema).min(1),
        maxIterations: z.number().int().nonnegative().max(10_000).default(100),
        concurrency: z.number().int().positive().max(100).default(1),
        ...WorkflowStepSafetySchema.shape,
      })
      .strict(),
  ]),
);

export const WorkflowScriptSchema = z
  .object({
    apiVersion: z.literal(WORKFLOW_PROTOCOL_API_VERSION),
    kind: z.literal(WORKFLOW_PROTOCOL_KIND),
    version: z.literal(WORKFLOW_PROTOCOL_VERSION),
    name: z.string().trim().min(1).max(256),
    description: z.string().max(4_000).nullable().optional(),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(30 * 24 * 60 * 60 * 1000)
      .optional(),
    taskDefaults: WorkflowTaskDefaultsSchema.optional(),
    variables: WorkflowVariableDefinitionsSchema.optional(),
    outputSchema: WorkflowJsonSchemaSchema.optional(),
    inputPresets: z.array(WorkflowInputPresetSchema).max(100).optional(),
    environment: WorkflowEnvironmentSchema.optional(),
    labels: z
      .record(z.string().trim().min(1).max(128), z.string().max(512))
      .refine((labels) => Object.keys(labels).length <= 100, {
        message: "Workflow labels cannot exceed 100 entries",
      })
      .optional(),
    steps: z.array(WorkflowStepSchema).min(1),
  })
  .strict();
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
  targetInputMode: WorkflowTargetInputModeSchema.default("upstream_output"),
  // COMPAT(workflowRuntimeDirectories): added in v0.3.2, remove optional after 2027-02-17.
  runDir: z.string().nullable().optional(),
  artifactDir: z.string().nullable().optional(),
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
