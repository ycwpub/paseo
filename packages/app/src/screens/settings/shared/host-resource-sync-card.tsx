import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { queryClient } from "@/data/query-client";
import {
  syncHostResourcesOneWay,
  syncHostResourcesTwoWay,
  type HostResourceSyncKind,
  type KnowledgeSyncTarget,
  type LocalContentSyncPolicy,
  type ResourceSyncDirectionResult,
  type ResourceSyncHost,
} from "@/resource-sync/host-resource-sync";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import { useHostFeatureMap, type HostFeatureName } from "@/runtime/host-features";
import { settingsStyles } from "@/styles/settings";

type SyncAction = "push" | "pull" | "both";

const KIND_LABELS: Record<HostResourceSyncKind, string> = {
  skills: "技能",
  mcp: "MCP",
  plugins: "插件",
  assistants: "助手",
  knowledge: "知识",
};

function formatResult(
  result: ResourceSyncDirectionResult,
  sourceLabel: string,
  targetLabel: string,
): string {
  const summary = `${sourceLabel} → ${targetLabel}：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}`;
  const localSummary =
    result.localCreated +
      result.localUpdated +
      result.localSkipped +
      result.localConflicts +
      result.bytesTransferred >
    0
      ? `；本地内容新增 ${result.localCreated}，更新 ${result.localUpdated}，跳过 ${result.localSkipped}，冲突副本 ${result.localConflicts}`
      : "";
  const completed = `${summary}${localSummary}`;
  return result.failures.length > 0
    ? `${completed}，失败 ${result.failures.length}\n${result.failures.join("\n")}`
    : completed;
}

const MISSING_POLICY_OPTIONS: SelectFieldOption<LocalContentSyncPolicy["missing"]>[] = [
  {
    id: "skip",
    value: "skip",
    label: "不创建，跳过",
    description: "目标路径不存在时不写入内容，也不创建依赖该路径的新资源。",
  },
  {
    id: "create",
    value: "create",
    label: "创建并同步",
    description: "自动创建目标目录或文件，并同步来源主机的实际内容。",
  },
];

const EXISTING_POLICY_OPTIONS: SelectFieldOption<LocalContentSyncPolicy["existing"]>[] = [
  {
    id: "merge",
    value: "merge",
    label: "合并（推荐）",
    description: "保留目标独有内容；同名冲突文件另存为来源主机副本，避免数据丢失。",
  },
  {
    id: "overwrite",
    value: "overwrite",
    label: "覆盖同名内容",
    description: "用来源内容覆盖同名文件，但保留目标目录中仅目标端存在的内容。",
  },
  {
    id: "skip",
    value: "skip",
    label: "保留目标，跳过",
    description: "目标路径已存在时不修改其中任何内容。",
  },
];

