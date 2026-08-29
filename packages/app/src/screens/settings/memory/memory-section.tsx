import { useCallback } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { PaseoMemorySettings, PaseoMemoryUserOperation } from "@getpaseo/protocol/messages";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import { useMemory } from "@/hooks/use-memory";
import { useHostFeature } from "@/runtime/host-features";
import { confirmDialog } from "@/utils/confirm-dialog";
import { MemorySectionContent } from "./memory-section-content";

export function MemorySection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const supported = useHostFeature(serverId, "memory");
  const usersSupported = useHostFeature(serverId, "memoryUsers");
  const syncSupported = useHostFeature(serverId, "memorySync");
  const { memory, isLoading, error, updateMemory, clearMemory, isMutating, mutationError } =
    useMemory(serverId, { enabled: supported });

  const saveSettings = useCallback(
    async (settings: PaseoMemorySettings) => {
      await updateMemory({ settings });
    },
    [updateMemory],
  );
  const changeUser = useCallback(
    async (operation: PaseoMemoryUserOperation) => {
      if (operation.type === "delete") {
        const user = memory?.users?.find((candidate) => candidate.id === operation.id);
        const confirmed = await confirmDialog({
          title: t("memoryPolicies.users.deleteTitle", {
            name: user?.name ?? operation.id,
          }),
          message: t("memoryPolicies.users.deleteDescription"),
          confirmLabel: t("memoryPolicies.users.deleteConfirm"),
          destructive: true,
        });
        if (!confirmed) return;
      }
      await updateMemory({ userOperation: operation });
    },
    [memory?.users, t, updateMemory],
  );
  const clearAll = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: "清空全部 Paseo 记忆？",
      message: "The summary, details, usage records, and revision history will be deleted.",
      confirmLabel: "清空记忆",
      destructive: true,
    });
    if (confirmed) await clearMemory();
  }, [clearMemory]);
  const consolidate = useCallback(async () => {
    await updateMemory({ consolidate: true });
  }, [updateMemory]);
  if (!supported) {
    return (
      <SettingsSection title="记忆">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>
              Update the selected Paseo daemon to use long-term memory.
            </Text>
          </View>
        </View>
      </SettingsSection>
    );
  }
  if (isLoading || !memory) {
    return (
      <SettingsSection title="记忆">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>{error ? error.message : "Loading memory…"}</Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  const visibleError = mutationError?.message ?? error?.message ?? null;
  return (
    <MemorySectionContent
      serverId={serverId}
      memory={memory}
      isMutating={isMutating}
      visibleError={visibleError}
      usersSupported={usersSupported}
      syncSupported={syncSupported}
      onSaveSettings={saveSettings}
      onChangeUser={changeUser}
      onClearAll={clearAll}
      onConsolidate={consolidate}
    />
  );
}
