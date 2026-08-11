import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult, BarcodeSettings } from "expo-camera";
import { useHostMutations } from "@/runtime/host-runtime";
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
import { buildHostRootRoute, buildSettingsHostRoute } from "@/utils/host-routes";
import { isWeb } from "@/constants/platform";
import { BackHeader } from "@/components/headers/back-header";

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  body: {
    flex: 1,
    paddingHorizontal: theme.spacing[6],
  },
  cameraWrap: {
    flex: 1,
    overflow: "hidden",
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 260,
    height: 260,
  },
  corner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: theme.colors.accent,
  },
  cornerTL: {
    left: 0,
    top: 0,
    borderLeftWidth: 4,
    borderTopWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    right: 0,
    top: 0,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 4,
    borderBottomWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    right: 0,
    bottom: 0,
    borderRightWidth: 4,
    borderBottomWidth: 4,
    borderBottomRightRadius: 12,
  },
  helperText: {
    marginTop: theme.spacing[6],
    color: theme.colors.foregroundMuted,
    textAlign: "center",
    fontSize: theme.fontSize.base,
  },
  permissionCard: {
    marginTop: theme.spacing[6],
    padding: theme.spacing[6],
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    gap: theme.spacing[4],
  },
  permissionTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.semibold,
  },
  permissionBody: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  permissionButton: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.palette.blue[500],
  },
  permissionButtonText: {
    color: theme.colors.palette.white,
    fontWeight: theme.fontWeight.semibold,
  },
  approvalStatus: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
}));

function extractOfferUrlFromScan(result: BarcodeScanningResult): string | null {
  const raw = typeof result.data === "string" ? result.data.trim() : "";
  if (!raw) return null;

  if (raw.includes("#offer=")) return raw;

  return null;
}

