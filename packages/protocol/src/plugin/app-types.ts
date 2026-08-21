import { z } from "zod";
import { AgentProviderSchema } from "../provider-manifest.js";

const PluginAppComponentBaseSchema = z.object({
  id: z.string().trim().min(1),
});

const PluginAppFieldBaseSchema = PluginAppComponentBaseSchema.extend({
  label: z.string().trim().min(1),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  description: z.string().optional(),
});

export const PluginAppHttpServiceActionSchema = z.object({
  type: z.literal("http_service"),
  pluginId: z.string().trim().min(1).optional(),
  serviceName: z.string().trim().min(1),
  input: z.unknown().optional(),
});
export type PluginAppHttpServiceAction = z.infer<typeof PluginAppHttpServiceActionSchema>;

export const PluginAppComponentSchema = z.discriminatedUnion("type", [
  PluginAppComponentBaseSchema.extend({
    type: z.literal("heading"),
    text: z.string(),
    level: z.number().int().min(1).max(3).optional(),
  }),
  PluginAppComponentBaseSchema.extend({
    type: z.literal("text"),
    text: z.string(),
  }),
  PluginAppFieldBaseSchema.extend({
    type: z.literal("text_input"),
    defaultValue: z.string().optional(),
  }),
  PluginAppFieldBaseSchema.extend({
    type: z.literal("textarea"),
    defaultValue: z.string().optional(),
  }),
  PluginAppFieldBaseSchema.extend({
    type: z.literal("number_input"),
    defaultValue: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  PluginAppFieldBaseSchema.extend({
    type: z.literal("select"),
    defaultValue: z.string().optional(),
    options: z
      .array(
        z.object({
          label: z.string(),
          value: z.string(),
        }),
      )
      .min(1),
  }),
  PluginAppFieldBaseSchema.extend({
    type: z.literal("checkbox"),
    defaultValue: z.boolean().optional(),
  }),
  PluginAppComponentBaseSchema.extend({
    type: z.literal("button"),
    label: z.string().trim().min(1),
    variant: z.enum(["primary", "secondary", "destructive"]).optional(),
    action: PluginAppHttpServiceActionSchema,
  }),
  PluginAppComponentBaseSchema.extend({
    type: z.literal("status"),
    label: z.string().optional(),
  }),
  PluginAppComponentBaseSchema.extend({
    type: z.literal("result"),
    label: z.string().optional(),
  }),
  PluginAppComponentBaseSchema.extend({
    type: z.literal("json"),
    label: z.string().optional(),
    value: z.unknown().optional(),
  }),
]);
export type PluginAppComponent = z.infer<typeof PluginAppComponentSchema>;

export const PluginAppDocumentSchema = z.object({
  version: z.literal(1),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  components: z.array(PluginAppComponentSchema).max(100),
});
export type PluginAppDocument = z.infer<typeof PluginAppDocumentSchema>;

export const PluginAppProjectBindingSchema = z
  .object({
    idField: z.string().trim().min(1).default("projectId"),
    nameField: z.string().trim().min(1).optional(),
    sourceDirectoryField: z.string().trim().min(1).optional(),
    selectorLabel: z.string().trim().min(1).default("Project"),
    selectorDescription: z
      .string()
      .trim()
      .min(1)
      .default("插件页面、交互、流程和历史记录都归属于所选 Project。"),
    createNameLabel: z.string().trim().min(1).default("新 Project 名称"),
    createNamePlaceholder: z.string().default("输入自定义 Project 名称"),
  })
  .strict();
export type PluginAppProjectBinding = z.infer<typeof PluginAppProjectBindingSchema>;

export const DEFAULT_PLUGIN_APP_PROJECT_BINDING: PluginAppProjectBinding = {
  idField: "projectId",
  selectorLabel: "Project",
  selectorDescription: "插件页面、交互、流程和历史记录都归属于所选 Project。",
  createNameLabel: "新 Project 名称",
  createNamePlaceholder: "输入自定义 Project 名称",
};

export const PluginAppDefinitionSchema = z.object({
  id: z.string().trim().min(1),
  category: z.string().trim().min(1).optional(),
  // COMPAT(pluginProjectScopedApps): added on 2026-08-20. Older daemons omit it.
  project: PluginAppProjectBindingSchema.optional(),
  initialDocument: PluginAppDocumentSchema.optional(),
});
export type PluginAppDefinition = z.infer<typeof PluginAppDefinitionSchema>;

export const PluginAppConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string(),
});
export type PluginAppConversationMessage = z.infer<typeof PluginAppConversationMessageSchema>;

export const PluginAppDefaultAgentSchema = z.object({
  provider: AgentProviderSchema.refine((value) => value.trim().length > 0, {
    message: "Provider is required",
  }),
  model: z.string().trim().min(1),
});
export type PluginAppDefaultAgent = z.infer<typeof PluginAppDefaultAgentSchema>;

export const PluginAppStateSchema = z.object({
  pluginId: z.string(),
  appId: z.string(),
  // COMPAT(pluginProjectScopedApps): added on 2026-08-20. Older daemons return global app state.
  projectId: z.string().optional(),
  // COMPAT(pluginProjectDefaultAgent): added on 2026-08-20.
  defaultAgent: PluginAppDefaultAgentSchema.nullable().default(null),
  category: z.string().optional(),
  document: PluginAppDocumentSchema.nullable(),
  // COMPAT(pluginAppHtmlPreview): added on 2026-08-21. Older daemons omit it.
  htmlPath: z.string().optional(),
  conversation: z.array(PluginAppConversationMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PluginAppState = z.infer<typeof PluginAppStateSchema>;

export const PluginAppGenerationSchema = z.object({
  message: z.string(),
  document: PluginAppDocumentSchema,
});
export type PluginAppGeneration = z.infer<typeof PluginAppGenerationSchema>;
