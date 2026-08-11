import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as QRCode from "qrcode";
import { SvgXml } from "react-native-svg";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { RotateCw, Copy, Check } from "lucide-react-native";
import { settingsStyles } from "@/styles/settings";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useOptionalToast } from "@/contexts/toast-context";
import {
  daemonPairingQueryKey,
  relayPairingOffersEqual,
  type RelayPairingOfferView,
} from "@/data/daemon-pairing";
import { useFetchQuery } from "@/data/query";
import { useDaemonConfig } from "@/hooks/use-daemon-config";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { ICON_SIZE } from "@/styles/theme";
import {
  resolveBrowserClientDescription,
  resolveClientPlatformKind,
  type ClientPlatformKind,
} from "@/utils/client-access-display";
import { toErrorMessage } from "@/utils/error-messages";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { DaemonClientAccessEntry } from "@getpaseo/protocol/messages";

const ThemedRotateCw = withUnistyles(RotateCw, (theme) => ({
  color: theme.colors.foreground,
}));
const ThemedCopy = withUnistyles(Copy, (theme) => ({
  color: theme.colors.foreground,
}));
const ThemedCheck = withUnistyles(Check, (theme) => ({
  color: theme.colors.accent,
}));
const ThemedTextInput = withUnistyles(TextInput, (theme) => ({
  selectionColor: theme.colors.accent,
}));

type PairingViewState =
  | { tag: "loading" }
  | { tag: "error"; message: string }
  | { tag: "unavailable"; message: string }
  | { tag: "ready"; offers: RelayPairingOffer[] };

type RelayPairingOffer = RelayPairingOfferView;

function resolvePairingViewState(args: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  data:
    | {
        url?: string | null;
        qr?: string | null;
        relayEnabled?: boolean;
        offers?: RelayPairingOffer[];
      }
    | undefined;
  labels: {
    failedToLoadOffer: string;
    relayDisabled: string;
    unavailable: string;
  };
}): PairingViewState {
  if (args.isPending) return { tag: "loading" };
  if (args.isError) {
    const message =
      args.error instanceof Error ? args.error.message : args.labels.failedToLoadOffer;
    return { tag: "error", message };
  }
  const offers = args.data?.offers ?? [];
  if (offers.length > 0) return { tag: "ready", offers };
  if (args.data?.url) {
    return {
      tag: "ready",
      offers: [
        {
          endpoint: "Relay",
          useTls: false,
          pairingBaseUrl: null,
          url: args.data.url,
          qr: args.data.qr ?? null,
        },
      ],
    };
  }
  const message =
    args.data?.relayEnabled === false ? args.labels.relayDisabled : args.labels.unavailable;
  return { tag: "unavailable", message };
}

