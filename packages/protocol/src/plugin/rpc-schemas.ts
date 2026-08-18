import { z } from "zod";
import {
  PluginInstallSourceSchema,
  PluginMarketplaceSummarySchema,
  PluginStateSchema,
  PluginSummarySchema,
} from "./types.js";

const PluginStateResponsePayloadSchema = PluginStateSchema.extend({
  requestId: z.string(),
  error: z.string().nullable(),
});

const PluginMutationResponsePayloadSchema = z.object({
  requestId: z.string(),
  plugin: PluginSummarySchema.nullable(),
  state: PluginStateSchema,
  error: z.string().nullable(),
});

export const PluginListRequestSchema = z.object({
  type: z.literal("plugin.list.request"),
  requestId: z.string(),
  refresh: z.boolean().optional(),
});

export const PluginListResponseSchema = z.object({
  type: z.literal("plugin.list.response"),
  payload: PluginStateResponsePayloadSchema,
});

export const PluginMarketplaceAddRequestSchema = z.object({
  type: z.literal("plugin.marketplace.add.request"),
  requestId: z.string(),
  path: z.string().min(1),
});

export const PluginMarketplaceAddResponseSchema = z.object({
  type: z.literal("plugin.marketplace.add.response"),
  payload: PluginStateResponsePayloadSchema.extend({
    marketplace: PluginMarketplaceSummarySchema.nullable(),
  }),
});

export const PluginMarketplaceRemoveRequestSchema = z.object({
  type: z.literal("plugin.marketplace.remove.request"),
  requestId: z.string(),
  marketplaceId: z.string().min(1),
});

export const PluginMarketplaceRemoveResponseSchema = z.object({
  type: z.literal("plugin.marketplace.remove.response"),
  payload: PluginStateResponsePayloadSchema.extend({
    marketplaceId: z.string(),
    ok: z.boolean(),
  }),
});

export const PluginInstallRequestSchema = z.object({
  type: z.literal("plugin.install.request"),
  requestId: z.string(),
  source: PluginInstallSourceSchema,
});

export const PluginInstallResponseSchema = z.object({
  type: z.literal("plugin.install.response"),
  payload: PluginMutationResponsePayloadSchema,
});

export const PluginSetEnabledRequestSchema = z.object({
  type: z.literal("plugin.set_enabled.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
  enabled: z.boolean(),
});

export const PluginSetEnabledResponseSchema = z.object({
  type: z.literal("plugin.set_enabled.response"),
  payload: PluginMutationResponsePayloadSchema,
});

export const PluginUninstallRequestSchema = z.object({
  type: z.literal("plugin.uninstall.request"),
  requestId: z.string(),
  pluginId: z.string().min(1),
});

export const PluginUninstallResponseSchema = z.object({
  type: z.literal("plugin.uninstall.response"),
  payload: PluginStateResponsePayloadSchema.extend({
    pluginId: z.string(),
    ok: z.boolean(),
  }),
});

export const PluginChangedMessageSchema = z.object({
  type: z.literal("plugin.changed"),
  payload: PluginStateSchema,
});
