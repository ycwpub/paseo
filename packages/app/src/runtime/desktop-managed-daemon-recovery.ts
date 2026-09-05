import { parseHostPort } from "@getpaseo/protocol/daemon-endpoints";
import type { HostProfile } from "@/types/host-connection";
import type { HostRuntimeSnapshot } from "@/runtime/host-runtime";
import type { DaemonStartCondition, DaemonStartService } from "@/runtime/daemon-start-service";

const DEFAULT_RECOVERY_DELAY_MS = 1_500;
const DEFAULT_RETRY_DELAY_MS = 10_000;

interface RecoveryStore {
  getHosts(): HostProfile[];
  getSnapshot(serverId: string): HostRuntimeSnapshot | null;
  subscribeAll(listener: () => void): () => void;
  subscribeHostList(listener: () => void): () => void;
}

type RecoveryTimer = ReturnType<typeof setTimeout>;

export interface DesktopManagedDaemonRecoveryOptions {
  store: RecoveryStore;
  service: Pick<DaemonStartService, "isRunning" | "startIfEnabled">;
  shouldStartDaemon: DaemonStartCondition;
  recoveryDelayMs?: number;
  retryDelayMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => RecoveryTimer;
  clearTimer?: (timer: RecoveryTimer) => void;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized === "::"
  );
}

function isLocalDaemonConnection(connection: HostProfile["connections"][number]): boolean {
  if (connection.type === "directSocket" || connection.type === "directPipe") {
    return true;
  }
  if (connection.type !== "directTcp") {
    return false;
  }
  try {
    return isLoopbackHost(parseHostPort(connection.endpoint).host);
  } catch {
    return false;
  }
}

export function shouldRecoverDesktopManagedDaemon(store: RecoveryStore): boolean {
  let foundUnavailableLocalConnection = false;

  for (const host of store.getHosts()) {
    const localConnections = host.connections.filter(isLocalDaemonConnection);
    if (localConnections.length === 0) {
      continue;
    }

    const snapshot = store.getSnapshot(host.serverId);
    if (!snapshot) {
      continue;
    }

    if (
      snapshot.connectionStatus === "online" &&
      localConnections.some((connection) => connection.id === snapshot.activeConnectionId)
    ) {
      return false;
    }

    for (const connection of localConnections) {
      const probe = snapshot.probeByConnectionId.get(connection.id);
      if (!probe || probe.status === "pending" || probe.status === "available") {
        return false;
      }
      foundUnavailableLocalConnection = true;
    }
  }

  return foundUnavailableLocalConnection;
}

export function startDesktopManagedDaemonRecovery(
  options: DesktopManagedDaemonRecoveryOptions,
): () => void {
  const recoveryDelayMs = options.recoveryDelayMs ?? DEFAULT_RECOVERY_DELAY_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let disposed = false;
  let recovering = false;
  let timer: RecoveryTimer | null = null;

  const schedule = (delayMs: number): void => {
    if (
      disposed ||
      recovering ||
      timer !== null ||
      options.service.isRunning() ||
      !shouldRecoverDesktopManagedDaemon(options.store)
    ) {
      return;
    }
    timer = setTimer(() => {
      timer = null;
      void recover();
    }, delayMs);
  };

  const recover = async (): Promise<void> => {
    if (
      disposed ||
      recovering ||
      options.service.isRunning() ||
      !shouldRecoverDesktopManagedDaemon(options.store)
    ) {
      return;
    }

    recovering = true;
    try {
      await options.service.startIfEnabled({
        shouldStart: options.shouldStartDaemon,
      });
    } finally {
      recovering = false;
      schedule(retryDelayMs);
    }
  };

  const handleStoreChange = (): void => {
    if (!shouldRecoverDesktopManagedDaemon(options.store)) {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      return;
    }
    schedule(recoveryDelayMs);
  };

  const unsubscribeAll = options.store.subscribeAll(handleStoreChange);
  const unsubscribeHostList = options.store.subscribeHostList(handleStoreChange);
  handleStoreChange();

  return () => {
    disposed = true;
    unsubscribeAll();
    unsubscribeHostList();
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
  };
}