export function PairDeviceSection({
  serverId,
  active = true,
}: {
  serverId: string;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const client = useHostRuntimeClient(serverId);
  const isConnected = useHostRuntimeIsConnected(serverId);
  const {
    config: daemonConfig,
    isLoading: daemonConfigLoading,
    patchConfig,
  } = useDaemonConfig(serverId);
  const [updatingClientAccess, setUpdatingClientAccess] = useState(false);

  const pairingQuery = useFetchQuery({
    queryKey: daemonPairingQueryKey(serverId),
    queryFn: async () => {
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      return client.getDaemonPairingOffer();
    },
    // The sheet remains mounted while hidden. Only fetch when it is visible,
    // and always refresh so recently edited Relay domains are represented.
    enabled: Boolean(client && isConnected && active),
    dataShape: "value",
    staleTimeMs: 0,
    retry: 1,
    // LAN Relays advertise their hosted pairing frontend (for example `/app`)
    // after the control channel is ready. Check in the background, but only
    // notify this component when the actual data/error/status changes. This
    // keeps an unchanged Relay list and its QR codes visually stable.
    refetchInterval: active ? 2000 : false,
    notifyOnChangeProps: ["data", "error", "status"],
  });
  const clientAccessQuery = useFetchQuery({
    queryKey: ["daemon-client-access", serverId],
    queryFn: async () => {
      if (!client) throw new Error(t("workspace.terminal.hostDisconnected"));
      return client.listDaemonClientAccess();
    },
    enabled: Boolean(client && isConnected && active),
    dataShape: "value",
    staleTimeMs: 0,
    retry: false,
    refetchInterval: active ? 2000 : false,
  });

  const refetchPairing = pairingQuery.refetch;
  const handleRefetch = useCallback(() => {
    void refetchPairing();
  }, [refetchPairing]);
  const handleClientAccessChanged = useCallback(() => {
    void clientAccessQuery.refetch();
  }, [clientAccessQuery]);
  const handleRequireApprovalChanged = useCallback(
    async (requireApproval: boolean) => {
      if (updatingClientAccess) return;
      setUpdatingClientAccess(true);
      try {
        await patchConfig({ clientAccess: { requireApproval } });
        void clientAccessQuery.refetch();
      } finally {
        setUpdatingClientAccess(false);
      }
    },
    [clientAccessQuery, patchConfig, updatingClientAccess],
  );

  const retryIcon = useMemo(() => <ThemedRotateCw size={ICON_SIZE.sm} />, []);
  const labels = useMemo(
    () => ({
      loadingOffer: t("pairing.device.loadingOffer"),
      relayListTitle: t("pairing.device.relayListTitle"),
      hint: t("pairing.device.hintMultiple"),
      qrUnavailable: t("pairing.device.qrUnavailable"),
      retry: t("pairing.device.retry"),
      copy: t("pairing.device.copy"),
      copied: t("pairing.device.copied"),
      accessTitle: t("pairing.device.access.title"),
      accessRequireApproval: t("pairing.device.access.requireApproval"),
      accessRequireApprovalHint: t("pairing.device.access.requireApprovalHint"),
      accessEmpty: t("pairing.device.access.empty"),
      accessPending: t("pairing.device.access.pending"),
      accessAllowed: t("pairing.device.access.allowed"),
      accessApproved: t("pairing.device.access.approved"),
      accessPaused: t("pairing.device.access.paused"),
      accessConnected: t("pairing.device.access.connected"),
      accessDisconnected: t("pairing.device.access.disconnected"),
      accessHostname: t("pairing.device.access.hostname"),
      accessIdentityId: t("pairing.device.access.identityId"),
      accessEndpoint: t("pairing.device.access.endpoint"),
      accessEndpointUnavailable: t("pairing.device.access.endpointUnavailable"),
      accessLastConnectedAt: t("pairing.device.access.lastConnectedAt"),
      accessNeverConnected: t("pairing.device.access.neverConnected"),
      accessUnknownName: t("pairing.device.access.unknownName"),
      accessApprove: t("pairing.device.access.approve"),
      accessApproving: t("pairing.device.access.approving"),
      accessPause: t("pairing.device.access.pause"),
      accessPausing: t("pairing.device.access.pausing"),
      accessResume: t("pairing.device.access.resume"),
      accessResuming: t("pairing.device.access.resuming"),
      accessDelete: t("pairing.device.access.delete"),
      accessDeleting: t("pairing.device.access.deleting"),
      accessCurrentClient: t("settings.about.thisDevice"),
      accessMacClient: t("pairing.device.access.macClient"),
      accessAndroidClient: t("pairing.device.access.androidClient"),
      accessCliClient: t("pairing.device.access.cliClient"),
      accessBrowserClient: t("pairing.device.access.browserClient"),
    }),
    [t],
  );

  const viewState = resolvePairingViewState({
    isPending: isConnected && pairingQuery.isPending,
    isError: !isConnected || pairingQuery.isError,
    error: isConnected ? pairingQuery.error : new Error(t("workspace.terminal.hostDisconnected")),
    data: pairingQuery.data,
    labels: {
      failedToLoadOffer: t("pairing.device.failedToLoadOffer"),
      relayDisabled: t("pairing.device.relayDisabled"),
      unavailable: t("pairing.device.unavailable"),
    },
  });

  return (
    <View style={settingsStyles.section} testID="host-page-pair-device-card">
      <ClientAccessSection
        client={client}
        clients={clientAccessQuery.data?.clients ?? []}
        hidden={clientAccessQuery.isError}
        labels={labels}
        onChanged={handleClientAccessChanged}
        requireApproval={daemonConfig?.clientAccess.requireApproval ?? false}
        requireApprovalLoading={daemonConfigLoading || updatingClientAccess}
        onRequireApprovalChange={handleRequireApprovalChanged}
      />
      <PairDeviceBody
        viewState={viewState}
        retryIcon={retryIcon}
        handleRefetch={handleRefetch}
        labels={labels}
      />
    </View>
  );
}

interface PairDeviceBodyProps {
  viewState: PairingViewState;
  retryIcon: React.ReactElement;
  handleRefetch: () => void;
  labels: {
    loadingOffer: string;
    relayListTitle: string;
    hint: string;
    qrUnavailable: string;
    retry: string;
    copy: string;
    copied: string;
    accessTitle: string;
    accessRequireApproval: string;
    accessRequireApprovalHint: string;
    accessEmpty: string;
    accessPending: string;
    accessAllowed: string;
    accessApproved: string;
    accessPaused: string;
    accessConnected: string;
    accessDisconnected: string;
    accessHostname: string;
    accessIdentityId: string;
    accessEndpoint: string;
    accessEndpointUnavailable: string;
    accessLastConnectedAt: string;
    accessNeverConnected: string;
    accessUnknownName: string;
    accessApprove: string;
    accessApproving: string;
    accessPause: string;
    accessPausing: string;
    accessResume: string;
    accessResuming: string;
    accessDelete: string;
    accessDeleting: string;
    accessCurrentClient: string;
    accessMacClient: string;
    accessAndroidClient: string;
    accessCliClient: string;
    accessBrowserClient: string;
  };
}

function ClientAccessSection({
  client,
  clients,
  hidden,
  labels,
  onChanged,
  requireApproval,
  requireApprovalLoading,
  onRequireApprovalChange,
}: {
  client: DaemonClient | null;
  clients: DaemonClientAccessEntry[];
  hidden: boolean;
  labels: PairDeviceBodyProps["labels"];
  onChanged: () => void;
  requireApproval: boolean;
  requireApprovalLoading: boolean;
  onRequireApprovalChange: (value: boolean) => Promise<void>;
}) {
  const toast = useOptionalToast();
  const [operation, setOperation] = useState<{
    clientId: string;
    action: "approve" | "pause" | "resume" | "delete";
  } | null>(null);
  const currentClientId = client?.getClientId() ?? null;
  const approve = useCallback(
    async (clientId: string) => {
      if (!client || operation) return;
      setOperation({ clientId, action: "approve" });
      try {
        const result = await client.approveDaemonClientAccess(clientId);
        if (!result.success) {
          throw new Error(result.error ?? "Failed to approve client");
        }
        onChanged();
      } catch (error) {
        const message = toErrorMessage(error);
        if (toast) toast.error(message);
        else console.warn("[ClientAccess] Failed to approve client", message);
      } finally {
        setOperation(null);
      }
    },
    [client, onChanged, operation, toast],
  );
  const setPaused = useCallback(
    async (clientId: string, paused: boolean) => {
      if (!client || operation) return;
      setOperation({ clientId, action: paused ? "pause" : "resume" });
      try {
        const result = await client.setDaemonClientAccessPaused(clientId, paused);
        if (!result.success) {
          throw new Error(result.error ?? "Failed to update client");
        }
        onChanged();
      } catch (error) {
        const message = toErrorMessage(error);
        if (toast) toast.error(message);
        else console.warn("[ClientAccess] Failed to update client", message);
      } finally {
        setOperation(null);
      }
    },
    [client, onChanged, operation, toast],
  );
  const deleteClient = useCallback(
    async (clientId: string) => {
      if (!client || operation) return;
      setOperation({ clientId, action: "delete" });
      try {
        const result = await client.deleteDaemonClientAccess(clientId);
        if (!result.success) {
          throw new Error(result.error ?? "Failed to delete client");
        }
        onChanged();
      } catch (error) {
        const message = toErrorMessage(error);
        if (toast) toast.error(message);
        else console.warn("[ClientAccess] Failed to delete client", message);
      } finally {
        setOperation(null);
      }
    },
    [client, onChanged, operation, toast],
  );
  const handleRequireApprovalChange = useCallback(
    (value: boolean) => {
      void onRequireApprovalChange(value).catch((error: unknown) => {
        const message = toErrorMessage(error);
        if (toast) toast.error(message);
        else console.warn("[ClientAccess] Failed to update approval setting", message);
      });
    },
    [onRequireApprovalChange, toast],
  );
  let clientListContent: ReactNode = null;
  if (!hidden) {
    clientListContent =
      clients.length === 0 ? (
        <Text style={styles.accessEmpty}>{labels.accessEmpty}</Text>
      ) : (
        <View style={styles.accessList}>
          {clients.map((entry) => (
            <ClientAccessRow
              key={entry.clientId}
              entry={entry}
              labels={labels}
              operation={operation}
              isCurrentClient={entry.clientId === currentClientId}
              onApprove={approve}
              onSetPaused={setPaused}
              onDelete={deleteClient}
            />
          ))}
        </View>
      );
  }

  return (
    <View style={[settingsStyles.card, styles.accessCard]}>
      <Text style={styles.accessTitle}>{labels.accessTitle}</Text>
      <View style={styles.accessToggleRow}>
        <View style={styles.accessToggleText}>
          <Text style={styles.accessToggleTitle}>{labels.accessRequireApproval}</Text>
          <Text style={styles.accessEmpty}>{labels.accessRequireApprovalHint}</Text>
        </View>
        <Switch
          value={requireApproval}
          disabled={requireApprovalLoading}
          onValueChange={handleRequireApprovalChange}
          accessibilityLabel={labels.accessRequireApproval}
          testID="client-access-require-approval-switch"
        />
      </View>
      {clientListContent}
    </View>
  );
}

function ClientAccessRow({
  entry,
  labels,
  operation,
  isCurrentClient,
  onApprove,
  onSetPaused,
  onDelete,
}: {
  entry: DaemonClientAccessEntry;
  labels: PairDeviceBodyProps["labels"];
  operation: {
    clientId: string;
    action: "approve" | "pause" | "resume" | "delete";
  } | null;
  isCurrentClient: boolean;
  onApprove: (clientId: string) => Promise<void>;
  onSetPaused: (clientId: string, paused: boolean) => Promise<void>;
  onDelete: (clientId: string) => Promise<void>;
}) {
  const isCompact = useIsCompactFormFactor();
  const handleApprove = useCallback(() => {
    void onApprove(entry.clientId);
  }, [entry.clientId, onApprove]);
  const handlePause = useCallback(() => {
    void onSetPaused(entry.clientId, true);
  }, [entry.clientId, onSetPaused]);
  const handleResume = useCallback(() => {
    void onSetPaused(entry.clientId, false);
  }, [entry.clientId, onSetPaused]);
  const handleDelete = useCallback(() => {
    void onDelete(entry.clientId);
  }, [entry.clientId, onDelete]);
  const currentAction = operation?.clientId === entry.clientId ? operation.action : null;
  const disabled = operation !== null;
  const statusLabel = resolveClientAccessStatusLabel(entry.status, labels);
  const platformKind = resolveClientPlatformKind(entry);
  const platformLabel =
    resolveBrowserClientDescription(entry) ?? resolveClientPlatformLabel(platformKind, labels);
  const endpoint = formatClientAccessEndpoint(entry, labels.accessEndpointUnavailable);
  const lastConnectedAt = formatClientAccessDateTime(entry.lastConnectedAt);
  const detailNumberOfLines = isCompact ? undefined : 1;

  return (
    <View style={[styles.accessRow, isCompact ? styles.accessRowCompact : null]}>
      <View style={styles.accessDetails}>
        <Text style={styles.accessClientName} numberOfLines={detailNumberOfLines} selectable>
          {platformLabel}
        </Text>
        <Text style={styles.accessClientId} numberOfLines={detailNumberOfLines} selectable>
          {labels.accessHostname}: {entry.clientHostname || labels.accessEndpointUnavailable}
        </Text>
        <Text style={styles.accessClientId} numberOfLines={detailNumberOfLines} selectable>
          {labels.accessIdentityId}: {entry.clientId}
        </Text>
        <Text style={styles.accessClientId} selectable>
          {labels.accessEndpoint}: {endpoint}
        </Text>
        <Text style={styles.accessClientId} numberOfLines={detailNumberOfLines} selectable>
          {labels.accessLastConnectedAt}: {lastConnectedAt ?? labels.accessNeverConnected}
        </Text>
        <Text style={styles.accessMeta}>
          {statusLabel} · {entry.connected ? labels.accessConnected : labels.accessDisconnected}
        </Text>
      </View>
      <View style={[styles.accessActions, isCompact ? styles.accessActionsCompact : null]}>
        <ClientAccessActions
          status={entry.status}
          labels={labels}
          currentAction={currentAction}
          disabled={disabled}
          isCurrentClient={isCurrentClient}
          isCompact={isCompact}
          onApprove={handleApprove}
          onPause={handlePause}
          onResume={handleResume}
          onDelete={handleDelete}
        />
      </View>
    </View>
  );
}

function ClientAccessActions({
  status,
  labels,
  currentAction,
  disabled,
  isCurrentClient,
  isCompact,
  onApprove,
  onPause,
  onResume,
  onDelete,
}: {
  status: DaemonClientAccessEntry["status"];
  labels: PairDeviceBodyProps["labels"];
  currentAction: "approve" | "pause" | "resume" | "delete" | null;
  disabled: boolean;
  isCurrentClient: boolean;
  isCompact: boolean;
  onApprove: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  if (isCurrentClient) {
    return <Text style={styles.accessCurrentClient}>{labels.accessCurrentClient}</Text>;
  }

  let primaryAction: ReactNode = (
    <Button
      variant="outline"
      size="sm"
      style={isCompact ? styles.accessActionButtonCompact : null}
      disabled={disabled}
      onPress={onPause}
    >
      {currentAction === "pause" ? labels.accessPausing : labels.accessPause}
    </Button>
  );
  if (status === "pending") {
    primaryAction = (
      <Button
        variant="default"
        size="sm"
        style={isCompact ? styles.accessActionButtonCompact : null}
        disabled={disabled}
        onPress={onApprove}
      >
        {currentAction === "approve" ? labels.accessApproving : labels.accessApprove}
      </Button>
    );
  } else if (status === "paused") {
    primaryAction = (
      <Button
        variant="default"
        size="sm"
        style={isCompact ? styles.accessActionButtonCompact : null}
        disabled={disabled}
        onPress={onResume}
      >
        {currentAction === "resume" ? labels.accessResuming : labels.accessResume}
      </Button>
    );
  }

  return (
    <>
      {primaryAction}
      <Button
        variant="destructive"
        size="sm"
        style={isCompact ? styles.accessActionButtonCompact : null}
        disabled={disabled}
        onPress={onDelete}
      >
        {currentAction === "delete" ? labels.accessDeleting : labels.accessDelete}
      </Button>
    </>
  );
}

function resolveClientAccessStatusLabel(
  status: DaemonClientAccessEntry["status"],
  labels: PairDeviceBodyProps["labels"],
): string {
  if (status === "pending") return labels.accessPending;
  if (status === "allowed") return labels.accessAllowed;
  if (status === "paused") return labels.accessPaused;
  return labels.accessApproved;
}

function resolveClientPlatformLabel(
  kind: ClientPlatformKind,
  labels: PairDeviceBodyProps["labels"],
): string {
  if (kind === "mac") return labels.accessMacClient;
  if (kind === "android") return labels.accessAndroidClient;
  if (kind === "cli") return labels.accessCliClient;
  return labels.accessBrowserClient;
}

function formatClientAccessEndpoint(
  entry: Pick<DaemonClientAccessEntry, "remoteAddress" | "remotePort">,
  unavailableLabel: string,
): string {
  if (!entry.remoteAddress) return unavailableLabel;
  const address = entry.remoteAddress.includes(":")
    ? `[${entry.remoteAddress}]`
    : entry.remoteAddress;
  return `${address}:${entry.remotePort ?? "—"}`;
}

function formatClientAccessDateTime(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleString();
}

function pairingViewStatesEqual(left: PairingViewState, right: PairingViewState): boolean {
  if (left.tag !== right.tag) return false;
  if (left.tag === "loading" || right.tag === "loading") return true;
  if (left.tag === "error" || left.tag === "unavailable") {
    return right.tag === left.tag && left.message === right.message;
  }
  if (right.tag !== "ready") return false;
  return relayPairingOffersEqual(left.offers, right.offers);
}

const PairDeviceBody = memo(function PairDeviceBody({
  viewState,
  retryIcon,
  handleRefetch,
  labels,
}: PairDeviceBodyProps) {
  let content: ReactNode;

  if (viewState.tag === "loading") {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator size="small" />
        <Text style={styles.hint}>{labels.loadingOffer}</Text>
      </View>
    );
  } else if (viewState.tag === "error" || viewState.tag === "unavailable") {
    content = (
      <View style={styles.centered}>
        <Text style={styles.hint}>{viewState.message}</Text>
        <Button variant="outline" size="sm" leftIcon={retryIcon} onPress={handleRefetch}>
          {labels.retry}
        </Button>
      </View>
    );
  } else {
    content = (
      <View style={styles.offerList}>
        {viewState.offers.map((offer, index) => (
          <RelayPairingCard
            key={`${offer.useTls ? "wss" : "ws"}://${offer.endpoint}|${offer.url}`}
            offer={offer}
            index={index}
            labels={labels}
          />
        ))}
      </View>
    );
  }

  return (
    <View style={[settingsStyles.card, styles.relayListCard]}>
      <View style={styles.relayListDescription}>
        <Text style={settingsStyles.rowTitle}>{labels.relayListTitle}</Text>
        <Text style={styles.hint}>{labels.hint}</Text>
      </View>
      {content}
    </View>
  );
}, arePairDeviceBodyPropsEqual);

function arePairDeviceBodyPropsEqual(
  previous: PairDeviceBodyProps,
  next: PairDeviceBodyProps,
): boolean {
  return (
    previous.labels === next.labels &&
    previous.retryIcon === next.retryIcon &&
    previous.handleRefetch === next.handleRefetch &&
    pairingViewStatesEqual(previous.viewState, next.viewState)
  );
}

function RelayPairingCard({
  offer,
  index,
  labels,
}: {
  offer: RelayPairingOffer;
  index: number;
  labels: PairDeviceBodyProps["labels"];
}) {
  const [copied, setCopied] = useState(false);
  const qrQuery = useFetchQuery({
    queryKey: ["daemon-pairing-qr-svg", offer.url],
    queryFn: () =>
      QRCode.toString(offer.url, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 480,
      }),
    dataShape: "value",
    staleTimeMs: 24 * 60 * 60 * 1000,
  });

  const handleCopyPress = useCallback(async () => {
    await Clipboard.setStringAsync(offer.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [offer.url]);

  const copyButtonIcon = useMemo(
    () => (copied ? <ThemedCheck size={ICON_SIZE.sm} /> : <ThemedCopy size={ICON_SIZE.sm} />),
    [copied],
  );
  const endpointLabel =
    offer.endpoint === "Relay"
      ? offer.endpoint
      : `${offer.useTls ? "wss" : "ws"}://${offer.endpoint}`;

  return (
    <View style={settingsStyles.card} testID={`pair-device-relay-${index}`}>
      <View style={styles.relayHeader}>
        <Text style={styles.relayTitle}>Relay {index + 1}</Text>
        <Text style={styles.relayEndpoint} numberOfLines={1} selectable>
          {endpointLabel}
        </Text>
        {offer.pairingBaseUrl ? (
          <Text style={styles.relayEndpoint} numberOfLines={1} selectable>
            {offer.pairingBaseUrl}
          </Text>
        ) : null}
      </View>
      <View style={styles.qrContainer}>
        <PairDeviceQrContent
          qrSvg={qrQuery.data ?? null}
          qrQuery={qrQuery}
          unavailableLabel={labels.qrUnavailable}
        />
      </View>
      <View style={styles.linkRow}>
        <View style={styles.inputWrapper}>
          <ThemedTextInput style={styles.linkInput} value={offer.url} readOnly selectTextOnFocus />
        </View>
        <Button variant="outline" size="sm" leftIcon={copyButtonIcon} onPress={handleCopyPress}>
          {copied ? labels.copied : labels.copy}
        </Button>
      </View>
    </View>
  );
}

function PairDeviceQrContent(props: {
  qrSvg: string | null;
  qrQuery: { isError: boolean };
  unavailableLabel: string;
}) {
  if (props.qrSvg) {
    return <SvgXml xml={props.qrSvg} width="100%" height="100%" />;
  }
  if (props.qrQuery.isError) {
    return <Text style={styles.hint}>{props.unavailableLabel}</Text>;
  }
  return <ActivityIndicator size="small" />;
}

const styles = StyleSheet.create((theme) => ({
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
  },
  accessCard: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  accessTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  accessEmpty: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  accessToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  accessToggleText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  accessToggleTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  accessList: {
    gap: theme.spacing[2],
  },
  accessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  accessRowCompact: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  accessDetails: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  accessClientName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  accessClientId: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  accessMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  accessActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  accessActionsCompact: {
    width: "100%",
    alignSelf: "stretch",
    justifyContent: "flex-start",
  },
  accessActionButtonCompact: {
    flex: 1,
    minWidth: 0,
  },
  accessCurrentClient: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  offerList: {
    gap: theme.spacing[4],
  },
  relayListCard: {
    marginTop: theme.spacing[4],
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  relayListDescription: {
    gap: theme.spacing[1],
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    textAlign: "center",
  },
  relayHeader: {
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
    gap: theme.spacing[1],
  },
  relayTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.semibold,
  },
  relayEndpoint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.mono,
  },
  qrContainer: {
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: 280,
    height: 280,
    marginVertical: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    padding: theme.spacing[2],
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  inputWrapper: {
    flex: 1,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
  },
  linkInput: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    outlineStyle: "none",
  } as object,
}));