export function HostResourceSyncCard({
  serverId,
  kind,
  requiredFeature,
  disabled = false,
  description,
  warning,
  resolveKnowledgeTarget,
}: {
  serverId: string;
  kind: HostResourceSyncKind;
  requiredFeature?: HostFeatureName;
  disabled?: boolean;
  description?: string;
  warning?: string;
  resolveKnowledgeTarget?: (targetServerId: string) => KnowledgeSyncTarget | null;
}) {
  const hosts = useHosts();
  const hostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const featureMap = useHostFeatureMap(hostIds, requiredFeature ?? "memorySync");
  const localResourceFeatureMap = useHostFeatureMap(hostIds, "localResourceSync");
  const connectionStatuses = useHostRuntimeConnectionStatuses(hostIds);
  const supportsLocalContentPolicy = kind === "knowledge" || kind === "plugins";
  const candidates = useMemo(
    () =>
      hosts.filter(
        (host) =>
          host.serverId !== serverId &&
          (!requiredFeature || featureMap.get(host.serverId) === true) &&
          (!supportsLocalContentPolicy || localResourceFeatureMap.get(host.serverId) === true) &&
          (kind !== "knowledge" ||
            !resolveKnowledgeTarget ||
            resolveKnowledgeTarget(host.serverId)),
      ),
    [
      featureMap,
      hosts,
      kind,
      localResourceFeatureMap,
      requiredFeature,
      resolveKnowledgeTarget,
      serverId,
      supportsLocalContentPolicy,
    ],
  );
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [action, setAction] = useState<SyncAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [missingPolicy, setMissingPolicy] = useState<LocalContentSyncPolicy["missing"]>("skip");
  const [existingPolicy, setExistingPolicy] = useState<LocalContentSyncPolicy["existing"]>("merge");
  const missingPolicyDisplay = useMemo(
    () => ({
      label: MISSING_POLICY_OPTIONS.find((option) => option.value === missingPolicy)?.label ?? "",
    }),
    [missingPolicy],
  );
  const existingPolicyDisplay = useMemo(
    () => ({
      label: EXISTING_POLICY_OPTIONS.find((option) => option.value === existingPolicy)?.label ?? "",
    }),
    [existingPolicy],
  );

  useEffect(() => {
    if (selectedServerId && candidates.some((host) => host.serverId === selectedServerId)) return;
    setSelectedServerId(candidates[0]?.serverId ?? null);
  }, [candidates, selectedServerId]);

  const selectedHost = candidates.find((host) => host.serverId === selectedServerId) ?? null;
  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      candidates.map((host) => ({
        id: host.serverId,
        value: host.serverId,
        label: host.label,
        description: connectionStatuses.get(host.serverId) === "online" ? "主机在线" : "主机离线",
      })),
    [candidates, connectionStatuses],
  );
  const selectedDisplay = useMemo(
    () =>
      selectedHost
        ? {
            label: selectedHost.label,
            description:
              connectionStatuses.get(selectedHost.serverId) === "online" ? "主机在线" : "主机离线",
          }
        : null,
    [connectionStatuses, selectedHost],
  );
  const selectedOnline =
    selectedHost !== null && connectionStatuses.get(selectedHost.serverId) === "online";
  const currentSupportsLocalContent =
    !supportsLocalContentPolicy || localResourceFeatureMap.get(serverId) === true;

  const runSync = useCallback(
    async (nextAction: SyncAction) => {
      if (!selectedHost) return;
      const runtime = getHostRuntimeStore();
      const currentProfile = hosts.find((host) => host.serverId === serverId);
      const currentClient = runtime.getClient(serverId);
      const selectedClient = runtime.getClient(selectedHost.serverId);
      if (!currentProfile || !currentClient || !selectedClient) {
        setError("主机连接不可用，请重新连接后再试。");
        return;
      }
      const buildHost = (
        profile: { serverId: string; label: string },
        client: NonNullable<typeof currentClient>,
      ): ResourceSyncHost => {
        const knowledgeTarget =
          kind === "knowledge" ? resolveKnowledgeTarget?.(profile.serverId) : undefined;
        return {
          serverId: profile.serverId,
          label: profile.label,
          client,
          ...(knowledgeTarget ? { knowledgeTarget } : {}),
        };
      };
      const current = buildHost(currentProfile, currentClient);
      const other = buildHost(selectedHost, selectedClient);
      if (kind === "knowledge" && (!current.knowledgeTarget || !other.knowledgeTarget)) {
        setError("目标主机没有可同步的对应知识范围。");
        return;
      }
      setAction(nextAction);
      setError(null);
      setResult(null);
      try {
        if (nextAction === "push") {
          const synced = await syncHostResourcesOneWay({
            source: current,
            target: other,
            kind,
            localContentPolicy: { missing: missingPolicy, existing: existingPolicy },
          });
          setResult(formatResult(synced, current.label, other.label));
        } else if (nextAction === "pull") {
          const synced = await syncHostResourcesOneWay({
            source: other,
            target: current,
            kind,
            localContentPolicy: { missing: missingPolicy, existing: existingPolicy },
          });
          setResult(formatResult(synced, other.label, current.label));
        } else {
          const synced = await syncHostResourcesTwoWay({
            first: current,
            second: other,
            kind,
            localContentPolicy: { missing: missingPolicy, existing: existingPolicy },
          });
          setResult(
            [
              formatResult(synced.firstToSecond, current.label, other.label),
              formatResult(synced.secondToFirst, other.label, current.label),
            ].join("\n"),
          );
        }
        void queryClient.invalidateQueries();
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : String(syncError));
      } finally {
        setAction(null);
      }
    },
    [existingPolicy, hosts, kind, missingPolicy, resolveKnowledgeTarget, selectedHost, serverId],
  );

  const fieldsDisabled = disabled || action !== null;
  const syncDisabled = fieldsDisabled || !selectedOnline || !currentSupportsLocalContent;
  const push = useCallback(() => void runSync("push"), [runSync]);
  const pull = useCallback(() => void runSync("pull"), [runSync]);
  const both = useCallback(() => void runSync("both"), [runSync]);

  return (
    <View style={settingsStyles.card} testID={`host-resource-sync-${kind}`}>
      <View style={styles.content}>
        <Text style={settingsStyles.rowTitle}>{KIND_LABELS[kind]}多主机同步</Text>
        <Text style={settingsStyles.rowHint}>
          {description ??
            `在当前主机与另一台主机之间共享${KIND_LABELS[kind]}。同步只新增或更新，不会删除目标主机已有内容。`}
        </Text>
        <SelectField
          label="目标主机"
          value={selectedServerId}
          selectedDisplay={selectedDisplay}
          options={options}
          onChange={setSelectedServerId}
          placeholder="选择要同步的主机"
          emptyText="暂无支持该功能的其他主机"
          disabled={fieldsDisabled}
        />
        {supportsLocalContentPolicy ? (
          <View style={styles.policyFields}>
            <SelectField
              label="目标路径不存在时"
              value={missingPolicy}
              selectedDisplay={missingPolicyDisplay}
              options={MISSING_POLICY_OPTIONS}
              onChange={setMissingPolicy}
              placeholder="选择目标路径缺失时的处理方式"
              emptyText="暂无可用策略"
              disabled={fieldsDisabled}
              testID={`host-resource-sync-${kind}-missing-policy`}
            />
            <SelectField
              label="目标路径已存在时"
              value={existingPolicy}
              selectedDisplay={existingPolicyDisplay}
              options={EXISTING_POLICY_OPTIONS}
              onChange={setExistingPolicy}
              placeholder="选择目标路径已存在时的处理方式"
              emptyText="暂无可用策略"
              disabled={fieldsDisabled}
              testID={`host-resource-sync-${kind}-existing-policy`}
            />
          </View>
        ) : null}
        {!currentSupportsLocalContent ? (
          <Alert
            variant="warning"
            title="当前主机不支持本地内容同步"
            description="请更新当前主机的 Paseo 服务后再同步知识或本地插件。"
          />
        ) : null}
        <View style={styles.actions}>
          <Button size="sm" variant="outline" disabled={syncDisabled} onPress={push}>
            {action === "push" ? "正在同步…" : "推送到目标"}
          </Button>
          <Button size="sm" variant="outline" disabled={syncDisabled} onPress={pull}>
            {action === "pull" ? "正在同步…" : "从目标拉取"}
          </Button>
          <Button size="sm" disabled={syncDisabled} onPress={both}>
            {action === "both" ? "正在同步…" : "双向同步"}
          </Button>
        </View>
        {warning ? <Alert variant="warning" title="同步说明" description={warning} /> : null}
        {error ? <Alert variant="error" title="同步失败" description={error} /> : null}
        {result ? <Alert title="同步完成" description={result} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  policyFields: {
    gap: theme.spacing[3],
  },
}));
