import { z } from "zod";

export const TeammateRoleSchema = z.enum(["leader", "teammate"]);
export type TeammateRole = z.infer<typeof TeammateRoleSchema>;

export const TeammateStatusSchema = z.enum(["pending", "idle", "active", "completed", "failed"]);
export type TeammateStatus = z.infer<typeof TeammateStatusSchema>;

export const WorkspaceModeSchema = z.enum(["shared", "isolated"]);
export type WorkspaceMode = z.infer<typeof WorkspaceModeSchema>;

export const TeamMemberSettingsSchema = z.object({
  provider: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  thinkingOptionId: z.string().trim().min(1).optional(),
});
export type TeamMemberSettings = z.infer<typeof TeamMemberSettingsSchema>;

export const TeamAssistantSchema = z.object({
  slotId: z.string(),
  conversationId: z.string(),
  role: TeammateRoleSchema,
  assistantBackend: z.string(),
  icon: z.string().optional(),
  assistantName: z.string(),
  status: TeammateStatusSchema,
  cliPath: z.string().optional(),
  assistantId: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  thinkingOptionId: z.string().optional(),
  pendingConfirmations: z.number().optional(),
});
export type TeamAssistant = z.infer<typeof TeamAssistantSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  workspace: z.string(),
  workspaceMode: WorkspaceModeSchema,
  leaderAssistantId: z.string(),
  assistantIds: z.array(z.string()).optional(),
  assistants: z.array(TeamAssistantSchema),
  sessionMode: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Team = z.infer<typeof TeamSchema>;

export const TeamCreateInputSchema = z.object({
  name: z.string().min(1),
  workspace: z.string().optional(),
  workspaceMode: WorkspaceModeSchema.optional(),
  leaderAssistantId: z.string().min(1).optional(),
  assistantIds: z.array(z.string().min(1)).min(2).optional(),
  memberSettings: z.record(z.string().min(1), TeamMemberSettingsSchema).optional(),
});
export type TeamCreateInput = z.infer<typeof TeamCreateInputSchema>;

export const TeamUpdateInputSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  workspace: z.string().optional(),
  workspaceMode: WorkspaceModeSchema.optional(),
  leaderAssistantId: z.string().min(1).optional(),
  assistantIds: z.array(z.string().min(1)).min(2).optional(),
  memberSettings: z.record(z.string().min(1), TeamMemberSettingsSchema).optional(),
  sessionMode: z.string().optional(),
});
export type TeamUpdateInput = z.infer<typeof TeamUpdateInputSchema>;

export const TeamSlotWorkStateSchema = z.enum([
  "idle",
  "queued",
  "starting",
  "running",
  "paused",
  "blocked",
]);
export type TeamSlotWorkState = z.infer<typeof TeamSlotWorkStateSchema>;

export const TeamSlotWorkSchema = z.object({
  slotId: z.string(),
  role: z.enum(["lead", "teammate"]),
  state: TeamSlotWorkStateSchema,
  queuedForegroundCount: z.number(),
  queuedBackgroundCount: z.number(),
  activeTurnId: z.string().nullable(),
  activeTurnStartedAtMs: z.number().nullable(),
  blockedReason: z.string().nullable(),
  teamRunId: z.string().nullable(),
});
export type TeamSlotWork = z.infer<typeof TeamSlotWorkSchema>;
