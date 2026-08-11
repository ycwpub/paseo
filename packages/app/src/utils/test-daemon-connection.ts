import { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ConnectionState, DaemonClientConfig } from "@getpaseo/client/internal/daemon-client";
import type { HostConnection } from "@/types/host-connection";
import { getOrCreateClientId } from "./client-id";
import { resolveAppVersion } from "./app-version";
import {
  resolveClientDeviceType,
  resolveClientHostname,
  resolveClientName,
  resolveClientType,
} from "./client-name";
import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
  shouldUseTlsForDefaultHostedRelay,
} from "./daemon-endpoints";
import {
  buildLocalDaemonTransportUrl,
  createDesktopLocalDaemonTransportFactory,
} from "@/desktop/daemon/desktop-daemon-transport";

export interface DaemonProbeClient {
  readonly lastError: string | null;
  connect(): Promise<void>;
  close(): Promise<void>;
  getLastServerInfoMessage(): { serverId: string; hostname: string | null } | null;
}

interface LocalTransportUrlInput {
  transportType: "socket" | "pipe";
  transportPath: string;
}

export interface DaemonConnectionDependencies<TClient extends DaemonProbeClient> {
  getClientId(): Promise<string>;
  resolveAppVersion(): string | null;
  createLocalTransportFactory(): DaemonClientConfig["transportFactory"] | null;
  buildLocalTransportUrl(input: LocalTransportUrlInput): string;
  createClient(config: DaemonClientConfig): TClient;
}

const defaultDaemonConnectionDependencies: DaemonConnectionDependencies<DaemonClient> = {
  getClientId: getOrCreateClientId,
  resolveAppVersion,
  createLocalTransportFactory: createDesktopLocalDaemonTransportFactory,
  buildLocalTransportUrl: buildLocalDaemonTransportUrl,
  createClient: (config) => new DaemonClient(config),
};

export function isClientAccessApprovalRequired(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("无权限，联系服务端通过连接申请");
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickBestReason(reason: string | null, lastError: string | null): string {
  const genericReason =
    reason &&
    (reason.toLowerCase() === "transport error" || reason.toLowerCase() === "transport closed");
  const genericLastError =
    lastError &&
    (lastError.toLowerCase() === "transport error" ||
      lastError.toLowerCase() === "transport closed" ||
      lastError.toLowerCase() === "unable to connect");

  if (genericReason && lastError && !genericLastError) {
    return lastError;
  }
  if (reason) return reason;
  if (lastError) return lastError;
  return "Unable to connect";
}

function isIncorrectPasswordFailure(input: {
  config: DaemonClientConfig;
  reason: string | null;
  lastError: string | null;
}): boolean {
  if (!input.config.password) {
    return false;
  }
  const details = [input.reason, input.lastError].filter(Boolean).join("\n").toLowerCase();
  return (
    details.includes("401") ||
    details.includes("4001") ||
    details.includes("unauthorized") ||
    details.includes("code 1006")
  );
}

export class DaemonConnectionTestError extends Error {
  reason: string | null;
  lastError: string | null;

  constructor(message: string, details: { reason: string | null; lastError: string | null }) {
    super(message);
    this.name = "DaemonConnectionTestError";
    this.reason = details.reason;
    this.lastError = details.lastError;
  }
}

export class DaemonConnectionApprovalRequiredError<
  TClient extends DaemonProbeClient = DaemonClient,
> extends DaemonConnectionTestError {
  readonly client: TClient;

  constructor(
    message: string,
    details: { reason: string | null; lastError: string | null },
    client: TClient,
  ) {
    super(message, details);
    this.name = "DaemonConnectionApprovalRequiredError";
    this.client = client;
  }
}

interface ApprovalWaitClient {
  subscribeConnectionStatus(listener: (status: ConnectionState) => void): () => void;
  getLastServerInfoMessage(): { serverId: string; hostname: string | null } | null;
}

export function waitForDaemonApproval(
  client: ApprovalWaitClient,
  signal?: AbortSignal,
): Promise<{ serverId: string; hostname: string | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let unsubscribe = () => {};

    const cleanup = () => {
      unsubscribe();
      signal?.removeEventListener("abort", handleAbort);
    };
    const finishResolve = (value: { serverId: string; hostname: string | null }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleAbort = () => {
      finishReject(new Error("Pairing cancelled"));
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }
    signal?.addEventListener("abort", handleAbort, { once: true });

    unsubscribe = client.subscribeConnectionStatus((state) => {
      if (state.status === "connected") {
        const serverInfo = client.getLastServerInfoMessage();
        if (serverInfo) {
          finishResolve(serverInfo);
        }
        return;
      }
      if (state.status === "disconnected") {
        finishReject(new Error(state.reason || "Connection closed while waiting for approval"));
        return;
      }
      if (state.status === "disposed") {
        finishReject(new Error("Connection closed while waiting for approval"));
      }
    });
    if (settled) {
      unsubscribe();
    }
  });
}

