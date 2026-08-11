import {
  resolvePaseoProjectDirectoryValues,
  type PaseoProjectConfig,
  type PaseoProjectDirectoryKey,
} from "@getpaseo/protocol/paseo-config-schema";
import { isAbsolutePath } from "./path";

export const PROJECT_RESOURCE_DIRECTORY_KEYS = [
  "project",
  "knowledge",
  "indexSkill",
  "workspaceData",
] as const satisfies readonly PaseoProjectDirectoryKey[];

export interface ProjectResourceDirectoryContext {
  projectId: string;
  projectName: string;
  projectRoot: string;
  workspaceId: string;
  workspaceName: string;
  workspaceDirectory: string;
}

export type ResolvedProjectResourceDirectories = Record<PaseoProjectDirectoryKey, string[]>;

const AI_KNOWLEDGE_DIRECTORY_NAMES = [".agents", ".agent", ".claude", ".codex", ".trae"] as const;

export function formatProjectResourceDirectoryPath(value: string): string {
  return value.replace(/([\\/])/gu, "$1\u200B");
}

function replaceVariables(value: string, variables: Readonly<Record<string, string>>): string {
  return value.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/gu, (match, name: string) => {
    return variables[name] ?? match;
  });
}

function normalizeHostPath(value: string): string {
  const slashPath = value.replace(/\\/gu, "/");
  const driveMatch = /^([A-Za-z]:)(\/.*)?$/u.exec(slashPath);
  let prefix = "/";
  if (driveMatch) {
    prefix = `${driveMatch[1]}/`;
  } else if (slashPath.startsWith("//")) {
    prefix = "//";
  }
  const body = driveMatch
    ? (driveMatch[2] ?? "").replace(/^\/+/u, "")
    : slashPath.replace(/^\/+/u, "");
  const segments: string[] = [];
  for (const segment of body.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `${prefix}${segments.join("/")}`.replace(/\/$/u, "") || prefix;
}

function resolveHostPath(projectRoot: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "~" || trimmed.startsWith("~/")) {
    return trimmed.replace(/\\/gu, "/").replace(/\/+$/u, "");
  }
  if (isAbsolutePath(trimmed)) return normalizeHostPath(trimmed);
  return normalizeHostPath(`${projectRoot.replace(/[\\/]+$/u, "")}/${trimmed}`);
}

export function resolveProjectResourceDirectories(input: {
  projectConfig: PaseoProjectConfig | null | undefined;
  context: ProjectResourceDirectoryContext;
}): ResolvedProjectResourceDirectories {
  const configured = resolvePaseoProjectDirectoryValues(input.projectConfig?.directories);
  const variables = {
    ...input.projectConfig?.variables,
    ...input.context,
  };
  const resolveList = (values: readonly string[]) =>
    Array.from(
      new Set(
        values.flatMap((entry) => {
          const path = resolveHostPath(
            input.context.projectRoot,
            replaceVariables(entry, variables),
          );
          return path ? [path] : [];
        }),
      ),
    );
  const project = resolveList(configured.project);
  const configuredKnowledge = resolveList(configured.knowledge);
  const automaticKnowledge =
    (input.projectConfig?.directoryMode ?? "single") === "single" && project[0]
      ? AI_KNOWLEDGE_DIRECTORY_NAMES.map((name) =>
          normalizeHostPath(`${project[0]!.replace(/[\\/]+$/u, "")}/${name}`),
        )
      : [];
  const workspaceData = Array.from(
    new Set(
      configured.workspaceData.flatMap((entry) => {
        const root = resolveHostPath(input.context.projectRoot, replaceVariables(entry, variables));
        if (!root) return [];
        return [
          entry.includes("{{workspaceId}}")
            ? root
            : normalizeHostPath(`${root}/${input.context.workspaceId}`),
        ];
      }),
    ),
  );
  return {
    project: project.length > 0 ? project : [normalizeHostPath(input.context.workspaceDirectory)],
    knowledge: Array.from(new Set([...configuredKnowledge, ...automaticKnowledge])),
    indexSkill: resolveList(configured.indexSkill),
    workspaceData,
  };
}
