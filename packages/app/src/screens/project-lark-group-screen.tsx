import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type {
  PaseoConfigRaw,
  PaseoConfigRevision,
  PaseoProjectLarkGroup,
} from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useToast } from "@/contexts/toast-context";
import { useFetchQuery } from "@/data/query";
import { useProjects } from "@/hooks/use-projects";
import { ProjectLarkGroupEditor } from "@/projects/lark/project-lark-context-editor";
import {
  createProjectLarkGroupDraft,
  projectLarkGroupDraftError,
  projectLarkGroupDraftsToConfig,
  projectLarkGroupsToDraft,
  type ProjectLarkGroupDraft,
} from "@/projects/lark/project-lark-context-model";
import { resolveProjectSettingsTarget } from "@/projects/project-settings-target";
import { useHostFeature } from "@/runtime/host-features";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { confirmDialog } from "@/utils/confirm-dialog";
import { getProjectHostEntry, getProjectSummaryForHostProject } from "@/utils/projects";

const EMPTY_PROJECT_CONFIG: PaseoConfigRaw = {};

function updateLarkGroups(config: PaseoConfigRaw, groups: PaseoProjectLarkGroup[]): PaseoConfigRaw {
  const project = { ...config.project };
  if (groups.length > 0) {
    project.larkGroups = groups;
  } else {
    delete project.larkGroups;
  }
  return { ...config, project };
}

export default function ProjectLarkGroupScreen({
  serverId,
  projectId,
  groupId,
  onDone,
}: {
  serverId: string;
  projectId: string;
  groupId?: string;
  onDone: () => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const supportsProjectConfigById = useHostFeature(serverId, "projectConfigById");
  const supportsLarkUserOAuth = useHostFeature(serverId, "larkUserOAuth");
  const { projects } = useProjects();
  const project = useMemo(
    () => getProjectSummaryForHostProject(projects, serverId, projectId),
    [projectId, projects, serverId],
  );
  const selectedHost = getProjectHostEntry(project, serverId, projectId);
  const target = resolveProjectSettingsTarget(selectedHost);

  if (!client || !project || target.kind === "unavailable") {
    return (
      <Alert
        variant="error"
        title="无法配置飞书群"
        description="项目不存在、主机未连接，或当前主机没有可编辑的项目配置。"
      />
    );
  }
  if (target.kind !== "directory-backed" && !supportsProjectConfigById) {
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
    <ProjectLarkGroupEditorPage
      client={client}
      serverId={serverId}
      projectId={projectId}
      repoRoot={target.host.repoRoot}
      groupId={groupId}
      onDone={onDone}
    />
  );
}

function ProjectLarkGroupEditorPage({
  client,
  serverId,
  projectId,
  repoRoot,
  groupId,
  onDone,
}: {
  client: DaemonClient;
  serverId: string;
  projectId: string;
  repoRoot: string;
  groupId?: string;
  onDone: () => void;
}) {
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
    return (
      <Alert
        variant="error"
        title="项目配置不可用"
        description="无法读取项目配置，请返回后重试。"
      />
    );
  }

  const baseConfig = readQuery.data.config ?? EMPTY_PROJECT_CONFIG;
  const existing = groupId
    ? (baseConfig.project?.larkGroups ?? []).find((group) => group.id === groupId)
    : undefined;
  if (groupId && !existing) {
    return (
      <Alert
        variant="error"
        title="未找到飞书群配置"
        description="该飞书群配置可能已被删除，请返回项目设置后刷新。"
      />
    );
  }

  return (
    <LoadedProjectLarkGroupEditor
      key={`${projectId}:${groupId ?? "new"}:${readQuery.data.revision?.mtimeMs ?? "none"}:${readQuery.data.revision?.size ?? "none"}`}
      client={client}
      serverId={serverId}
      projectId={projectId}
      repoRoot={repoRoot}
      groupId={groupId}
      baseConfig={baseConfig}
      revision={readQuery.data.revision}
      initialGroup={existing}
      queryKey={queryKey}
      onDone={onDone}
    />
  );
}

