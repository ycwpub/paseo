import { z } from "zod";
import { PluginAppDefinitionSchema } from "./app-types.js";

export const PluginAuthorSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    email: z.string().optional(),
    url: z.string().optional(),
  }),
]);
export type PluginAuthor = z.infer<typeof PluginAuthorSchema>;

export const PluginInterfaceSchema = z.object({
  displayName: z.string().optional(),
  shortDescription: z.string().optional(),
  longDescription: z.string().optional(),
  developerName: z.string().optional(),
  category: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  websiteURL: z.string().optional(),
  privacyPolicyURL: z.string().optional(),
  termsOfServiceURL: z.string().optional(),
  defaultPrompt: z.array(z.string()).optional(),
  brandColor: z.string().optional(),
  composerIcon: z.string().optional(),
  logo: z.string().optional(),
  logoDark: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
});
export type PluginInterface = z.infer<typeof PluginInterfaceSchema>;

const PluginMcpServerMapSchema = z.record(z.string(), z.record(z.string(), z.unknown()));

export const PluginManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: PluginAuthorSchema.optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  mcpServers: z.union([z.string(), z.array(z.string()), PluginMcpServerMapSchema]).optional(),
  httpServices: z.union([z.string(), z.array(z.string())]).optional(),
  apps: z.union([z.string(), z.array(z.string())]).optional(),
  hooks: z.unknown().optional(),
  interface: PluginInterfaceSchema.optional(),
});
export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export const PluginSourceTypeSchema = z.enum(["local", "git", "npm", "unknown"]);
export type PluginSourceType = z.infer<typeof PluginSourceTypeSchema>;

export const PluginUnsupportedComponentSchema = z.enum(["hooks", "ui"]);
export type PluginUnsupportedComponent = z.infer<typeof PluginUnsupportedComponentSchema>;

export const PluginMarketplaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  path: z.string(),
  removable: z.boolean(),
  pluginCount: z.number().int().nonnegative(),
  error: z.string().nullable(),
});
export type PluginMarketplaceSummary = z.infer<typeof PluginMarketplaceSummarySchema>;

export const PluginHttpServiceRuntimeStatusSchema = z.enum(["running", "stopped", "error"]);
export type PluginHttpServiceRuntimeStatus = z.infer<typeof PluginHttpServiceRuntimeStatusSchema>;

export const PluginHttpServiceSummarySchema = z.object({
  name: z.string(),
  host: z.string(),
  configuredPort: z.number().int().nonnegative().max(65_535),
  boundPort: z.number().int().positive().max(65_535).nullable(),
  path: z.string(),
  workflowPath: z.string(),
  status: PluginHttpServiceRuntimeStatusSchema,
  submitUrl: z.string().nullable(),
  resultUrlTemplate: z.string().nullable(),
  error: z.string().nullable(),
});
export type PluginHttpServiceSummary = z.infer<typeof PluginHttpServiceSummarySchema>;

export const PluginHttpJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);
export type PluginHttpJobStatus = z.infer<typeof PluginHttpJobStatusSchema>;

export const PluginHttpJobSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  serviceName: z.string(),
  // COMPAT(pluginHttpServiceManagement): added on 2026-08-20.
  projectId: z.string().min(1).optional(),
  listenerId: z.string().min(1).optional(),
  routeId: z.string().min(1).optional(),
  status: PluginHttpJobStatusSchema,
  input: z.unknown(),
  result: z.unknown().nullable(),
  workflowRunId: z.string().nullable(),
  error: z.string().nullable(),
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
});
export type PluginHttpJob = z.infer<typeof PluginHttpJobSchema>;

export const PluginSummarySchema = z.object({
  id: z.string(),
  pluginId: z.string().optional(),
  name: z.string(),
  displayName: z.string(),
  version: z.string(),
  description: z.string(),
  developerName: z.string().optional(),
  category: z.string().optional(),
  homepage: z.string().optional(),
  repository: z.string().optional(),
  license: z.string().optional(),
  keywords: z.array(z.string()),
  sourceType: PluginSourceTypeSchema,
  sourcePath: z.string().optional(),
  marketplaceId: z.string().optional(),
  marketplaceName: z.string().optional(),
  installed: z.boolean(),
  enabled: z.boolean(),
  installable: z.boolean(),
  updateAvailable: z.boolean(),
  skills: z.array(z.string()),
  mcpServers: z.array(z.string()),
  httpServices: z.array(PluginHttpServiceSummarySchema),
  apps: z.array(PluginAppDefinitionSchema),
  unsupportedComponents: z.array(PluginUnsupportedComponentSchema),
  warnings: z.array(z.string()),
  installedAt: z.number().optional(),
  updatedAt: z.number().optional(),
});
export type PluginSummary = z.infer<typeof PluginSummarySchema>;

export const PluginStateSchema = z.object({
  plugins: z.array(PluginSummarySchema),
  marketplaces: z.array(PluginMarketplaceSummarySchema),
});
export type PluginState = z.infer<typeof PluginStateSchema>;

export const PluginInstallSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("local"),
    path: z.string().min(1),
  }),
  z.object({
    type: z.literal("marketplace"),
    marketplaceId: z.string().min(1),
    pluginName: z.string().min(1),
  }),
]);
export type PluginInstallSource = z.infer<typeof PluginInstallSourceSchema>;
