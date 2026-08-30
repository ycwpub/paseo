import type { PaseoConfigRaw, PaseoInstructionTemplate } from "@getpaseo/protocol/messages";
import { resolvePaseoProjectDirectoryEntries } from "@getpaseo/protocol/paseo-config-schema";
import {
  applyDraftToConfig as applyBaseDraftToConfig,
  configToDraft as configToBaseDraft,
  METADATA_PROMPT_KEYS,
  type LifecycleOriginalKind,
  type MetadataPromptKey,
  type ProjectConfigDraft as BaseProjectConfigDraft,
  type ProjectScriptDraft,
} from "@/utils/project-config-form";
import {
  projectKnowledgeDraftToConfig,
  projectKnowledgeToDraft,
  type ProjectKnowledgeDraft,
} from "@/projects/knowledge/model";
import {
  projectLarkGroupDraftsToConfig,
  projectLarkGroupsToDraft,
  type ProjectLarkGroupDraft,
} from "@/projects/lark/project-lark-context-model";

export { METADATA_PROMPT_KEYS };
export type { LifecycleOriginalKind, MetadataPromptKey, ProjectScriptDraft };

export const PROJECT_DIRECTORY_KEYS = ["project", "indexSkill", "workspaceData"] as const;
export type ProjectDirectoryKey = (typeof PROJECT_DIRECTORY_KEYS)[number];

export interface ProjectDirectoryDraft {
  id: string;
  path: string;
  enabled: boolean;
}

export interface ProjectVariableDraft {
  id: string;
  name: string;
  value: string;
}

export interface ProjectInstructionTemplateDraft {
  rowId: string;
  id: string;
  name: string;
  description: string;
  content: string;
  rawEntry: PaseoInstructionTemplate;
}

export interface ProjectConfigDraft extends BaseProjectConfigDraft {
  projectDirectoryMode: "single" | "multiple";
  projectDirectories: Record<ProjectDirectoryKey, ProjectDirectoryDraft[]>;
  projectIndexAutoGenerate: boolean;
  projectIndexUpdateIntervalText: string;
  projectVariables: ProjectVariableDraft[];
  projectKnowledge: ProjectKnowledgeDraft;
  instructionTemplates: ProjectInstructionTemplateDraft[];
  projectLarkGroups: ProjectLarkGroupDraft[];
  projectConfigBase: Record<string, unknown> | undefined;
}

export function projectDirectoryPathForDisplay(path: string, absoluteDirectory: string): string {
  return path.replace(/\{\{\s*workspaceDirectory\s*\}\}/gu, absoluteDirectory);
}

let projectDraftIdCounter = 0;

function nextProjectDraftId(prefix: string): string {
  projectDraftIdCounter += 1;
  return `${prefix}-${projectDraftIdCounter}`;
}

export function instructionTemplatesToDraft(
  templates: readonly PaseoInstructionTemplate[] | null | undefined,
): ProjectInstructionTemplateDraft[] {
  return (templates ?? []).map((entry) => ({
    rowId: nextProjectDraftId("instruction-template"),
    id: entry.id,
    name: entry.name,
    description: entry.description ?? "",
    content: entry.content,
    rawEntry: entry,
  }));
}