function LoadedProjectLarkGroupEditor({
  client,
  serverId,
  projectId,
  repoRoot,
  groupId,
  baseConfig,
  revision,
  initialGroup,
  queryKey,
  onDone,
}: {
  client: DaemonClient;
  serverId: string;
  projectId: string;
  repoRoot: string;
  groupId?: string;
  baseConfig: PaseoConfigRaw;
  revision: PaseoConfigRevision | null;
  initialGroup?: PaseoProjectLarkGroup;
  queryKey: readonly [string, string, string];
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [group, setGroup] = useState<ProjectLarkGroupDraft>(() => {
    if (!initialGroup) return createProjectLarkGroupDraft();
    return projectLarkGroupsToDraft([initialGroup])[0]!;
  });
  const validationError = projectLarkGroupDraftError([group]);
  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextGroup = projectLarkGroupDraftsToConfig([group])[0];
      if (!nextGroup) {
        throw new Error(validationError ?? "飞书群配置无效。");
      }
      const current = baseConfig.project?.larkGroups ?? [];
      const nextGroups = groupId
        ? current.map((entry) => (entry.id === groupId ? nextGroup : entry))
        : [...current, nextGroup];
      return client.writeProjectConfig({
        repoRoot,
        projectId,
        expectedRevision: revision,
        config: updateLarkGroups(baseConfig, nextGroups),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.show(groupId ? "飞书群配置已更新" : "飞书群配置已创建", {
        variant: "success",
      });
      onDone();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => {
      const nextGroups = (baseConfig.project?.larkGroups ?? []).filter(
        (entry) => entry.id !== groupId,
      );
      return client.writeProjectConfig({
        repoRoot,
        projectId,
        expectedRevision: revision,
        config: updateLarkGroups(baseConfig, nextGroups),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      toast.show("飞书群配置已删除", { variant: "success" });
      onDone();
    },
  });
  const remove = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: "删除飞书群配置",
      message: "删除后，Paseo 将停止同步和注入该群消息。此操作无法撤销。",
      confirmLabel: "删除",
      cancelLabel: "取消",
      destructive: true,
    });
    if (confirmed) deleteMutation.mutate();
  }, [deleteMutation]);
  const save = useCallback(() => {
    saveMutation.mutate();
  }, [saveMutation]);
  const writeError =
    (saveMutation.data && !saveMutation.data.ok ? saveMutation.data.error : null) ??
    (deleteMutation.data && !deleteMutation.data.ok ? deleteMutation.data.error : null);
  const mutationError = saveMutation.error ?? deleteMutation.error;

  return (
    <View style={styles.body}>
      <Text style={styles.description}>
        搜索群聊和邀请机器人均使用已授权的飞书用户身份；机器人加入群后，Paseo
        才会同步最近群消息作为项目上下文。
      </Text>
      <ProjectLarkGroupEditor
        serverId={serverId}
        value={group}
        error={validationError}
        onChange={setGroup}
      />
      {writeError ? (
        <Alert
          variant="error"
          title="保存失败"
          description={
            writeError.code === "stale_project_config"
              ? "项目配置已被其他窗口修改，请返回后重新打开。"
              : "写入项目配置失败。"
          }
        />
      ) : null}
      {mutationError ? (
        <Text style={styles.error}>
          {mutationError instanceof Error ? mutationError.message : String(mutationError)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {groupId ? (
          <Button
            variant="destructive"
            onPress={remove}
            disabled={saveMutation.isPending || deleteMutation.isPending}
            loading={deleteMutation.isPending}
            testID="project-lark-group-delete"
          >
            删除
          </Button>
        ) : null}
        <Button
          onPress={save}
          disabled={Boolean(validationError) || saveMutation.isPending || deleteMutation.isPending}
          loading={saveMutation.isPending}
          testID="project-lark-group-save"
        >
          {groupId ? "保存修改" : "创建"}
        </Button>
      </View>
    </View>
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
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
    justifyContent: "flex-end",
  },
  spinnerColor: {
    color: theme.colors.foregroundMuted,
  },
}));
