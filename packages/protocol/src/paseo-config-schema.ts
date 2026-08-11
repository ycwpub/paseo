import { z } from "zod";

export const DEFAULT_PASEO_PROJECT_DIRECTORIES = {
  project: ["{{workspaceDirectory}}"],
  knowledge: [],
  indexSkill: [],
  workspaceData: ["~/.paseo/workspaces/{{workspaceId}}"],
} as const;

export type PaseoProjectDirectoryKey = keyof typeof DEFAULT_PASEO_PROJECT_DIRECTORIES;
export type PaseoProjectDirectoryMode = "single" | "multiple";

export const PaseoProjectDirectoryEntrySchema = z.union([
  z.string(),
  z
    .object({
      path: z.string(),
      enabled: z.boolean().optional(),
    })
    .passthrough(),
]);

export type PaseoProjectDirectoryEntry = z.infer<typeof PaseoProjectDirectoryEntrySchema>;

export function resolvePaseoProjectDirectoryEntries(
  directories: PaseoProjectDirectories | null | undefined,
): Record<PaseoProjectDirectoryKey, Array<{ path: string; enabled: boolean }>> {
  const resolve = (entries: readonly PaseoProjectDirectoryEntry[]) =>
    entries.map((entry) =>
      typeof entry === "string"
        ? { path: entry, enabled: true }
        : { path: entry.path, enabled: entry.enabled !== false },
    );
  return {
    project: resolve(directories?.project ?? DEFAULT_PASEO_PROJECT_DIRECTORIES.project),
    knowledge: resolve(directories?.knowledge ?? DEFAULT_PASEO_PROJECT_DIRECTORIES.knowledge),
    indexSkill: resolve(directories?.indexSkill ?? DEFAULT_PASEO_PROJECT_DIRECTORIES.indexSkill),
    workspaceData: resolve(
      directories?.workspaceData ?? DEFAULT_PASEO_PROJECT_DIRECTORIES.workspaceData,
    ),
  };
}

export function resolvePaseoProjectDirectoryValues(
  directories: PaseoProjectDirectories | null | undefined,
): Record<PaseoProjectDirectoryKey, string[]> {
  return Object.fromEntries(
    Object.entries(resolvePaseoProjectDirectoryEntries(directories)).map(([key, entries]) => [
      key,
      entries.filter((entry) => entry.enabled).map((entry) => entry.path),
    ]),
  ) as Record<PaseoProjectDirectoryKey, string[]>;
}

export function normalizeLifecycleCommands(commands: unknown): string[] {
  if (typeof commands === "string") {
    return commands.trim().length > 0 ? [commands] : [];
  }
  if (!Array.isArray(commands)) {
    return [];
  }
  return commands.filter((command): command is string => {
    return typeof command === "string" && command.trim().length > 0;
  });
}

export const PaseoLifecycleCommandRawSchema = z.union([z.string(), z.array(z.string())]);

export const PaseoScriptEntryRawSchema = z
  .object({
    type: z.unknown().optional(),
    command: z.unknown().optional(),
    port: z.unknown().optional(),
  })
  .passthrough();

export const PaseoWorktreeConfigRawSchema = z
  .object({
    setup: PaseoLifecycleCommandRawSchema.optional(),
    teardown: PaseoLifecycleCommandRawSchema.optional(),
    terminals: z.unknown().optional(),
    servicePorts: PaseoServicePortAllocationSchema.optional(),
  })
  .passthrough();

export const PaseoMetadataGenerationEntrySchema = z
  .object({
    instructions: z.string().optional(),
  })
  .passthrough()
  .catch({});

export const PaseoMetadataGenerationSchema = z
  .object({
    title: PaseoMetadataGenerationEntrySchema.optional(),
    branchName: PaseoMetadataGenerationEntrySchema.optional(),
    commitMessage: PaseoMetadataGenerationEntrySchema.optional(),
    pullRequest: PaseoMetadataGenerationEntrySchema.optional(),
  })
  // COMPAT(projectMetadataAgentTitle): `agentTitle` project metadata prompts were removed
  // in v0.1.96; keep legacy paseo.json parseable until 2026-12-16.
  .passthrough()
  .catch({});

