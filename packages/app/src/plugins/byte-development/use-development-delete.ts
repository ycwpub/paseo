import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { getHostProjectId, type HostProjectListItem } from "@/projects/host-projects";
import {
  getCurrentProjectRemoveReadiness,
  removeProjectFromHosts,
} from "@/projects/project-remove";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import {
  countOtherDevelopmentFlowsForProject,
  deleteDevelopmentPluginProject,
  type DevelopmentDeleteMode,
} from "./development-delete-model";
import type { DevelopmentFlow } from "./flow-model";
import { developmentFlowsQueryKey, removeDevelopmentFlow } from "./use-development-flows";

export function useDevelopmentDelete({
  client,
  serverId,
  flows,
  projects,
  onDeleted,
  onError,
}: {
  client: DaemonClient | null;
  serverId: string;
  flows: readonly DevelopmentFlow[];
  projects: readonly HostProjectListItem[];
  onDeleted: () => void;
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DevelopmentFlow | null>(null);
  const deleteTargetProject = useMemo(() => {
    if (!deleteTarget?.projectId) return null;
    return (
      projects.find((project) => getHostProjectId(project, serverId) === deleteTarget.projectId) ??
      null
    );
  }, [deleteTarget, projects, serverId]);
  const deleteProjectReadiness = useMemo(
    () =>
      deleteTargetProject
        ? getCurrentProjectRemoveReadiness({ hosts: deleteTargetProject.hosts })
        : null,
    [deleteTargetProject],
  );
  const projectDeleteUnavailableReason = useMemo(() => {
    if (!deleteTarget?.projectId) return "该插件项目没有关联 Project。";
    if (!deleteTargetProject) return "当前 Host 未加载到关联 Project，暂时只能保留 Project。";
    if (deleteProjectReadiness?.kind === "needs_host_update") {
      return "关联 Project 所在 Host 不支持删除，请更新并重启 daemon。";
    }
    return null;
  }, [deleteProjectReadiness, deleteTarget, deleteTargetProject]);
  const otherFlowCount = useMemo(
    () =>
      deleteTarget
        ? countOtherDevelopmentFlowsForProject({
            flows,
            flowId: deleteTarget.id,
            projectId: deleteTarget.projectId,
          })
        : 0,
    [deleteTarget, flows],
  );

  const open = useCallback(
    (flow: DevelopmentFlow | null) => {
      if (!client || !flow) return;
      onError(null);
      setDeleteTarget(flow);
    },
    [client, onError],
  );
  const close = useCallback(() => {
    if (!deleting) setDeleteTarget(null);
  }, [deleting]);
  const confirm = useCallback(
    (mode: DevelopmentDeleteMode) => {
      if (!client || !deleteTarget || deleting) return;
      if (mode === "plugin_and_project" && deleteProjectReadiness?.kind !== "ready") {
        onError(projectDeleteUnavailableReason ?? "关联 Project 当前不可删除");
        return;
      }
      const target = deleteTarget;
      const readiness = deleteProjectReadiness;
      void (async () => {
        setDeleting(true);
        onError(null);
        try {
          const outcome = await deleteDevelopmentPluginProject({
            mode,
            deletePluginProject: async () => {
              const result = await client.deletePluginAppJob(target.id);
              if (result.error || !result.deleted) {
                throw new Error(result.error ?? "删除插件项目失败");
              }
            },
            onPluginProjectDeleted: () => {
              queryClient.setQueryData(
                developmentFlowsQueryKey(serverId),
                (current: DevelopmentFlow[] | undefined) =>
                  removeDevelopmentFlow(current, target.id),
              );
              setDeleteTarget(null);
              onDeleted();
            },
            deleteProject:
              readiness?.kind === "ready"
                ? async () => {
                    const projectOutcome = await removeProjectFromHosts({
                      targets: readiness.targets,
                      getClient: (targetServerId) =>
                        getHostRuntimeStore().getClient(targetServerId),
                    });
                    if (projectOutcome.kind === "host_disconnected") {
                      throw new Error("关联 Project 所在 Host 已断开连接");
                    }
                    if (projectOutcome.kind === "failed") {
                      throw new Error("关联 Project 删除失败");
                    }
                  }
                : undefined,
          });
          if (outcome.kind === "project_delete_failed") {
            onError(`插件项目已删除，但关联 Project 保留：${outcome.error}`);
          }
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
        } finally {
          setDeleting(false);
        }
      })();
    },
    [
      deleteProjectReadiness,
      deleteTarget,
      deleting,
      client,
      onDeleted,
      onError,
      projectDeleteUnavailableReason,
      queryClient,
      serverId,
    ],
  );

  return {
    deleteTarget,
    deleting,
    otherFlowCount,
    projectDeleteUnavailableReason,
    projectName: deleteTargetProject?.projectName ?? "关联 Project",
    open,
    close,
    confirm,
  };
}
