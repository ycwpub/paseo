import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PaseoConfigRaw, PaseoConfigRevision } from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useProjects } from "@/hooks/use-projects";
import {
  projectLarkGroupDraftError,
  projectLarkGroupDraftsToConfig,
  projectLarkGroupsToDraft,
  type ProjectLarkGroupDraft,
} from "@/projects/lark/project-lark-context-model";
import { ProjectLarkContextEditor } from "@/projects/lark/project-lark-context-editor";
import { resolveProjectSettingsTarget } from "@/projects/project-settings-target";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { getProjectHostEntry, getProjectSummaryForHostProject } from "@/utils/projects";

const EMPTY_PROJECT_CONFIG: PaseoConfigRaw = {};

export default function ProjectLarkGroupsScreen({
  serverId,
  projectId,
}: {
  serverId: string;
  projectId: string;
}) {
  const client = useHostRuntimeClient(serverId);
  const supportsProjectConfigById = useHostFeature(serverId, "projectConfigById");
  const { projects } = useProjects();
  const project = useMemo(
    () => getProjectSummaryForHostProject(projects, serverId, projectId),
    [projectId, projects, serverId],
  );
  const selectedHost = getProjectHostEntry(project, serverId, projectId);
  const target = resolveProjectSettingsTarget(selectedHost);
  const supportsLarkUserOAuth = useHostFeature(serverId, "larkUserOAuth");
  if (!client || !project || target.kind === "unavailable") {
    return (
      <Alert
        variant="error"
        title="无法编辑飞书群上下文"
        description="项目不存在、主机未连接，或当前主机没有可编辑的项目配置。"
      />
    );
  }
  const canEdit = target.kind === "directory-backed" || supportsProjectConfigById;
  if (!canEdit) {
    return (
      <Alert
        variant="info"
        title="当前项目暂不支持"
        description="请升级主机后再配置飞书群上下文。"
      />
    );
  }
  if (!supportsLarkUserOAuth) {
    return (
      <Alert
        variant="info"
        title="当前主机版本不支持飞书用户授权"
        description="请升级主机后，再使用用户身份搜索群聊和邀请机器人入群。"
      />
    );
  }
  return (
    <ProjectLarkGroupsEditor
      client={client}
      serverId={serverId}
      projectId={projectId}
      repoRoot={target.host.repoRoot}
    />
  );
}

function ProjectLarkGroupsEditor({
  client,
  serverId,
  projectId,
  repoRoot,
}: {
  client: DaemonClient;
  serverId: string;
  projectId: string;
  repoRoot: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["project-config", serverId, projectId] as const,
    [projectId, serverId],
  );
  const readQuery = useFetchQuery({
    queryKey,
    retry: false,
    dataShape: "value",
    staleTimeMs: 0,
    queryFn: () => client.readProjectConfig(repoRoot, undefined, projectId),
  });
  const refetch = readQuery.refetch;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const reload = useCallback(() => {
    void readQuery.refetch();
  }, [readQuery]);
  const handleSaved = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);
    toast.show("飞书群上下文已保存", { variant: "success" });
  }, [queryClient, queryKey, toast]);

  if (readQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={styles.spinnerColor.color} />
      </View>
    );
  }
  if (readQuery.isError) {
    return (
      <Alert
        variant="error"
        title="读取项目配置失败"
        description={
          readQuery.error instanceof Error ? readQuery.error.message : String(readQuery.error)
        }
      >
        <Button size="sm" variant="outline" onPress={reload}>
          重新加载
        </Button>
      </Alert>
    );
  }
  if (!readQuery.data?.ok) {
    return <ProjectConfigError error={readQuery.data?.error ?? null} />;
  }
  return (
    <LoadedProjectLarkGroupsEditor
      key={`${projectId}:${readQuery.data.revision?.mtimeMs ?? "none"}:${readQuery.data.revision?.size ?? "none"}`}
      client={client}
      serverId={serverId}
      projectId={projectId}
      repoRoot={repoRoot}
      baseConfig={readQuery.data.config ?? EMPTY_PROJECT_CONFIG}
      revision={readQuery.data.revision}
      onSaved={handleSaved}
    />
  );
}

function LoadedProjectLarkGroupsEditor({
  client,
  serverId,
  projectId,
  repoRoot,
  baseConfig,
  revision,
  onSaved,
}: {
  client: DaemonClient;
  serverId: string;
  projectId: string;
  repoRoot: string;
  baseConfig: PaseoConfigRaw;
  revision: PaseoConfigRevision | null;
  onSaved: () => Promise<void>;
}) {
  const [groups, setGroups] = useState<ProjectLarkGroupDraft[]>(() =>
    projectLarkGroupsToDraft(baseConfig.project?.larkGroups),
  );
  const error = projectLarkGroupDraftError(groups);
  const mutation = useMutation({
    mutationFn: () =>
      client.writeProjectConfig({
        repoRoot,
        projectId,
        expectedRevision: revision,
        config: {
          ...baseConfig,
          project: {
            ...baseConfig.project,
            larkGroups: projectLarkGroupDraftsToConfig(groups),
          },
        },
      }),
    onSuccess: async (result) => {
      if (!result.ok) return;
      await onSaved();
    },
  });
  const writeError = mutation.data && !mutation.data.ok ? mutation.data.error : null;
  const save = useCallback(() => {
    mutation.mutate();
  }, [mutation]);
  return (
    <View style={styles.body}>
      <Text style={styles.description}>
        搜索群聊和邀请机器人均使用已授权的飞书用户身份；机器人加入群后，Paseo
        才会同步最近群消息作为项目上下文。
      </Text>
      <ProjectLarkContextEditor
        serverId={serverId}
        value={groups}
        error={error}
        onChange={setGroups}
      />
      {writeError ? <ProjectConfigError error={writeError} /> : null}
      {mutation.error ? (
        <Text style={styles.error}>
          {mutation.error instanceof Error ? mutation.error.message : String(mutation.error)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          onPress={save}
          disabled={Boolean(error) || mutation.isPending}
          loading={mutation.isPending}
          testID="project-lark-context-save"
        >
          保存
        </Button>
      </View>
    </View>
  );
}

function projectConfigErrorMessage(
  error:
    | {
        code: "project_not_found" | "invalid_project_config" | "write_failed";
      }
    | {
        code: "stale_project_config";
        currentRevision: PaseoConfigRevision | null;
      }
    | null,
): string {
  switch (error?.code) {
    case "project_not_found":
      return "未找到项目配置。";
    case "invalid_project_config":
      return "项目配置格式无效，请先修复配置文件。";
    case "stale_project_config":
      return "项目配置已被其他窗口修改，请重新加载后再保存。";
    case "write_failed":
      return "写入项目配置失败。";
    default:
      return "无法读取或保存项目配置。";
  }
}

function ProjectConfigError({
  error,
}: {
  error:
    | {
        code: "project_not_found" | "invalid_project_config" | "write_failed";
      }
    | {
        code: "stale_project_config";
        currentRevision: PaseoConfigRevision | null;
      }
    | null;
}) {
  return (
    <Alert variant="error" title="项目配置不可用" description={projectConfigErrorMessage(error)} />
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[4],
    paddingBottom: theme.spacing[8],
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 180,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    alignItems: "flex-end",
  },
  spinnerColor: {
    color: theme.colors.foregroundMuted,
  },
}));
