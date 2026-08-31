import { describe, expect, it } from "vitest";
import { refreshDesktopDaemonConnection } from "./desktop-daemon-connection-refresh";
import type { HostRuntimeStore } from "./host-runtime";
import type { DesktopDaemonStatus } from "@/desktop/daemon/desktop-daemon";
import { defaultHostAppearance } from "@/hosts/appearance";
import type { HostProfile } from "@/types/host-connection";
interface RecordedUpsert {
  listenAddress: string;
  serverId: string;
  hostname: string | null;
}
function createFakeStore(hosts: HostProfile[] = []): {
  store: Pick<HostRuntimeStore, "getHosts" | "upsertConnectionFromListen">;
  upserts: RecordedUpsert[];
} {
  const upserts: RecordedUpsert[] = [];
  const store = {
    getHosts: () => hosts,
    upsertConnectionFromListen: async (input: RecordedUpsert) => {
      upserts.push(input);
      return {} as Awaited<ReturnType<HostRuntimeStore["upsertConnectionFromListen"]>>;
    },
  };
  return { store, upserts };
}
function makeStatus(overrides: Partial<DesktopDaemonStatus> = {}): DesktopDaemonStatus {
  return {
    serverId: "srv_desktop",
    status: "running",
    listen: "127.0.0.1:6767",
    hostname: "desktop",
    pid: 1234,
    home: "/home",
    version: "0.0.0",
    desktopManaged: true,
    error: null,
    ...overrides,
  };
}
function makeRelayOnlyHost(serverId: string): HostProfile {
  return {
    serverId,
    label: "Relay host",
    appearance: defaultHostAppearance(),
    lifecycle: {},
    connections: [
      {
        id: "relay:relay.example.com",
        type: "relay",
        relayEndpoint: "relay.example.com",
        daemonPublicKeyB64: "public-key",
      },
    ],
    preferredConnectionId: "relay:relay.example.com",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
describe("upsertDesktopDaemonConnection", () => {
  it("refreshes the desktop connection when its server id is already registered", async () => {
    const fake = createFakeStore([makeRelayOnlyHost("srv_desktop")]);
    const result = await refreshDesktopDaemonConnection(fake.store, makeStatus());
    expect(result).toEqual({ ok: true });
    expect(fake.upserts).toEqual([
      { listenAddress: "127.0.0.1:6767", serverId: "srv_desktop", hostname: "desktop" },
    ]);
  });
});
