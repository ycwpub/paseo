import { realpathSync } from "node:fs";
import { resolve, sep } from "path";
import type pino from "pino";
import type { SessionInboundMessage, SessionOutboundMessage } from "../../messages.js";
import type { PersistedProjectRecord, ProjectRegistry } from "../../workspace-registry.js";
import type { ProjectConfigRpcError } from "../../../utils/paseo-config-file.js";
import {
  readProjectConfigForProject,
  writeProjectConfigForProject,
} from "../../project/project-config-storage.js";
import {
  ensureManagedProjectStorageRoot,
  resolveProjectPath,
} from "../../project/project-storage-paths.js";

export interface ProjectConfigSessionHost {
  emit(msg: SessionOutboundMessage): void;
}

export interface ProjectConfigSessionOptions {
  host: ProjectConfigSessionHost;
  projectRegistry: Pick<ProjectRegistry, "get" | "list" | "update">;
  paseoHome: string;
  logger: pino.Logger;
}

/**
 * A client's read/write surface for a Project's paseo.json. New clients identify
 * the Project directly; legacy clients still resolve repoRoot against active
 * Project paths or project directories. Configuration always lives in the
 * host-managed Project path; legacy locations migrate on the next successful write.
 */
export class ProjectConfigSession {
  private readonly host: ProjectConfigSessionHost;
  private readonly projectRegistry: Pick<ProjectRegistry, "get" | "list" | "update">;
  private readonly paseoHome: string;
  private readonly logger: pino.Logger;

  constructor(options: ProjectConfigSessionOptions) {
    this.host = options.host;
    this.projectRegistry = options.projectRegistry;
    this.paseoHome = options.paseoHome;
    this.logger = options.logger;
  }

  async handleReadProjectConfigRequest(
    msg: Extract<SessionInboundMessage, { type: "read_project_config_request" }>,
  ): Promise<void> {
    const project = await this.resolveKnownProject(msg);
    if (!project) {
      this.emitProjectConfigReadFailure(msg, { code: "project_not_found" });
      return;
    }

    const repoRoot = this.resolveProjectPath(project);
    const result = readProjectConfigForProject({
      paseoHome: this.paseoHome,
      project,
    });
    if (!result.ok) {
      this.logger.warn(
        {
          projectId: project.projectId,
          repoRoot,
          requestId: msg.requestId,
          outcome: result.error.code,
        },
        "Failed to read project config",
      );
      this.emitProjectConfigReadFailure(msg, result.error, repoRoot);
      return;
    }

    if (result.config === null) {
      this.logger.debug(
        {
          projectId: project.projectId,
          repoRoot,
          requestId: msg.requestId,
          outcome: "missing_project_config",
        },
        "Project config missing",
      );
    }

    this.host.emit({
      type: "read_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: true,
        config: result.config,
        revision: result.revision,
      },
    });
  }

  async handleWriteProjectConfigRequest(
    msg: Extract<SessionInboundMessage, { type: "write_project_config_request" }>,
  ): Promise<void> {
    const project = await this.resolveKnownProject(msg);
    if (!project) {
      this.emitProjectConfigWriteFailure(msg, { code: "project_not_found" });
      return;
    }

    const repoRoot = this.resolveProjectPath(project);
    this.logger.debug(
      {
        projectId: project.projectId,
        repoRoot,
        requestId: msg.requestId,
        outcome: "write_attempt",
      },
      "Writing project config",
    );
    const result = writeProjectConfigForProject({
      paseoHome: this.paseoHome,
      project,
      config: msg.config,
      expectedRevision: msg.expectedRevision,
    });
    if (!result.ok) {
      this.logger.debug(
        {
          projectId: project.projectId,
          repoRoot,
          requestId: msg.requestId,
          outcome: result.error.code,
        },
        "Project config write did not complete",
      );
      this.emitProjectConfigWriteFailure(msg, result.error, repoRoot);
      return;
    }

    let responseRoot = repoRoot;
    const shouldRefreshProjectDescriptor =
      result.mode === "multiple" || result.projectRoot !== project.rootPath;
    if (shouldRefreshProjectDescriptor) {
      const updatedProject = await this.projectRegistry.update(project.projectId, (current) => ({
        ...current,
        rootPath: result.mode === "single" ? result.projectRoot : null,
        updatedAt: new Date().toISOString(),
      }));
      if (!updatedProject) {
        this.emitProjectConfigWriteFailure(msg, { code: "project_not_found" }, repoRoot);
        return;
      }
      responseRoot = this.resolveProjectPath(updatedProject);
    }

    this.logger.debug(
      {
        projectId: project.projectId,
        repoRoot: responseRoot,
        requestId: msg.requestId,
        outcome: "written",
      },
      "Project config written",
    );
    this.host.emit({
      type: "write_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot: responseRoot,
        ok: true,
        config: result.config,
        revision: result.revision,
      },
    });
  }

  private emitProjectConfigReadFailure(
    msg: Extract<SessionInboundMessage, { type: "read_project_config_request" }>,
    error: ProjectConfigRpcError,
    repoRoot = msg.repoRoot,
  ): void {
    this.host.emit({
      type: "read_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: false,
        error,
      },
    });
  }

  private resolveProjectPath(project: PersistedProjectRecord): string {
    ensureManagedProjectStorageRoot(this.paseoHome, project.projectId);
    return resolveProjectPath({ paseoHome: this.paseoHome, project });
  }

  private emitProjectConfigWriteFailure(
    msg: Extract<SessionInboundMessage, { type: "write_project_config_request" }>,
    error: ProjectConfigRpcError,
    repoRoot = msg.repoRoot,
  ): void {
    this.host.emit({
      type: "write_project_config_response",
      payload: {
        requestId: msg.requestId,
        repoRoot,
        ok: false,
        error,
      },
    });
  }

  private async resolveKnownProject(
    msg:
      | Extract<SessionInboundMessage, { type: "read_project_config_request" }>
      | Extract<SessionInboundMessage, { type: "write_project_config_request" }>,
  ): Promise<PersistedProjectRecord | null> {
    if (msg.projectId) {
      const project = await this.projectRegistry.get(msg.projectId);
      return project && project.archivedAt === null ? project : null;
    }

    const requestedRoot = canonicalizeConfigRoot(msg.repoRoot);
    const projects = await this.projectRegistry.list();
    for (const project of projects) {
      if (project.archivedAt !== null) {
        continue;
      }
      const projectPath = canonicalizeConfigRoot(
        resolveProjectPath({ paseoHome: this.paseoHome, project }),
      );
      const projectDirectory =
        project.rootPath === null ? null : canonicalizeConfigRoot(project.rootPath);
      if (requestedRoot === projectPath || requestedRoot === projectDirectory) {
        return project;
      }
    }
    return null;
  }
}

function canonicalizeConfigRoot(repoRoot: string): string {
  const resolved = resolve(repoRoot);
  try {
    return stripTrailingPathSeparators(realpathSync(resolved));
  } catch {
    return stripTrailingPathSeparators(resolved);
  }
}

function stripTrailingPathSeparators(path: string): string {
  let normalized = path;
  while (normalized.length > 1 && normalized.endsWith(sep)) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}