export const PaseoProjectDirectoriesSchema = z
  .object({
    project: z.array(PaseoProjectDirectoryEntrySchema).optional(),
    knowledge: z.array(PaseoProjectDirectoryEntrySchema).optional(),
    indexSkill: z.array(PaseoProjectDirectoryEntrySchema).optional(),
    workspaceData: z.array(PaseoProjectDirectoryEntrySchema).optional(),
  })
  .passthrough();

export const PaseoProjectIndexSkillSchema = z
  .object({
    autoGenerate: z.boolean().optional(),
    updateIntervalMinutes: z.number().int().positive().nullable().optional(),
  })
  .passthrough();

export const PaseoInstructionTemplateSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    description: z.string().optional(),
    content: z.string(),
  })
  .passthrough();

export const PaseoProjectConfigSchema = z
  .object({
    directoryMode: z.enum(["single", "multiple"]).optional(),
    directories: PaseoProjectDirectoriesSchema.optional(),
    indexSkill: PaseoProjectIndexSkillSchema.optional(),
    variables: z.record(z.string(), z.string()).optional(),
    instructionTemplates: z.array(PaseoInstructionTemplateSchema).optional(),
  })
  .passthrough();

export const PaseoConfigRawSchema = z
  .object({
    worktree: PaseoWorktreeConfigRawSchema.optional(),
    scripts: z.record(z.string(), PaseoScriptEntryRawSchema).optional(),
    metadataGeneration: PaseoMetadataGenerationSchema.optional(),
    project: PaseoProjectConfigSchema.optional(),
  })
  .passthrough();

export const WorktreeConfigSchema = PaseoWorktreeConfigRawSchema.extend({
  setup: z.unknown().optional().transform(normalizeLifecycleCommands),
  teardown: z.unknown().optional().transform(normalizeLifecycleCommands),
})
  .passthrough()
  .catch({ setup: [], teardown: [] });

export const ScriptEntrySchema = PaseoScriptEntryRawSchema.catch({});

export const PaseoConfigSchema = PaseoConfigRawSchema.extend({
  worktree: WorktreeConfigSchema.optional(),
  scripts: z.record(z.string(), ScriptEntrySchema).optional().catch({}),
  metadataGeneration: PaseoMetadataGenerationSchema.optional(),
  project: PaseoProjectConfigSchema.optional(),
})
  .passthrough()
  .catch({});

export const PaseoConfigRevisionSchema = z.object({
  mtimeMs: z.number(),
  size: z.number(),
});

export const ProjectConfigRpcErrorSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("project_not_found") }),
  z.object({ code: z.literal("invalid_project_config") }),
  z.object({
    code: z.literal("stale_project_config"),
    currentRevision: PaseoConfigRevisionSchema.nullable(),
  }),
  z.object({ code: z.literal("write_failed") }),
]);

export type PaseoScriptEntryRaw = z.infer<typeof PaseoScriptEntryRawSchema>;
export type PaseoMetadataGenerationEntry = z.infer<typeof PaseoMetadataGenerationEntrySchema>;
export type PaseoMetadataGeneration = z.infer<typeof PaseoMetadataGenerationSchema>;
export type PaseoProjectDirectories = z.infer<typeof PaseoProjectDirectoriesSchema>;
export type PaseoProjectIndexSkill = z.infer<typeof PaseoProjectIndexSkillSchema>;
export type PaseoInstructionTemplate = z.infer<typeof PaseoInstructionTemplateSchema>;
export type PaseoProjectConfig = z.infer<typeof PaseoProjectConfigSchema>;
export type PaseoConfigRaw = z.infer<typeof PaseoConfigRawSchema>;
export type PaseoConfig = z.infer<typeof PaseoConfigSchema>;
export type PaseoConfigRevision = z.infer<typeof PaseoConfigRevisionSchema>;
export type ProjectConfigRpcError = z.infer<typeof ProjectConfigRpcErrorSchema>;