export default function PairScanScreen() {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: string;
  }>();
  const source = typeof params.source === "string" ? params.source : "settings";
  const { upsertConnectionFromOfferUrl: upsertDaemonFromOfferUrl } = useHostMutations();

  const [permission, requestPermission] = useCameraPermissions();
  const [pairingPhase, setPairingPhase] = useState<"idle" | "connecting" | "awaiting_approval">(
    "idle",
  );
  const lastScannedRef = useRef<string | null>(null);
  const pendingClientRef = useRef<DaemonConnectionApprovalRequiredError["client"] | null>(null);
  const pairingAbortRef = useRef<AbortController | null>(null);
  const isPairing = pairingPhase !== "idle";

  const navigateToPairedHost = useCallback(
    (serverId: string) => {
      if (source === "onboarding") {
        router.replace(buildHostRootRoute(serverId));
        return;
      }
      router.replace(buildSettingsHostRoute(serverId));
    },
    [router, source],
  );

  const closeToSource = useCallback(() => {
    pairingAbortRef.current?.abort();
    pairingAbortRef.current = null;
    const pendingClient = pendingClientRef.current;
    pendingClientRef.current = null;
    if (pendingClient) {
      void pendingClient.close().catch(() => undefined);
    }
    try {
      router.back();
    } catch {
      router.replace("/" as Href);
    }
  }, [router]);

  useEffect(
    () => () => {
      pairingAbortRef.current?.abort();
      const pendingClient = pendingClientRef.current;
      pendingClientRef.current = null;
      if (pendingClient) {
        void pendingClient.close().catch(() => undefined);
      }
    },
    [],
  );

  useEffect(() => {
    if (isWeb) return;
    if (permission && permission.granted) return;
    void requestPermission().catch(() => undefined);
  }, [permission, requestPermission]);

  const handleScan = useCallback(
    async (result: BarcodeScanningResult) => {
      if (isPairing) return;
      const offerUrl = extractOfferUrlFromScan(result);
      if (!offerUrl) return;

      if (lastScannedRef.current === offerUrl) return;
      lastScannedRef.current = offerUrl;

      const pairingAbort = new AbortController();
      try {
        setPairingPhase("connecting");
        pairingAbortRef.current = pairingAbort;
        const idx = offerUrl.indexOf("#offer=");
        const encoded = offerUrl.slice(idx + "#offer=".length).trim();
        const offerPayload = decodeOfferFragmentPayload(encoded);
        const offer = ConnectionOfferSchema.parse(offerPayload);

        let connected: Awaited<ReturnType<typeof connectToDaemon>> | null = null;
        let approvalRequired: DaemonConnectionApprovalRequiredError | null = null;
        let lastError: unknown = null;
        for (const relay of getConnectionOfferRelays(offer)) {
          try {
            connected = await connectToDaemon(
              {
                id: "probe",
                type: "relay",
                relayEndpoint: normalizeHostPort(relay.endpoint),
                useTls: relay.useTls,
                daemonPublicKeyB64: offer.daemonPublicKeyB64,
              },
              { serverId: offer.serverId },
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
          setPairingPhase("awaiting_approval");
          const serverInfo = await waitForDaemonApproval(
            approvalRequired.client,
            pairingAbort.signal,
          );
          pendingClientRef.current = null;
          await approvalRequired.client.close().catch(() => undefined);
          const profile = await upsertDaemonFromOfferUrl(
            offerUrl,
            serverInfo.hostname ?? undefined,
          );
          navigateToPairedHost(profile.serverId);
          return;
        }
        if (!connected) throw lastError ?? new Error("No relay endpoint is available");
        const { client, hostname } = connected;
        await client.close().catch(() => undefined);

        const profile = await upsertDaemonFromOfferUrl(offerUrl, hostname ?? undefined);

        navigateToPairedHost(profile.serverId);
      } catch (error) {
        if (pairingAbort.signal.aborted) {
          return;
        }
        lastScannedRef.current = null;
        const message = error instanceof Error ? error.message : t("pairing.scan.unableToPair");
        Alert.alert(t("pairing.scan.errorTitle"), message);
      } finally {
        if (pairingAbortRef.current === pairingAbort) {
          pairingAbortRef.current = null;
        }
        const pendingClient = pendingClientRef.current;
        pendingClientRef.current = null;
        if (pendingClient) {
          await pendingClient.close().catch(() => undefined);
        }
        setPairingPhase("idle");
      }
    },
    [isPairing, navigateToPairedHost, t, upsertDaemonFromOfferUrl],
  );

  const handleRouterBack = useCallback(() => router.back(), [router]);
  const handleRequestPermission = useCallback(() => {
    void requestPermission();
  }, [requestPermission]);

  const bodyStyle = useMemo(
    () => [styles.body, { paddingBottom: insets.bottom + theme.spacing[6] }],
    [insets.bottom, theme.spacing],
  );
  const helperTextStyle = useMemo(
    () => [styles.helperText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );

  if (isWeb) {
    return (
      <View style={styles.container}>
        <BackHeader title={t("pairing.scan.title")} onBack={handleRouterBack} />
        <View style={bodyStyle}>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>{t("pairing.scan.webUnavailableTitle")}</Text>
            <Text style={styles.permissionBody}>{t("pairing.scan.webUnavailableBody")}</Text>
            <Pressable style={styles.permissionButton} onPress={closeToSource}>
              <Text style={styles.permissionButtonText}>{t("pairing.scan.backToSettings")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const granted = Boolean(permission?.granted);
  let scanContent: ReactNode;
  if (pairingPhase === "awaiting_approval") {
    scanContent = (
      <View style={styles.permissionCard} testID="pairing-awaiting-approval">
        <Text style={styles.approvalStatus}>{t("pairing.scan.awaitingApprovalStatus")}</Text>
        <Text style={styles.permissionTitle}>{t("pairing.scan.awaitingApprovalTitle")}</Text>
        <Text style={styles.permissionBody}>{t("pairing.scan.awaitingApprovalBody")}</Text>
        <Pressable style={styles.permissionButton} onPress={closeToSource}>
          <Text style={styles.permissionButtonText}>{t("common.actions.cancel")}</Text>
        </Pressable>
      </View>
    );
  } else if (!granted) {
    scanContent = (
      <View style={styles.permissionCard}>
        <Text style={styles.permissionTitle}>{t("pairing.scan.cameraPermissionTitle")}</Text>
        <Text style={styles.permissionBody}>{t("pairing.scan.cameraPermissionBody")}</Text>
        <Pressable style={styles.permissionButton} onPress={handleRequestPermission}>
          <Text style={styles.permissionButtonText}>{t("pairing.scan.grantPermission")}</Text>
        </Pressable>
      </View>
    );
  } else {
    scanContent = (
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={BARCODE_SCANNER_SETTINGS}
          onBarcodeScanned={handleScan}
        />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          {isPairing ? <Text style={helperTextStyle}>{t("pairing.scan.pairing")}</Text> : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BackHeader title={t("pairing.scan.title")} onBack={closeToSource} />

      <View style={bodyStyle}>{scanContent}</View>
    </View>
  );
}

const BARCODE_SCANNER_SETTINGS: BarcodeSettings = { barcodeTypes: ["qr"] };
