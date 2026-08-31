import type { DesktopDaemonStatus } from "@/desktop/daemon/desktop-daemon";
import type { HostRuntimeStore } from "@/runtime/host-runtime";
import { connectionFromListen } from "@/types/host-connection";
import {
  getDaemonStartService,
  type DaemonStartResult,
  type DaemonStartService,
  type DaemonStartServiceDeps,
} from "./daemon-start-service";

type DaemonConnectionStore = Pick<HostRuntimeStore, "upsertConnectionFromListen">;

export async function refreshDesktopDaemonConnection(
  store: DaemonConnectionStore,
  daemon: DesktopDaemonStatus,
): Promise<DaemonStartResult> {
  const serverId = daemon.serverId.trim();
  if (!serverId) {
    return { ok: false, error: "Desktop daemon did not return a server id." };
  }
  const listenAddress = daemon.listen?.trim() ?? "";
  if (!listenAddress) {
    return { ok: false, error: "Desktop daemon did not return a listen address." };
  }
  if (!connectionFromListen(listenAddress)) {
    return {
      ok: false,
      error: `Desktop daemon returned an unsupported listen address: ${listenAddress}`,
    };
  }
  await store.upsertConnectionFromListen({
    listenAddress,
    serverId,
    hostname: daemon.hostname,
  });
  return { ok: true };
}

export function getRefreshingDaemonStartService(deps: DaemonStartServiceDeps): DaemonStartService {
  return getDaemonStartService({
    ...deps,
    store: {
      getHosts: () => [],
      upsertConnectionFromListen: (input) => deps.store.upsertConnectionFromListen(input),
    },
  });
}
