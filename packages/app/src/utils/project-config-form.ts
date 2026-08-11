import type {
  PaseoConfigRaw,
  PaseoInstructionTemplate,
  PaseoMetadataGeneration,
  PaseoMetadataGenerationEntry,
  PaseoScriptEntryRaw,
} from "@getpaseo/protocol/messages";
import { resolvePaseoProjectDirectoryEntries } from "@getpaseo/protocol/paseo-config-schema";

export type LifecycleOriginalKind = "string" | "array" | "missing";

export const METADATA_PROMPT_KEYS = ["branchName", "commitMessage", "pullRequest"] as const;
export type MetadataPromptKey = (typeof METADATA_PROMPT_KEYS)[number];

export interface ProjectScriptDraft {
  id: string;
  name: string;
  commandText: string;
  commandOriginalKind: LifecycleOriginalKind;
  type: string;
  portText: string;
  rawEntry: PaseoScriptEntryRaw;
}

export const PROJECT_DIRECTORY_KEYS = [
  "project",
  "knowledge",
  "indexSkill",
  "workspaceData",
] as const;
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

export interface ProjectConfigDraft {
  setupText: string;
  setupOriginalKind: LifecycleOriginalKind;
  teardownText: string;
  teardownOriginalKind: LifecycleOriginalKind;
  scripts: ProjectScriptDraft[];
  metadataPrompts: Record<MetadataPromptKey, string>;
  metadataGenerationBase: PaseoMetadataGeneration | undefined;
  projectDirectoryMode: "single" | "multiple";
  projectDirectories: Record<ProjectDirectoryKey, ProjectDirectoryDraft[]>;
  projectIndexAutoGenerate: boolean;
  projectIndexUpdateIntervalText: string;
  projectVariables: ProjectVariableDraft[];
  instructionTemplates: ProjectInstructionTemplateDraft[];
  projectConfigBase: Record<string, unknown> | undefined;
}

export function projectDirectoryPathForDisplay(path: string, absoluteDirectory: string): string {
  return path.replace(/\{\{\s*workspaceDirectory\s*\}\}/gu, absoluteDirectory);
}

interface LifecycleProjection {
  text: string;
  kind: LifecycleOriginalKind;
}

function projectLifecycle(value: unknown): LifecycleProjection {
  if (typeof value === "string") {
    return { text: value, kind: "string" };
  }
  if (Array.isArray(value)) {
    const lines = value.filter((entry): entry is string => typeof entry === "string");
    return { text: lines.join("\n"), kind: "array" };
  }
  return { text: "", kind: "missing" };
}

function lifecycleFromText(
  text: string,
  kind: LifecycleOriginalKind,
): string | string[] | undefined {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return undefined;
  }
  if (kind === "string") {
    return lines.join("\n");
  }
  if (kind === "array") {
    return lines;
  }
  return lines.length === 1 ? lines[0] : lines;
}

