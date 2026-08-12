import { z } from "zod";
import {
  WorkflowRunSchema,
  WorkflowScriptFileSchema,
  WorkflowScriptSchema,
  WorkflowScriptSummarySchema,
  type WorkflowScript,
} from "./types.js";

// zod-aot currently resolves a nested recursive lazy schema back to the top-level
// WSOutboundMessageSchema. Keep full recursive validation at script ingestion, while
// using a shallow script shape for trusted daemon responses sent over WebSocket.
const WorkflowScriptWireSchema = WorkflowScriptSchema.extend({
  steps: z.array(z.unknown()),
}) as unknown as z.ZodType<WorkflowScript>;
const WorkflowScriptFileWireSchema = WorkflowScriptFileSchema.extend({
  script: WorkflowScriptWireSchema,
});
const WorkflowRunWireSchema = WorkflowRunSchema.extend({
  scriptSnapshot: WorkflowScriptWireSchema,
});

export const WorkflowListRequestSchema = z.object({
  type: z.literal("workflow/list"),
  requestId: z.string(),
});

export const WorkflowInspectRequestSchema = z.object({
  type: z.literal("workflow/inspect"),
  requestId: z.string(),
  scriptPath: z.string().trim().min(1),
});

export const WorkflowRunRequestSchema = z.object({
  type: z.literal("workflow/run"),
  requestId: z.string(),
  scriptPath: z.string().trim().min(1),
  inputPayload: z.string().trim().min(1),
  targetNodeId: z.string().trim().min(1).optional(),
});

export const WorkflowGetRunRequestSchema = z.object({
  type: z.literal("workflow/get-run"),
  requestId: z.string(),
  runId: z.string(),
});

export const WorkflowCancelRunRequestSchema = z.object({
  type: z.literal("workflow/cancel-run"),
  requestId: z.string(),
  runId: z.string(),
});

export const WorkflowSaveRequestSchema = z.object({
  type: z.literal("workflow/save"),
  requestId: z.string(),
  scriptPath: z.string().trim().min(1).optional(),
  fileName: z.string().trim().min(1).optional(),
  script: WorkflowScriptWireSchema,
});

export const WorkflowDeleteRequestSchema = z.object({
  type: z.literal("workflow/delete"),
  requestId: z.string(),
  scriptPath: z.string().trim().min(1),
});

export const WorkflowListResponseSchema = z.object({
  type: z.literal("workflow/list/response"),
  payload: z.object({
    requestId: z.string(),
    scripts: z.array(WorkflowScriptSummarySchema),
    error: z.string().nullable(),
  }),
});

export const WorkflowInspectResponseSchema = z.object({
  type: z.literal("workflow/inspect/response"),
  payload: z.object({
    requestId: z.string(),
    script: WorkflowScriptFileWireSchema.nullable(),
    latestRun: WorkflowRunWireSchema.nullable().default(null),
    error: z.string().nullable(),
  }),
});

export const WorkflowRunResponseSchema = z.object({
  type: z.literal("workflow/run/response"),
  payload: z.object({
    requestId: z.string(),
    run: WorkflowRunWireSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const WorkflowGetRunResponseSchema = z.object({
  type: z.literal("workflow/get-run/response"),
  payload: z.object({
    requestId: z.string(),
    run: WorkflowRunWireSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const WorkflowCancelRunResponseSchema = z.object({
  type: z.literal("workflow/cancel-run/response"),
  payload: z.object({
    requestId: z.string(),
    run: WorkflowRunWireSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const WorkflowSaveResponseSchema = z.object({
  type: z.literal("workflow/save/response"),
  payload: z.object({
    requestId: z.string(),
    script: WorkflowScriptFileWireSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const WorkflowDeleteResponseSchema = z.object({
  type: z.literal("workflow/delete/response"),
  payload: z.object({
    requestId: z.string(),
    scriptPath: z.string(),
    error: z.string().nullable(),
  }),
});

export type WorkflowListRequest = z.infer<typeof WorkflowListRequestSchema>;
export type WorkflowInspectRequest = z.infer<typeof WorkflowInspectRequestSchema>;
export type WorkflowRunRequest = z.infer<typeof WorkflowRunRequestSchema>;
export type WorkflowGetRunRequest = z.infer<typeof WorkflowGetRunRequestSchema>;
export type WorkflowCancelRunRequest = z.infer<typeof WorkflowCancelRunRequestSchema>;
export type WorkflowSaveRequest = z.infer<typeof WorkflowSaveRequestSchema>;
export type WorkflowDeleteRequest = z.infer<typeof WorkflowDeleteRequestSchema>;
export type WorkflowListResponse = z.infer<typeof WorkflowListResponseSchema>;
export type WorkflowInspectResponse = z.infer<typeof WorkflowInspectResponseSchema>;
export type WorkflowRunResponse = z.infer<typeof WorkflowRunResponseSchema>;
export type WorkflowGetRunResponse = z.infer<typeof WorkflowGetRunResponseSchema>;
export type WorkflowCancelRunResponse = z.infer<typeof WorkflowCancelRunResponseSchema>;
export type WorkflowSaveResponse = z.infer<typeof WorkflowSaveResponseSchema>;
export type WorkflowDeleteResponse = z.infer<typeof WorkflowDeleteResponseSchema>;
