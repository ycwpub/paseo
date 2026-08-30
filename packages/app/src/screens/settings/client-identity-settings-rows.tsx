import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { Pencil } from "lucide-react-native";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { getOrCreateClientId } from "@/utils/client-id";
import { initializeClientHostname, saveClientHostname } from "@/utils/client-hostname";
import { resolveClientHostname } from "@/utils/client-name";

export function ClientIdentitySettingsRows() {
  const { t } = useTranslation();
  const [clientHostname, setClientHostname] = useState(resolveClientHostname() ?? "");
  const [clientId, setClientId] = useState<string | null>(null);
  const [isEditingClientHostname, setIsEditingClientHostname] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([initializeClientHostname(), getOrCreateClientId()])
      .then(([, resolvedClientId]) => {
        if (cancelled) return undefined;
        setClientHostname(resolveClientHostname() ?? "");
        setClientId(resolvedClientId);
        return undefined;
      })
      .catch((error) => {
        console.warn("[ClientIdentity] Failed to load client identity", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClientHostnameSubmit = useCallback(async (value: string) => {
    const savedHostname = await saveClientHostname(value);
    setClientHostname(savedHostname);
    getHostRuntimeStore().ensureConnectedAll();
  }, []);

  const openClientHostnameEditor = useCallback(() => {
    setIsEditingClientHostname(true);
  }, []);
  const closeClientHostnameEditor = useCallback(() => {
    setIsEditingClientHostname(false);
  }, []);

  return (
    <>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>
            {t("settings.general.clientIdentity.hostname")}
          </Text>
          <Text style={settingsStyles.rowHint}>
            {t("settings.general.clientIdentity.hostnameDescription")}
          </Text>
        </View>
        <Pressable
          onPress={openClientHostnameEditor}
          hitSlop={8}
          style={styles.clientHostnameButton}
          accessibilityRole="button"
          accessibilityLabel={t("settings.general.clientIdentity.editHostname")}
          testID="general-client-hostname-edit"
        >
          <Text style={styles.clientHostnameValue} numberOfLines={2}>
            {clientHostname || t("settings.general.clientIdentity.unavailable")}
          </Text>
          <Pencil size={14} color={styles.iconColor.color} />
        </Pressable>
      </View>
      <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>
            {t("settings.general.clientIdentity.identityId")}
          </Text>
          <Text style={settingsStyles.rowHint}>
            {t("settings.general.clientIdentity.identityIdDescription")}
          </Text>
        </View>
        <Text style={styles.clientIdentityId} selectable>
          {clientId ?? t("settings.loading")}
        </Text>
      </View>
      <AdaptiveRenameModal
        visible={isEditingClientHostname}
        title={t("settings.general.clientIdentity.editHostnameTitle")}
        initialValue={clientHostname}
        placeholder={t("settings.general.clientIdentity.hostnamePlaceholder")}
        submitLabel={t("common.actions.save")}
        onClose={closeClientHostnameEditor}
        onSubmit={handleClientHostnameSubmit}
        maxLength={255}
        testID="general-client-hostname-modal"
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  clientHostnameButton: {
    maxWidth: "55%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  clientHostnameValue: {
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  clientIdentityId: {
    maxWidth: "55%",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
    textAlign: "right",
  },
}));