function projectScriptType(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function projectScriptPort(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

function parseScriptPort(value: string): number | string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (/^[0-9]+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return trimmed;
}

let scriptDraftIdCounter = 0;
let projectDraftIdCounter = 0;

function nextScriptDraftId(): string {
  scriptDraftIdCounter += 1;
  return `script-draft-${scriptDraftIdCounter}`;
}

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

function emptyMetadataPrompts(): Record<MetadataPromptKey, string> {
  return {
    branchName: "",
    commitMessage: "",
    pullRequest: "",
  };
}

// oxlint-disable-next-line complexity -- This adapter preserves all supported paseo.json shapes.
export function configToDraft(config: PaseoConfigRaw | null | undefined): ProjectConfigDraft {
  const worktree = config?.worktree ?? {};
  const setup = projectLifecycle(worktree.setup);
  const teardown = projectLifecycle(worktree.teardown);
  const scripts: ProjectScriptDraft[] = [];

  const scriptsRecord = config?.scripts ?? {};
  for (const [name, entry] of Object.entries(scriptsRecord)) {
    const command = projectLifecycle(entry.command);
    scripts.push({
      id: nextScriptDraftId(),
      name,
      commandText: command.text,
      commandOriginalKind: command.kind,
      type: projectScriptType(entry.type),
      portText: projectScriptPort(entry.port),
      rawEntry: entry,
    });
  }

  const metadataGeneration = config?.metadataGeneration;
  const directoryEntries = resolvePaseoProjectDirectoryEntries(config?.project?.directories);
  const projectDirectories = Object.fromEntries(
    PROJECT_DIRECTORY_KEYS.map((key) => [
      key,
      directoryEntries[key].map((entry) => ({
        id: nextProjectDraftId(`project-directory-${key}`),
        path: entry.path,
        enabled: entry.enabled,
      })),
    ]),
  ) as Record<ProjectDirectoryKey, ProjectDirectoryDraft[]>;
  const metadataPrompts = emptyMetadataPrompts();
  for (const key of METADATA_PROMPT_KEYS) {
    const instructions = metadataGeneration?.[key]?.instructions;
    if (typeof instructions === "string") {
      metadataPrompts[key] = instructions;
    }
  }

  return {
    setupText: setup.text,
    setupOriginalKind: setup.kind,
    teardownText: teardown.text,
    teardownOriginalKind: teardown.kind,
    scripts,
    metadataPrompts,
    metadataGenerationBase: metadataGeneration,
    projectDirectoryMode: config?.project?.directoryMode ?? "single",
    projectDirectories,
    projectIndexAutoGenerate: config?.project?.indexSkill?.autoGenerate === true,
    projectIndexUpdateIntervalText:
      config?.project?.indexSkill?.updateIntervalMinutes == null
        ? ""
        : String(config.project.indexSkill.updateIntervalMinutes),
    projectVariables: Object.entries(config?.project?.variables ?? {}).map(([name, value]) => ({
      id: nextProjectDraftId("project-variable"),
      name,
      value,
    })),
    instructionTemplates: instructionTemplatesToDraft(config?.project?.instructionTemplates),
    projectConfigBase: config?.project as Record<string, unknown> | undefined,
  };
}

interface ApplyDraftInput {
  draft: ProjectConfigDraft;
  base: PaseoConfigRaw | null | undefined;
}

// oxlint-disable-next-line complexity -- This adapter preserves unknown fields while applying form edits.
export function applyDraftToConfig(input: ApplyDraftInput): PaseoConfigRaw {
  const baseConfig = input.base ?? {};
  const baseWorktree = baseConfig.worktree ?? {};

  const nextWorktree: Record<string, unknown> = { ...baseWorktree };
  const nextSetup = lifecycleFromText(input.draft.setupText, input.draft.setupOriginalKind);
  if (nextSetup === undefined) {
    delete nextWorktree.setup;
  } else {
    nextWorktree.setup = nextSetup;
  }
  const nextTeardown = lifecycleFromText(
    input.draft.teardownText,
    input.draft.teardownOriginalKind,
  );
  if (nextTeardown === undefined) {
    delete nextWorktree.teardown;
  } else {
    nextWorktree.teardown = nextTeardown;
  }

  const nextScripts: Record<string, PaseoScriptEntryRaw> = {};
  for (const row of input.draft.scripts) {
    const trimmedName = row.name.trim();
    if (trimmedName.length === 0) {
      continue;
    }
    const baseEntry = row.rawEntry;
    const nextEntry: Record<string, unknown> = { ...baseEntry };
    const nextCommand = lifecycleFromText(row.commandText, row.commandOriginalKind);
    if (nextCommand === undefined) {
      delete nextEntry.command;
    } else {
      nextEntry.command = nextCommand;
    }
    const trimmedType = row.type.trim();
    if (trimmedType.length === 0) {
      delete nextEntry.type;
    } else {
      nextEntry.type = trimmedType;
    }
    const nextPort = parseScriptPort(row.portText);
    if (nextPort === undefined) {
      delete nextEntry.port;
    } else {
      nextEntry.port = nextPort;
    }
    nextScripts[trimmedName] = nextEntry as PaseoScriptEntryRaw;
  }

  const nextMetadataGeneration: Record<string, unknown> = {
    ...input.draft.metadataGenerationBase,
  };
  for (const key of METADATA_PROMPT_KEYS) {
    const text = input.draft.metadataPrompts[key];
    const baseEntry = input.draft.metadataGenerationBase?.[key] as
      | PaseoMetadataGenerationEntry
      | undefined;
    if (text.trim().length === 0) {
      if (baseEntry) {
        const nextEntry: Record<string, unknown> = { ...baseEntry };
        delete nextEntry.instructions;
        if (Object.keys(nextEntry).length === 0) {
          delete nextMetadataGeneration[key];
        } else {
          nextMetadataGeneration[key] = nextEntry;
        }
      } else {
        delete nextMetadataGeneration[key];
      }
    } else {
      nextMetadataGeneration[key] = { ...baseEntry, instructions: text };
    }
  }

  const result: Record<string, unknown> = { ...baseConfig };
  if (Object.keys(nextWorktree).length === 0) {
    delete result.worktree;
  } else {
    result.worktree = nextWorktree;
  }
  if (Object.keys(nextScripts).length === 0) {
    delete result.scripts;
  } else {
    result.scripts = nextScripts;
  }
  if (Object.keys(nextMetadataGeneration).length === 0) {
    delete result.metadataGeneration;
  } else {
    result.metadataGeneration = nextMetadataGeneration;
  }

  const nextProject: Record<string, unknown> = { ...input.draft.projectConfigBase };
  nextProject.directoryMode = input.draft.projectDirectoryMode;
  const nextDirectories: Record<string, unknown> = {
    ...(input.draft.projectConfigBase?.directories as Record<string, unknown> | undefined),
  };
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

  if (Object.keys(nextProject).length === 0) {
    delete result.project;
  } else {
    result.project = nextProject;
  }
  return result as PaseoConfigRaw;
}
