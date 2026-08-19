import { z } from "zod";

export const CloudKnowledgeScopeSchema = z.enum(["global", "project"]);

export const CloudDocumentAuthenticationIssueSchema = z.object({
  kind: z.literal("authentication_required"),
  source: z.string(),
  message: z.string(),
  loginUrl: z.string().nullable(),
  authCommand: z.string().nullable(),
});

export const CloudDocumentCacheStatusSchema = z.object({
  source: z.string(),
  cached: z.boolean(),
  cachedAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
  localPath: z.string().nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
  authIssue: CloudDocumentAuthenticationIssueSchema.nullable(),
});

const CloudDocumentTargetFields = {
  scope: CloudKnowledgeScopeSchema,
  projectId: z.string().optional(),
  source: z.string(),
};

export const CloudDocumentCacheRequestSchema = z.object({
  type: z.literal("knowledge.cloud_document.cache.request"),
  requestId: z.string(),
  ...CloudDocumentTargetFields,
  force: z.boolean().optional(),
});

export const CloudDocumentCacheResponseSchema = z.object({
  type: z.literal("knowledge.cloud_document.cache.response"),
  payload: z.object({
    requestId: z.string(),
    status: CloudDocumentCacheStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const CloudDocumentStatusRequestSchema = z.object({
  type: z.literal("knowledge.cloud_document.get_status.request"),
  requestId: z.string(),
  ...CloudDocumentTargetFields,
});

export const CloudDocumentStatusResponseSchema = z.object({
  type: z.literal("knowledge.cloud_document.get_status.response"),
  payload: z.object({
    requestId: z.string(),
    status: CloudDocumentCacheStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export type CloudKnowledgeScope = z.infer<typeof CloudKnowledgeScopeSchema>;
export type CloudDocumentCacheStatus = z.infer<typeof CloudDocumentCacheStatusSchema>;
