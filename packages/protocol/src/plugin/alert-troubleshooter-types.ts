import { z } from "zod";

export const AlertTroubleshooterChatSchema = z.object({
  chatId: z.string().trim().min(1),
  name: z.string().trim().optional(),
  groupId: z.string().trim().optional(),
});
export type AlertTroubleshooterChat = z.infer<typeof AlertTroubleshooterChatSchema>;

export const AlertTroubleshooterTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("default") }),
  z.object({ kind: z.literal("assistant"), assistantId: z.string().trim().min(1) }),
  z.object({ kind: z.literal("team"), teamId: z.string().trim().min(1) }),
]);
export type AlertTroubleshooterTarget = z.infer<typeof AlertTroubleshooterTargetSchema>;

export const AlertTroubleshooterScheduleSchema = z
  .object({
    enabled: z.boolean().default(true),
    intervalMinutes: z
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .default(30),
    lookbackMinutes: z
      .number()
      .int()
      .min(30)
      .max(7 * 24 * 60)
      .default(120),
    excludeRecentMinutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .default(0),
  })
  .refine((value) => value.lookbackMinutes > value.excludeRecentMinutes, {
    message: "扫描回看范围必须大于排除最近消息的时间",
    path: ["lookbackMinutes"],
  });
export type AlertTroubleshooterSchedule = z.infer<typeof AlertTroubleshooterScheduleSchema>;

export const AlertTroubleshooterConfigSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
    enabled: z.boolean().default(true),
    listenEnabled: z.boolean().default(true),
    troubleshootingEnabled: z.boolean().default(true),
    botId: z.string().trim().min(1),
    chats: z.array(AlertTroubleshooterChatSchema).min(1).max(50),
    target: AlertTroubleshooterTargetSchema.default({ kind: "default" }),
    troubleshootingSopDoc: z.string().trim().url(),
    attributionRecordRoot: z.string().trim().url(),
    recordTableUrl: z.string().trim().url().optional(),
    promptTemplate: z.string().max(30_000).default(""),
    queuePollIntervalMinutes: z
      .number()
      .int()
      .min(1)
      .max(24 * 60)
      .default(5),
    schedule: AlertTroubleshooterScheduleSchema.default({
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 120,
      excludeRecentMinutes: 0,
    }),
  })
  .transform((config) => ({
    ...config,
    version: 3 as const,
    recordTableUrl: config.recordTableUrl ?? config.attributionRecordRoot,
    schedule:
      config.version === 1 && config.schedule.excludeRecentMinutes === 30
        ? { ...config.schedule, excludeRecentMinutes: 0 }
        : config.schedule,
  }));
export type AlertTroubleshooterConfig = z.infer<typeof AlertTroubleshooterConfigSchema>;

export const AlertTroubleshooterRuntimeSchema = z.object({
  status: z
    .enum(["idle", "ingesting", "scanning", "polling", "troubleshooting", "error"])
    .default("idle"),
  lastScanStartedAt: z.string().nullable().default(null),
  lastScanFinishedAt: z.string().nullable().default(null),
  nextScanAt: z.string().nullable().default(null),
  lastQueuePollAt: z.string().nullable().default(null),
  queuedCount: z.number().int().nonnegative().default(0),
  activeRecordId: z.string().nullable().default(null),
  lastError: z.string().nullable().default(null),
  activeAgentId: z.string().nullable().default(null),
  lastTrigger: z.enum(["message", "schedule", "table", "manual"]).nullable().default(null),
});
export type AlertTroubleshooterRuntime = z.infer<typeof AlertTroubleshooterRuntimeSchema>;
