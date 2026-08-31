import { z } from "zod";
import {
  ScheduleBashTargetConfigSchema,
  ScheduleCadenceSchema,
  ScheduleNewAgentTargetConfigSchema,
} from "./types.js";

export {
  ScheduleCreateResponseSchema,
  ScheduleDeleteRequestSchema,
  ScheduleDeleteResponseSchema,
  ScheduleInspectRequestSchema,
  ScheduleInspectResponseSchema,
  ScheduleListRequestSchema,
  ScheduleListResponseSchema,
  ScheduleLogsRequestSchema,
  ScheduleLogsResponseSchema,
  SchedulePauseRequestSchema,
  SchedulePauseResponseSchema,
  ScheduleResumeRequestSchema,
  ScheduleResumeResponseSchema,
  ScheduleRunOnceRequestSchema,
  ScheduleRunOnceResponseSchema,
  ScheduleUpdateResponseSchema,
} from "./rpc-schemas.js";

const ExtendedScheduleCreateTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("self"),
    agentId: z.guid(),
  }),
  z.object({
    type: z.literal("agent"),
    agentId: z.guid(),
  }),
  z.object({
    type: z.literal("new-agent"),
    config: ScheduleNewAgentTargetConfigSchema,
  }),
  z.object({
    type: z.literal("bash"),
    config: ScheduleBashTargetConfigSchema,
  }),
]);

export const ScheduleCreateRequestSchema = z.object({
  type: z.literal("schedule/create"),
  requestId: z.string(),
  prompt: z.string().min(1),
  name: z.string().optional(),
  cadence: ScheduleCadenceSchema,
  target: ExtendedScheduleCreateTargetSchema,
  maxRuns: z.number().int().positive().optional(),
  expiresAt: z.string().optional(),
  runOnCreate: z.boolean().optional(),
});

const ExtendedScheduleUpdateNewAgentConfigSchema = z.object({
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).nullable().optional(),
  modeId: z.string().trim().min(1).nullable().optional(),
  thinkingOptionId: z.string().trim().min(1).nullable().optional(),
  archiveOnFinish: z.boolean().optional(),
  isolation: z.enum(["local", "worktree"]).optional(),
  assistantId: z.string().trim().min(1).nullable().optional(),
  cwd: z.string().trim().min(1).optional(),
});

const ExtendedScheduleUpdateBashConfigSchema = z.object({
  cwd: z.string().trim().min(1).optional(),
  shell: z.string().trim().min(1).nullable().optional(),
  timeoutMs: z.number().int().positive().nullable().optional(),
});

export const ScheduleUpdateRequestSchema = z.object({
  type: z.literal("schedule/update"),
  requestId: z.string(),
  scheduleId: z.string(),
  name: z.string().nullable().optional(),
  prompt: z.string().min(1).optional(),
  cadence: ScheduleCadenceSchema.optional(),
  newAgentConfig: ExtendedScheduleUpdateNewAgentConfigSchema.optional(),
  bashConfig: ExtendedScheduleUpdateBashConfigSchema.optional(),
  maxRuns: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
