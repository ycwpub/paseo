import { describe, expect, test } from "vitest";

import { groupRelayHistory, type RelayHistoryRecordLike } from "./relay-history-groups";

function historyRecord(
  overrides: Partial<RelayHistoryRecordLike> & Pick<RelayHistoryRecordLike, "id" | "connectedAt">,
): RelayHistoryRecordLike {
  return {
    serverId: "srv_1",
    clientId: "cid_1",
    clientHostname: "macbook",
    deviceType: "mac",
    role: "client",
    connectionId: "connection-1",
    remoteAddress: "10.0.0.1",
    remotePort: 5000,
    disconnectedAt: "2026-08-27T00:01:00.000Z",
    ...overrides,
  };
}

describe("groupRelayHistory", () => {
  test("groups reconnects from the same client and preserves every connection time", () => {
    const groups = groupRelayHistory([
      historyRecord({
        id: "older",
        connectedAt: "2026-08-26T00:00:00.000Z",
        remotePort: 5001,
      }),
      historyRecord({
        id: "newer",
        connectedAt: "2026-08-27T00:00:00.000Z",
        remotePort: 5002,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("client:cid_1");
    expect(groups[0]?.latest.id).toBe("newer");
    expect(groups[0]?.records.map((record) => record.id)).toEqual(["newer", "older"]);
  });

  test("groups server control and data reconnects by server identity", () => {
    const groups = groupRelayHistory([
      historyRecord({
        id: "control",
        clientId: null,
        clientHostname: null,
        connectedAt: "2026-08-26T00:00:00.000Z",
        role: "server_control",
      }),
      historyRecord({
        id: "data",
        clientId: null,
        clientHostname: null,
        connectedAt: "2026-08-27T00:00:00.000Z",
        role: "server_data",
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe("server:srv_1");
    expect(groups[0]?.records.map((record) => record.id)).toEqual(["data", "control"]);
  });

  test("keeps different client identities in separate rows", () => {
    const groups = groupRelayHistory([
      historyRecord({ id: "client-1", connectedAt: "2026-08-27T00:00:00.000Z" }),
      historyRecord({
        id: "client-2",
        clientId: "cid_2",
        connectedAt: "2026-08-27T01:00:00.000Z",
      }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["client:cid_2", "client:cid_1"]);
  });
});
