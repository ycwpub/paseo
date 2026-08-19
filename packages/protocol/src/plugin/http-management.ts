import { z } from "zod";
import { PluginHttpJobSchema, PluginHttpJobStatusSchema } from "./types.js";

const HttpPathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("/"), "HTTP path must start with /");

export const PluginHttpRouteSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  method: z.enum(["POST"]).default("POST"),
  path: HttpPathSchema,
  requestTemplate: z.string().default(""),
  responseTemplate: z.string().default(""),
  workflowPath: z.string().trim().min(1),
  targetNodeId: z.string().trim().optional(),
  maxBodyBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024)
    .default(1024 * 1024),
});
export type PluginHttpRoute = z.infer<typeof PluginHttpRouteSchema>;

export const PluginHttpDefaultJobApiSchema = z.object({
  enabled: z.boolean().default(true),
  submitPath: HttpPathSchema.default("/jobs"),
  queryPath: HttpPathSchema.default("/jobs/{requestId}"),
  deletePath: HttpPathSchema.default("/jobs/{requestId}"),
  workflowPath: z.string().trim().min(1),
  targetNodeId: z.string().trim().optional(),
  requestTemplate: z.string().default(""),
  responseTemplate: z.string().default(""),
});
export type PluginHttpDefaultJobApi = z.infer<typeof PluginHttpDefaultJobApiSchema>;

export const PluginHttpRetentionSchema = z.object({
  enabled: z.boolean().default(false),
  maxAgeSeconds: z
    .number()
    .int()
    .positive()
    .default(7 * 24 * 60 * 60),
  statuses: z
    .array(PluginHttpJobStatusSchema)
    .default(["succeeded", "failed", "cancelled", "timed_out"]),
});
export type PluginHttpRetention = z.infer<typeof PluginHttpRetentionSchema>;

export const PluginHttpListenerSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  host: z.string().trim().min(1).default("127.0.0.1"),
  port: z.number().int().nonnegative().max(65_535),
  authTokenEnv: z.string().trim().min(1).optional(),
  defaultJobApi: PluginHttpDefaultJobApiSchema.optional(),
  routes: z.array(PluginHttpRouteSchema).default([]),
  retention: PluginHttpRetentionSchema.default({
    enabled: false,
    maxAgeSeconds: 7 * 24 * 60 * 60,
    statuses: ["succeeded", "failed", "cancelled", "timed_out"],
  }),
});
export type PluginHttpListener = z.infer<typeof PluginHttpListenerSchema>;

export const PluginHttpProjectConfigSchema = z.object({
  version: z.literal(1),
  pluginId: z.string().trim().min(1),
  projectId: z.string().trim().min(1),
  listeners: z.array(PluginHttpListenerSchema),
  updatedAt: z.string(),
});
export type PluginHttpProjectConfig = z.infer<typeof PluginHttpProjectConfigSchema>;

export const PluginHttpListenerRuntimeSchema = z.object({
  listenerId: z.string(),
  status: z.enum(["running", "stopped", "error"]),
  boundPort: z.number().int().positive().max(65_535).nullable(),
  error: z.string().nullable(),
});
export type PluginHttpListenerRuntime = z.infer<typeof PluginHttpListenerRuntimeSchema>;

const PluginHttpConfigPayloadSchema = z.object({
  requestId: z.string(),
  config: PluginHttpProjectConfigSchema.nullable(),
  runtimes: z.array(PluginHttpListenerRuntimeSchema),
  error: z.string().nullable(),
});

export const PluginHttpConfigGetRequestSchema = z.object({
  type: z.literal("plugin.http.config.get.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  projectId: z.string().min(1),
});
export const PluginHttpConfigGetResponseSchema = z.object({
  type: z.literal("plugin.http.config.get.response"),
  payload: PluginHttpConfigPayloadSchema,
});

export const PluginHttpConfigSaveRequestSchema = z.object({
  type: z.literal("plugin.http.config.save.request"),
  requestId: z.string(),
  config: PluginHttpProjectConfigSchema.omit({ updatedAt: true }),
});
export const PluginHttpConfigSaveResponseSchema = z.object({
  type: z.literal("plugin.http.config.save.response"),
  payload: PluginHttpConfigPayloadSchema,
});

export const PluginHttpJobDeleteManyRequestSchema = z.object({
  type: z.literal("plugin.http.job.delete_many.request"),
  requestId: z.string(),
  processIds: z.array(z.string().min(1)).min(1).max(500),
});
export const PluginHttpJobDeleteManyResponseSchema = z.object({
  type: z.literal("plugin.http.job.delete_many.response"),
  payload: z.object({
    requestId: z.string(),
    deleted: z.array(z.string()),
    skipped: z.array(z.object({ processId: z.string(), reason: z.string() })),
    error: z.string().nullable(),
  }),
});

export const PluginHttpJobCleanupRequestSchema = z.object({
  type: z.literal("plugin.http.job.cleanup.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  projectId: z.string().min(1),
});
export const PluginHttpJobCleanupResponseSchema = z.object({
  type: z.literal("plugin.http.job.cleanup.response"),
  payload: z.object({
    requestId: z.string(),
    deleted: z.array(z.string()),
    error: z.string().nullable(),
  }),
});

export const PluginHttpJobListFilterSchema = z.object({
  statuses: z.array(PluginHttpJobStatusSchema).optional(),
  listenerId: z.string().min(1).optional(),
  routeId: z.string().min(1).optional(),
  createdBefore: z.string().optional(),
  createdAfter: z.string().optional(),
});

export type PluginHttpJobDeleteManyResponse = z.infer<
  typeof PluginHttpJobDeleteManyResponseSchema
>["payload"];
export type PluginHttpConfigGetResponse = z.infer<
  typeof PluginHttpConfigGetResponseSchema
>["payload"];
export type PluginHttpConfigSaveResponse = z.infer<
  typeof PluginHttpConfigSaveResponseSchema
>["payload"];
export type PluginHttpJobCleanupResponse = z.infer<
  typeof PluginHttpJobCleanupResponseSchema
>["payload"];

export const PluginHttpManagedJobSchema = PluginHttpJobSchema;
