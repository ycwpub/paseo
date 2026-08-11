import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Link } from "lucide-react-native";
import type { HostProfile } from "@/types/host-connection";
import { useHosts, useHostMutations } from "@/runtime/host-runtime";
import { decodeOfferFragmentPayload, normalizeHostPort } from "@/utils/daemon-endpoints";
import {
  connectToDaemon,
  DaemonConnectionApprovalRequiredError,
  waitForDaemonApproval,
} from "@/utils/test-daemon-connection";
import {
  ConnectionOfferSchema,
  getConnectionOfferRelays,
} from "@getpaseo/protocol/connection-offer";
import { AdaptiveModalSheet, AdaptiveTextInput, type SheetHeader } from "./adaptive-modal-sheet";
import { Button } from "@/components/ui/button";

const FLEX_ONE_STYLE = { flex: 1 } as const;

const styles = StyleSheet.create((theme) => ({
  helper: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foreground,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  approval: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[3],
    marginTop: theme.spacing[2],
  },
}));

export interface PairLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onCancel?: () => void;
  onSaved?: (result: {
    profile: HostProfile;
    serverId: string;
    hostname: string | null;
    isNewHost: boolean;
  }) => void;
}

export function PairLinkModal({ visible, onClose, onCancel, onSaved }: PairLinkModalProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const daemons = useHosts();
  const { upsertConnectionFromOfferUrl: upsertDaemonFromOfferUrl } = useHostMutations();
  const isMobile = useIsCompactFormFactor();

  const offerUrlRef = useRef("");
  const inputRef = useRef<TextInput>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAwaitingApproval, setIsAwaitingApproval] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const pendingClientRef = useRef<DaemonConnectionApprovalRequiredError["client"] | null>(null);
  const pairingAbortRef = useRef<AbortController | null>(null);

  const clearInput = useCallback(() => {
    offerUrlRef.current = "";
    inputRef.current?.clear();
  }, []);

  const pairIcon = useMemo(
    () => <Link size={16} color={theme.colors.accentForeground} />,
    [theme.colors.accentForeground],
  );

  const resetAndClose = useCallback(() => {
    pairingAbortRef.current?.abort();
    pairingAbortRef.current = null;
    const pendingClient = pendingClientRef.current;
    pendingClientRef.current = null;
    if (pendingClient) {
      void pendingClient.close().catch(() => undefined);
    }
    clearInput();
    setErrorMessage("");
    setIsAwaitingApproval(false);
    setIsSaving(false);
    onClose();
  }, [clearInput, onClose]);

  const handleClose = useCallback(() => {
    if (isSaving && !isAwaitingApproval) return;
    resetAndClose();
  }, [isAwaitingApproval, isSaving, resetAndClose]);

  const handleCancel = useCallback(() => {
    if (isSaving && !isAwaitingApproval) return;
    pairingAbortRef.current?.abort();
    pairingAbortRef.current = null;
    const pendingClient = pendingClientRef.current;
    pendingClientRef.current = null;
    if (pendingClient) {
      void pendingClient.close().catch(() => undefined);
    }
    clearInput();
    setErrorMessage("");
    setIsAwaitingApproval(false);
    setIsSaving(false);
    (onCancel ?? onClose)();
  }, [clearInput, isAwaitingApproval, isSaving, onCancel, onClose]);

  // oxlint-disable-next-line complexity
  const handleSave = useCallback(async () => {
    if (isSaving) return;
    const raw = offerUrlRef.current.trim();
    if (!raw) {
      setErrorMessage(t("pairing.link.errors.required"));
      return;
    }
    if (!raw.includes("#offer=")) {
      setErrorMessage(t("pairing.link.errors.missingOffer"));
      return;
    }

    const parsedOffer = (() => {
      try {
        const idx = raw.indexOf("#offer=");
        const encoded = raw.slice(idx + "#offer=".length).trim();
        if (!encoded) {
          throw new Error(t("pairing.link.errors.emptyOffer"));
        }
        const payload = decodeOfferFragmentPayload(encoded);
        return ConnectionOfferSchema.parse(payload);
      } catch (error) {
        const message = error instanceof Error ? error.message : t("pairing.link.errors.invalid");
        setErrorMessage(message);
        if (!isMobile) {
          Alert.alert(t("pairing.link.alert.failedTitle"), message);
        }
        return null;
      }
    })();

    if (!parsedOffer) {
      return;
    }

    const pairingAbort = new AbortController();
    try {
      setIsSaving(true);
      setIsAwaitingApproval(false);
      setErrorMessage("");
      pairingAbortRef.current = pairingAbort;

      let connected: Awaited<ReturnType<typeof connectToDaemon>> | null = null;
      let approvalRequired: DaemonConnectionApprovalRequiredError | null = null;
      let lastError: unknown = null;
      for (const relay of getConnectionOfferRelays(parsedOffer)) {
        try {
          connected = await connectToDaemon(
            {
              id: "probe",
              type: "relay",
              relayEndpoint: normalizeHostPort(relay.endpoint),
              useTls: relay.useTls,
              daemonPublicKeyB64: parsedOffer.daemonPublicKeyB64,
            },
            { serverId: parsedOffer.serverId },
          );
          break;
        } catch (error) {
          if (error instanceof DaemonConnectionApprovalRequiredError) {
            approvalRequired = error;
            break;
          }
          lastError = error;
        }
      }
      if (!connected && approvalRequired) {
        pendingClientRef.current = approvalRequired.client;
        setIsAwaitingApproval(true);
        const serverInfo = await waitForDaemonApproval(
          approvalRequired.client,
          pairingAbort.signal,
        );
        pendingClientRef.current = null;
        await approvalRequired.client.close().catch(() => undefined);
        const isNewHost = !daemons.some((daemon) => daemon.serverId === parsedOffer.serverId);
        const profile = await upsertDaemonFromOfferUrl(raw, serverInfo.hostname ?? undefined);
        resetAndClose();
        onSaved?.({
          profile,
          serverId: parsedOffer.serverId,
          hostname: serverInfo.hostname,
          isNewHost,
        });
        return;
      }
      if (!connected) throw lastError ?? new Error("No relay endpoint is available");
      const { client, hostname } = connected;
      await client.close().catch(() => undefined);

      const isNewHost = !daemons.some((daemon) => daemon.serverId === parsedOffer.serverId);
      const profile = await upsertDaemonFromOfferUrl(raw, hostname ?? undefined);
      resetAndClose();
      onSaved?.({ profile, serverId: parsedOffer.serverId, hostname, isNewHost });
    } catch (error) {
      if (pairingAbort.signal.aborted) {
        return;
      }
      const message =
        error instanceof Error ? error.message : t("pairing.link.errors.unableToPair");
      setErrorMessage(message);
      if (!isMobile) {
        Alert.alert(t("pairing.link.alert.failedTitle"), message);
      }
    } finally {
      if (pairingAbortRef.current === pairingAbort) {
        pairingAbortRef.current = null;
      }
      const pendingClient = pendingClientRef.current;
      pendingClientRef.current = null;
      if (pendingClient) {
        await pendingClient.close().catch(() => undefined);
      }
      setIsAwaitingApproval(false);
      setIsSaving(false);
    }
  }, [daemons, isMobile, isSaving, onSaved, resetAndClose, t, upsertDaemonFromOfferUrl]);

  const handleChangeOfferUrl = useCallback((next: string) => {
    offerUrlRef.current = next;
  }, []);

  const handleSavePress = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const header = useMemo<SheetHeader>(() => ({ title: t("pairing.link.title") }), [t]);
  let submitLabel = t("pairing.link.actions.pair");
  if (isAwaitingApproval) {
    submitLabel = t("pairing.link.actions.awaitingApproval");
  } else if (isSaving) {
    submitLabel = t("pairing.link.actions.pairing");
  }

  return (
    <AdaptiveModalSheet
      header={header}
      visible={visible}
      onClose={handleClose}
      testID="pair-link-modal"
    >
      <View style={styles.field}>
        <Text style={styles.label}>{t("pairing.link.label")}</Text>
        <Text style={styles.helper}>{t("pairing.link.helper")}</Text>
        <AdaptiveTextInput
          ref={inputRef}
          testID="pair-link-input"
          nativeID="pair-link-input"
          accessibilityLabel={t("pairing.link.label")}
          onChangeText={handleChangeOfferUrl}
          placeholder="https://app.paseo.sh/#offer=..."
          placeholderTextColor={theme.colors.foregroundMuted}
          style={styles.input}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {isAwaitingApproval ? (
          <Text style={styles.approval}>{t("pairing.link.awaitingApproval")}</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          style={FLEX_ONE_STYLE}
          variant="secondary"
          onPress={handleCancel}
          disabled={isSaving && !isAwaitingApproval}
          testID="pair-link-cancel"
          accessibilityRole="button"
          accessibilityLabel={t("pairing.link.actions.cancel")}
        >
          {t("pairing.link.actions.cancel")}
        </Button>
        <Button
          style={FLEX_ONE_STYLE}
          variant="default"
          onPress={handleSavePress}
          disabled={isSaving}
          testID="pair-link-submit"
          accessibilityRole="button"
          accessibilityLabel={t("pairing.link.actions.pair")}
          leftIcon={pairIcon}
        >
          {submitLabel}
        </Button>
      </View>
    </AdaptiveModalSheet>
  );
}
