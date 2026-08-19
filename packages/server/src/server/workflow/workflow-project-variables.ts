import { resolve } from "node:path";
import type { Logger } from "pino";
import { PaseoConfigSchema } from "@getpaseo/protocol/paseo-config-schema";
import type { WorkflowVariableValues } from "@getpaseo/protocol/workflow/data-contract";
import { readPaseoConfigJson } from "../../utils/paseo-config-file.js";
import { isRealpathInsideRoot } from "../../utils/path.js";
import type { ProjectRegistry } from "../workspace-registry.js";
import { hasProjectDirectory } from "../project/project-directory-backing.js";

export async function resolveWorkflowProjectVariables(input: {
  cwd: string;
  projectRegistry: Pick<ProjectRegistry, "list">;
  logger?: Pick<Logger, "warn">;
}): Promise<WorkflowVariableValues> {
  const cwd = resolve(input.cwd);
  const project = (await input.projectRegistry.list())
    .filter(hasProjectDirectory)
    .filter((candidate) => !candidate.archivedAt && isRealpathInsideRoot(candidate.rootPath, cwd))
    .sort((left, right) => right.rootPath.length - left.rootPath.length)[0];
  const projectRoot = project?.rootPath ?? cwd;

  try {
    const json = readPaseoConfigJson(projectRoot);
    if (json === null) {
      return {};
    }
    return { ...PaseoConfigSchema.parse(json).project?.variables };
  } catch (error) {
    input.logger?.warn(
      { err: error, cwd, projectRoot },
      "Failed to load Workflow Agent project variables",
    );
    return {};
  }
}
