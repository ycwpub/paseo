import { resolve } from "node:path";
import type { Logger } from "pino";
import { PaseoConfigSchema } from "@getpaseo/protocol/paseo-config-schema";
import type { WorkflowVariableValues } from "@getpaseo/protocol/workflow/data-contract";
import { readPaseoConfigJson } from "../../utils/paseo-config-file.js";
import { isRealpathInsideRoot } from "../../utils/path.js";
import type { PersistedProjectRecord, ProjectRegistry } from "../workspace-registry.js";
import { hasProjectDirectory } from "../project/project-directory-backing.js";
import {
  readProjectConfigForProject,
  resolveProjectConfigDirectories,
} from "../project/project-config-storage.js";

export async function resolveWorkflowProjectVariables(input: {
  cwd: string;
  projectRegistry: Pick<ProjectRegistry, "list">;
  paseoHome?: string;
  logger?: Pick<Logger, "warn">;
}): Promise<WorkflowVariableValues> {
  const cwd = resolve(input.cwd);
  const projects = (await input.projectRegistry.list()).filter(
    (candidate) => !candidate.archivedAt,
  );
  let project: PersistedProjectRecord | undefined = projects
    .filter(hasProjectDirectory)
    .filter((candidate) => isRealpathInsideRoot(candidate.rootPath, cwd))
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];

  let projectConfig: ReturnType<typeof PaseoConfigSchema.parse> | null = null;
  if (input.paseoHome) {
    const candidates = projects.flatMap((candidate) => {
      const result = readProjectConfigForProject({
        paseoHome: input.paseoHome!,
        project: candidate,
      });
      if (!result.ok) {
        input.logger?.warn(
          { projectId: candidate.projectId, error: result.error.code },
          "Failed to inspect Workflow Project configuration",
        );
        return [];
      }
      const roots = resolveProjectConfigDirectories({
        project: candidate,
        config: result.config,
      });
      const matchingRoot = roots
        .filter((root) => isRealpathInsideRoot(root, cwd))
        .sort((left, right) => right.length - left.length)[0];
      return matchingRoot ? [{ project: candidate, config: result.config, matchingRoot }] : [];
    });
    const selected = candidates.sort(
      (left, right) => right.matchingRoot.length - left.matchingRoot.length,
    )[0];
    if (selected) {
      project = selected.project;
      projectConfig = selected.config === null ? null : PaseoConfigSchema.parse(selected.config);
    } else {
      project = undefined;
    }
  }
  const projectRoot = project?.rootPath ?? cwd;

  try {
    const rawConfig = projectConfig ?? readPaseoConfigJson(projectRoot);
    if (rawConfig === null) {
      return {};
    }
    return { ...PaseoConfigSchema.parse(rawConfig).project?.variables };
  } catch (error) {
    input.logger?.warn(
      { err: error, cwd, projectRoot },
      "Failed to load Workflow Agent project variables",
    );
    return {};
  }
}