export function instructionTemplateDraftsToConfig(
  templates: readonly ProjectInstructionTemplateDraft[],
): PaseoInstructionTemplate[] {
  return templates
    .map((entry) => {
      const id = entry.id.trim();
      const name = entry.name.trim();
      if (!id || !name || !entry.content.trim()) return null;
      const next: PaseoInstructionTemplate = {
        ...entry.rawEntry,
        id,
        name,
        content: entry.content,
      };
      if (entry.description.trim()) {
        next.description = entry.description;
      } else {
        delete next.description;
      }
      return next;
    })
    .filter((entry): entry is PaseoInstructionTemplate => entry !== null);
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^[0-9]+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function projectDirectoriesToDraft(
  config: PaseoConfigRaw | null | undefined,
): Record<ProjectDirectoryKey, ProjectDirectoryDraft[]> {
  const directoryEntries = resolvePaseoProjectDirectoryEntries(config?.project?.directories);
  return Object.fromEntries(
    PROJECT_DIRECTORY_KEYS.map((key) => [
      key,
      directoryEntries[key].map((entry) => ({
        id: nextProjectDraftId(`project-directory-${key}`),
        path: entry.path,
        enabled: entry.enabled,
      })),
    ]),
  ) as Record<ProjectDirectoryKey, ProjectDirectoryDraft[]>;
}

function projectVariablesToDraft(
  config: PaseoConfigRaw | null | undefined,
): ProjectVariableDraft[] {
  return Object.entries(config?.project?.variables ?? {}).map(([name, value]) => ({
    id: nextProjectDraftId("project-variable"),
    name,
    value,
  }));
}

function projectIndexUpdateIntervalToDraft(
  config: PaseoConfigRaw | null | undefined,
): string {
  const updateIntervalMinutes = config?.project?.indexSkill?.updateIntervalMinutes;
  return updateIntervalMinutes == null ? "" : String(updateIntervalMinutes);
}

export function configToDraft(config: PaseoConfigRaw | null | undefined): ProjectConfigDraft {
  return {
    ...configToBaseDraft(config),
    projectDirectoryMode: config?.project?.directoryMode ?? "single",
    projectDirectories: projectDirectoriesToDraft(config),
    projectIndexAutoGenerate: config?.project?.indexSkill?.autoGenerate === true,
    projectIndexUpdateIntervalText: projectIndexUpdateIntervalToDraft(config),
    projectVariables: projectVariablesToDraft(config),
    projectKnowledge: projectKnowledgeToDraft(config?.project),
    instructionTemplates: instructionTemplatesToDraft(config?.project?.instructionTemplates),
    projectLarkGroups: projectLarkGroupsToDraft(config?.project?.larkGroups),
    projectConfigBase: config?.project as Record<string, unknown> | undefined,
  };
}

export function applyDraftToConfig(input: {
  draft: ProjectConfigDraft;
  base: PaseoConfigRaw | null | undefined;
}): PaseoConfigRaw {
  const result = applyBaseDraftToConfig({
    draft: input.draft,
    base: input.base,
  }) as PaseoConfigRaw & { project?: Record<string, unknown> };
  const nextProject: Record<string, unknown> = { ...input.draft.projectConfigBase };
  nextProject.directoryMode = input.draft.projectDirectoryMode;

  const nextDirectories: Record<string, unknown> = {
    ...(input.draft.projectConfigBase?.directories as Record<string, unknown> | undefined),
  };
  delete nextDirectories.reference;
  delete nextDirectories.knowledge;
  for (const key of PROJECT_DIRECTORY_KEYS) {
    const entries = input.draft.projectDirectories[key]
      .map((entry) => ({ path: entry.path.trim(), enabled: entry.enabled }))
      .filter((entry) => entry.path.length > 0);
    nextDirectories[key] = entries;
  }
  if (Object.keys(nextDirectories).length === 0) {
    delete nextProject.directories;
  } else {
    nextProject.directories = nextDirectories;
  }

  const nextIndexSkill: Record<string, unknown> = {
    ...(input.draft.projectConfigBase?.indexSkill as Record<string, unknown> | undefined),
    autoGenerate: input.draft.projectIndexAutoGenerate,
  };
  const customInterval = parsePositiveInteger(input.draft.projectIndexUpdateIntervalText);
  if (customInterval === undefined) {
    delete nextIndexSkill.updateIntervalMinutes;
  } else {
    nextIndexSkill.updateIntervalMinutes = customInterval;
  }
  nextProject.indexSkill = nextIndexSkill;

  const nextVariables = Object.fromEntries(
    input.draft.projectVariables
      .map((entry) => [entry.name.trim(), entry.value] as const)
      .filter(([name]) => name.length > 0),
  );
  if (Object.keys(nextVariables).length === 0) {
    delete nextProject.variables;
  } else {
    nextProject.variables = nextVariables;
  }

  delete nextProject.larkDocumentLinks;
  const nextKnowledgeSections = projectKnowledgeDraftToConfig(input.draft.projectKnowledge);
  const nextKnowledge: Record<string, unknown> = {
    ...(input.draft.projectConfigBase?.knowledge as Record<string, unknown> | undefined),
  };
  delete nextKnowledge.general;
  delete nextKnowledge.standards;
  delete nextKnowledge.projectSpecific;
  if (nextKnowledgeSections) {
    Object.assign(nextKnowledge, nextKnowledgeSections);
  }
  if (Object.keys(nextKnowledge).length > 0) {
    nextProject.knowledge = nextKnowledge;
  } else {
    delete nextProject.knowledge;
  }

  const nextLarkGroups = projectLarkGroupDraftsToConfig(input.draft.projectLarkGroups);
  if (nextLarkGroups.length > 0) {
    nextProject.larkGroups = nextLarkGroups;
  } else {
    delete nextProject.larkGroups;
  }

  if (Object.keys(nextProject).length === 0) {
    delete result.project;
  } else {
    result.project = nextProject;
  }
  return result;
}
