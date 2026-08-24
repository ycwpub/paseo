import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { memoryQueryKey } from "@/data/memory";
import { queryClient } from "@/data/query-client";
import { useAssistants } from "@/hooks/use-assistants";
import { useProjects } from "@/hooks/use-projects";
import {
  syncHostMemoryOneWay,
  syncHostMemoryTwoWay,
  type MemorySyncDirectionResult,
  type MemorySyncHost,
} from "@/memory/host-memory-sync";
import {
  getHostRuntimeStore,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import { useHostFeature, useHostFeatureMap } from "@/runtime/host-features";
import { settingsStyles } from "@/styles/settings";
import {
  buildMemorySyncSelectionOptions,
  memorySyncSelectionKey,
  type MemorySyncSelectionOption,
} from "./memory-sync-selection-options";

type SyncAction = "push" | "pull" | "both";

function resultText(
  result: MemorySyncDirectionResult,
  sourceLabel: string,
  targetLabel: string,
  t: TFunction,
): string {
  const added = Math.max(0, result.targetDetailCountAfter - result.targetDetailCountBefore);
  return t("memoryPolicies.sync.result", {
    source: sourceLabel,
    target: targetLabel,
    total: result.targetDetailCountAfter,
    added,
  });
}

export function MemoryHostSyncCard({
  serverId,
  memory,
  disabled,
}: {
  serverId: string;
  memory: PaseoMemoryState;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const hosts = useHosts();
  const { projects } = useProjects();
  const assistantsSupported = useHostFeature(serverId, "assistants");
  const { assistants } = useAssistants(serverId, { enabled: assistantsSupported });
  const hostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const featureMap = useHostFeatureMap(hostIds, "memorySync");
  const connectionStatuses = useHostRuntimeConnectionStatuses(hostIds);
  const candidates = useMemo(
    () =>
      hosts.filter((host) => host.serverId !== serverId && featureMap.get(host.serverId) === true),
    [featureMap, hosts, serverId],
  );
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const selectionOptions = useMemo(
    () => buildMemorySyncSelectionOptions({ serverId, memory, projects, assistants, t }),
    [assistants, memory, projects, serverId, t],
  );
  const [selectedScopeKey, setSelectedScopeKey] = useState("global:");
  const [action, setAction] = useState<SyncAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (selectedServerId && candidates.some((host) => host.serverId === selectedServerId)) return;
    setSelectedServerId(candidates[0]?.serverId ?? null);
  }, [candidates, selectedServerId]);
  useEffect(() => {
    if (selectionOptions.some((option) => memorySyncSelectionKey(option) === selectedScopeKey)) {
      return;
    }
    setSelectedScopeKey(selectionOptions[0] ? memorySyncSelectionKey(selectionOptions[0]) : "");
  }, [selectedScopeKey, selectionOptions]);

  const options = useMemo<SelectFieldOption<string>[]>(
    () =>
      candidates.map((host) => ({
        id: host.serverId,
        value: host.serverId,
        label: host.label,
        description:
          connectionStatuses.get(host.serverId) === "online"
            ? t("memoryPolicies.sync.online")
            : t("memoryPolicies.sync.offline"),
      })),
    [candidates, connectionStatuses, t],
  );
  const selectedHost = candidates.find((host) => host.serverId === selectedServerId) ?? null;
  const selectedScope =
    selectionOptions.find((option) => memorySyncSelectionKey(option) === selectedScopeKey) ??
    selectionOptions[0] ??
    null;
  const selectedDisplay = useMemo(
    () =>
      selectedHost
        ? {
            label: selectedHost.label,
            description:
              connectionStatuses.get(selectedHost.serverId) === "online"
                ? t("memoryPolicies.sync.online")
                : t("memoryPolicies.sync.offline"),
          }
        : null,
    [connectionStatuses, selectedHost, t],
  );
  const selectedOnline =
    selectedHost !== null && connectionStatuses.get(selectedHost.serverId) === "online";
  const scopeSelectOptions = useMemo<SelectFieldOption<MemorySyncSelectionOption>[]>(
    () =>
      selectionOptions.map((option) => ({
        id: memorySyncSelectionKey(option),
        value: option,
        label: option.label,
        description: option.description,
      })),
    [selectionOptions],
  );
  const selectedScopeDisplay = useMemo(
    () =>
      selectedScope ? { label: selectedScope.label, description: selectedScope.description } : null,
    [selectedScope],
  );
  const changeScope = useCallback((option: MemorySyncSelectionOption) => {
    setSelectedScopeKey(memorySyncSelectionKey(option));
    setResult(null);
    setError(null);
  }, []);

  const runSync = useCallback(
    async (nextAction: SyncAction) => {
      if (!selectedHost || !selectedScope) return;
      const runtime = getHostRuntimeStore();
      const currentProfile = hosts.find((host) => host.serverId === serverId);
      const currentClient = runtime.getClient(serverId);
      const selectedClient = runtime.getClient(selectedHost.serverId);
      if (!currentProfile || !currentClient || !selectedClient) {
        setError(t("memoryPolicies.sync.disconnected"));
        return;
      }
      const current: MemorySyncHost = {
        serverId,
        label: currentProfile.label,
        client: currentClient,
      };
      const other: MemorySyncHost = {
        serverId: selectedHost.serverId,
        label: selectedHost.label,
        client: selectedClient,
      };
      setAction(nextAction);
      setError(null);
      setResult(null);
      try {
        if (nextAction === "push") {
          const synced = await syncHostMemoryOneWay({
            source: current,
            target: other,
            selection: selectedScope.selection,
          });
          queryClient.setQueryData(memoryQueryKey(other.serverId), synced.targetMemory);
          setResult(resultText(synced, current.label, other.label, t));
        } else if (nextAction === "pull") {
          const synced = await syncHostMemoryOneWay({
            source: other,
            target: current,
            selection: selectedScope.selection,
          });
          queryClient.setQueryData(memoryQueryKey(current.serverId), synced.targetMemory);
          setResult(resultText(synced, other.label, current.label, t));
        } else {
          const synced = await syncHostMemoryTwoWay({
            first: current,
            second: other,
            selection: selectedScope.selection,
          });
          queryClient.setQueryData(
            memoryQueryKey(other.serverId),
            synced.firstToSecond.targetMemory,
          );
          queryClient.setQueryData(
            memoryQueryKey(current.serverId),
            synced.secondToFirst.targetMemory,
          );
          setResult(
            [
              resultText(synced.firstToSecond, current.label, other.label, t),
              resultText(synced.secondToFirst, other.label, current.label, t),
            ].join("\n"),
          );
        }
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : String(syncError));
      } finally {
        setAction(null);
      }
    },
    [hosts, selectedHost, selectedScope, serverId, t],
  );
  const pushMemory = useCallback(() => {
    void runSync("push");
  }, [runSync]);
  const pullMemory = useCallback(() => {
    void runSync("pull");
  }, [runSync]);
  const syncBothWays = useCallback(() => {
    void runSync("both");
  }, [runSync]);
  const fieldsDisabled = disabled || action !== null;
  const syncDisabled = fieldsDisabled || !selectedOnline || selectedScope === null;

  return (
    <View style={settingsStyles.card}>
      <View style={styles.content}>
        <Text style={settingsStyles.rowTitle}>{t("memoryPolicies.sync.title")}</Text>
        <Text style={settingsStyles.rowHint}>{t("memoryPolicies.sync.description")}</Text>
        <SelectField
          label={t("memoryPolicies.sync.targetHost")}
          value={selectedServerId}
          selectedDisplay={selectedDisplay}
          options={options}
          onChange={setSelectedServerId}
          placeholder={t("memoryPolicies.sync.selectHost")}
          emptyText={t("memoryPolicies.sync.noHosts")}
          disabled={fieldsDisabled}
        />
        <SelectField
          label={t("memoryPolicies.sync.scope")}
          value={selectedScope}
          selectedDisplay={selectedScopeDisplay}
          options={scopeSelectOptions}
          onChange={changeScope}
          getValueKey={memorySyncSelectionKey}
          searchable
          placeholder={t("memoryPolicies.sync.selectScope")}
          emptyText={t("memoryPolicies.sync.noScopes")}
          disabled={fieldsDisabled}
        />
        <View style={styles.actions}>
          <Button size="sm" variant="outline" disabled={syncDisabled} onPress={pushMemory}>
            {action === "push" ? t("memoryPolicies.sync.syncing") : t("memoryPolicies.sync.push")}
          </Button>
          <Button size="sm" variant="outline" disabled={syncDisabled} onPress={pullMemory}>
            {action === "pull" ? t("memoryPolicies.sync.syncing") : t("memoryPolicies.sync.pull")}
          </Button>
          <Button size="sm" disabled={syncDisabled} onPress={syncBothWays}>
            {action === "both" ? t("memoryPolicies.sync.syncing") : t("memoryPolicies.sync.twoWay")}
          </Button>
        </View>
        {error ? (
          <Alert title={t("memoryPolicies.sync.failed")} description={error} variant="error" />
        ) : null}
        {result ? <Alert title={t("memoryPolicies.sync.completed")} description={result} /> : null}
        <Text style={settingsStyles.rowHint}>{t("memoryPolicies.sync.scopeHint")}</Text>
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
}));