export async function buildClientConfig(
  connection: HostConnection,
  serverId?: string,
  options?: {
    capabilities?: DaemonClientConfig["capabilities"];
    trace?: DaemonClientConfig["trace"];
  },
  deps: Pick<
    DaemonConnectionDependencies<DaemonProbeClient>,
    "getClientId" | "resolveAppVersion" | "createLocalTransportFactory" | "buildLocalTransportUrl"
  > = defaultDaemonConnectionDependencies,
): Promise<DaemonClientConfig> {
  const clientId = await deps.getClientId();
  const localTransportFactory = deps.createLocalTransportFactory();
  const base = {
    clientId,
    clientName: resolveClientName(),
    clientHostname: resolveClientHostname(),
    clientType: resolveClientType(),
    appVersion: deps.resolveAppVersion() ?? undefined,
    suppressSendErrors: true,
    reconnect: { enabled: false },
    ...(options?.capabilities ? { capabilities: options.capabilities } : {}),
    ...(options?.trace ? { trace: options.trace } : {}),
    ...((connection.type === "directSocket" || connection.type === "directPipe") &&
    localTransportFactory
      ? { transportFactory: localTransportFactory }
      : {}),
  };

  if (connection.type === "directSocket" || connection.type === "directPipe") {
    return {
      ...base,
      url: deps.buildLocalTransportUrl({
        transportType: connection.type === "directSocket" ? "socket" : "pipe",
        transportPath: connection.path,
      }),
    };
  }

  if (connection.type === "directTcp") {
    return {
      ...base,
      url: buildDaemonWebSocketUrl(connection.endpoint, { useTls: connection.useTls ?? false }),
      ...(connection.password ? { password: connection.password } : {}),
    };
  }

  if (!serverId) {
    throw new Error("serverId is required to probe a relay connection");
  }

  return {
    ...base,
    url: buildRelayWebSocketUrl({
      endpoint: connection.relayEndpoint,
      useTls: connection.useTls ?? shouldUseTlsForDefaultHostedRelay(connection.relayEndpoint),
      serverId,
      clientId,
      clientHostname: base.clientHostname,
      deviceType: resolveClientDeviceType(),
    }),
    e2ee: { enabled: true, daemonPublicKeyB64: connection.daemonPublicKeyB64 },
  };
}

export function connectAndProbe(
  config: DaemonClientConfig,
  timeoutMs: number,
): Promise<{ client: DaemonClient; serverId: string; hostname: string | null }>;
export function connectAndProbe<TClient extends DaemonProbeClient>(
  config: DaemonClientConfig,
  timeoutMs: number,
  deps: Pick<DaemonConnectionDependencies<TClient>, "createClient">,
): Promise<{ client: TClient; serverId: string; hostname: string | null }>;
export function connectAndProbe(
  config: DaemonClientConfig,
  timeoutMs: number,
  deps: Pick<
    DaemonConnectionDependencies<DaemonProbeClient>,
    "createClient"
  > = defaultDaemonConnectionDependencies,
): Promise<{ client: DaemonProbeClient; serverId: string; hostname: string | null }> {
  const client = deps.createClient(config);

  return new Promise<{ client: DaemonProbeClient; serverId: string; hostname: string | null }>(
    (resolve, reject) => {
      const timer = setTimeout(() => {
        void client.close().catch(() => undefined);
        reject(
          new DaemonConnectionTestError("Connection timed out", {
            reason: "Connection timed out",
            lastError: client.lastError ?? null,
          }),
        );
      }, timeoutMs);

      void client
        .connect()
        .then(() => {
          clearTimeout(timer);
          const serverInfo = client.getLastServerInfoMessage();
          if (!serverInfo) {
            void client.close().catch(() => undefined);
            reject(
              new DaemonConnectionTestError("Missing server info message", {
                reason: "Missing server info message",
                lastError: client.lastError ?? null,
              }),
            );
            return;
          }
          resolve({
            client,
            serverId: serverInfo.serverId,
            hostname: serverInfo.hostname,
          });
          return;
        })
        .catch((error) => {
          clearTimeout(timer);
          const reason = normalizeNonEmptyString(
            error instanceof Error ? error.message : String(error),
          );
          const lastError = normalizeNonEmptyString(client.lastError);
          const message = isIncorrectPasswordFailure({ config, reason, lastError })
            ? "Incorrect password"
            : pickBestReason(reason, lastError);
          if (isClientAccessApprovalRequired(message)) {
            reject(
              new DaemonConnectionApprovalRequiredError(message, { reason, lastError }, client),
            );
            return;
          }
          void client.close().catch(() => undefined);
          reject(new DaemonConnectionTestError(message, { reason, lastError }));
        });
    },
  );
}

interface ProbeOptions {
  serverId?: string;
  timeoutMs?: number;
  capabilities?: DaemonClientConfig["capabilities"];
  trace?: DaemonClientConfig["trace"];
}

function resolveTimeout(connection: HostConnection, options?: ProbeOptions): number {
  if (options?.timeoutMs) return options.timeoutMs;
  return connection.type === "relay" ? 10_000 : 6_000;
}

export function connectToDaemon(
  connection: HostConnection,
  options?: ProbeOptions,
): Promise<{ client: DaemonClient; serverId: string; hostname: string | null }>;
export function connectToDaemon<TClient extends DaemonProbeClient>(
  connection: HostConnection,
  options: ProbeOptions | undefined,
  deps: DaemonConnectionDependencies<TClient>,
): Promise<{ client: TClient; serverId: string; hostname: string | null }>;
export async function connectToDaemon(
  connection: HostConnection,
  options?: ProbeOptions,
  deps: DaemonConnectionDependencies<DaemonProbeClient> = defaultDaemonConnectionDependencies,
): Promise<{ client: DaemonProbeClient; serverId: string; hostname: string | null }> {
  const config = await buildClientConfig(connection, options?.serverId, options, deps);
  return connectAndProbe(config, resolveTimeout(connection, options), deps);
}
