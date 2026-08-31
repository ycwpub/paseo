import { z } from "zod";

const PaseoGeneralKnowledgeResourceSchema = z
  .object({
    type: z.enum(["local-directory", "local-document", "cloud-document"]),
    source: z.string(),
    enabled: z.boolean().optional(),
  })
  .passthrough();

export const PaseoProjectGeneralKnowledgeResourceSchema = z.union([
  PaseoGeneralKnowledgeResourceSchema,
  z
    .object({
      type: z.literal("git-repository"),
      source: z.string().trim().min(1),
      branch: z.string().trim().min(1).optional(),
      directory: z.string().trim().min(1).optional(),
      enabled: z.boolean().optional(),
    })
    .passthrough(),
]);

export const PaseoProjectDocumentKnowledgeResourceSchema = z
  .object({
    type: z.enum(["local-document", "cloud-document"]),
    source: z.string(),
    enabled: z.boolean().optional(),
  })
  .passthrough();

export const PaseoProjectKnowledgeSchema = z
  .object({
    general: z.array(PaseoProjectGeneralKnowledgeResourceSchema).optional(),
    standards: z.array(PaseoProjectDocumentKnowledgeResourceSchema).optional(),
    projectSpecific: z.array(PaseoProjectDocumentKnowledgeResourceSchema).optional(),
  })
  .passthrough();

export const PaseoHostKnowledgeSchema = z
  .object({
    general: z.array(PaseoProjectGeneralKnowledgeResourceSchema).optional(),
    standards: z.array(PaseoProjectDocumentKnowledgeResourceSchema).optional(),
  })
  .passthrough();

export type PaseoProjectGeneralKnowledgeResource = z.infer<
  typeof PaseoProjectGeneralKnowledgeResourceSchema
>;
export type PaseoProjectDocumentKnowledgeResource = z.infer<
  typeof PaseoProjectDocumentKnowledgeResourceSchema
>;
export type PaseoProjectKnowledge = z.infer<typeof PaseoProjectKnowledgeSchema>;
export type PaseoHostKnowledge = z.infer<typeof PaseoHostKnowledgeSchema>;
