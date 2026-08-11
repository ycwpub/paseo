import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ClientAccessStore } from "./client-access-store.js";

const temporaryDirectories: string[] = [];

function createStore() {
  const directory = mkdtempSync(join(tmpdir(), "paseo-client-access-"));
  temporaryDirectories.push(directory);
  const logger = {
    child: vi.fn(() => logger),
    info: vi.fn(),
    warn: vi.fn(),
  };
  return {
    filePath: join(directory, "client-access.json"),
    store: new ClientAccessStore(logger as never, join(directory, "client-access.json")),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ClientAccessStore", () => {
  test("persists approved clients across daemon restarts", () => {
    const { filePath, store } = createStore();
    store.approve(
      {
        clientId: "client-1",
        clientName: "Alice's Pixel",
        clientHostname: "alice-pixel",
        clientType: "mobile",
        appVersion: "1.2.3",
        remoteAddress: null,
        remotePort: null,
        transport: "relay",
        peer: "external",
        requestedAt: "2026-07-30T00:00:00.000Z",
      },
      "2026-07-30T00:01:00.000Z",
    );

    const logger = {
      child: vi.fn(() => logger),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const reloaded = new ClientAccessStore(logger as never, filePath);

    expect(reloaded.isApproved("client-1")).toBe(true);
    expect(reloaded.listApproved()).toEqual([
      {
        clientId: "client-1",
        clientName: "Alice's Pixel",
        clientHostname: "alice-pixel",
        clientType: "mobile",
        appVersion: "1.2.3",
        remoteAddress: null,
        remotePort: null,
        transport: "relay",
        peer: "external",
        requestedAt: "2026-07-30T00:00:00.000Z",
        approvedAt: "2026-07-30T00:01:00.000Z",
        lastConnectedAt: null,
        paused: false,
      },
    ]);
  });

  test("persists the latest connection time, paused state, and deletion", () => {
    const { filePath, store } = createStore();
    store.approve({
      clientId: "client-2",
      clientName: "Paseo Desktop · workstation",
      clientHostname: "workstation",
      clientType: "browser",
      appVersion: null,
      transport: "direct",
      peer: "external",
      requestedAt: "2026-07-30T00:00:00.000Z",
    });

    expect(store.isApproved("client-2")).toBe(true);
    expect(store.markConnected("client-2", "2026-07-30T00:02:00.000Z")?.lastConnectedAt).toBe(
      "2026-07-30T00:02:00.000Z",
    );
    expect(store.setPaused("client-2", true)?.paused).toBe(true);
    expect(store.isApproved("client-2")).toBe(false);
    expect(store.isPaused("client-2")).toBe(true);

    const logger = {
      child: vi.fn(() => logger),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const reloaded = new ClientAccessStore(logger as never, filePath);
    expect(reloaded.isPaused("client-2")).toBe(true);
    expect(reloaded.get("client-2")?.clientName).toBe("Paseo Desktop · workstation");
    expect(reloaded.get("client-2")?.clientHostname).toBe("workstation");
    expect(reloaded.get("client-2")?.lastConnectedAt).toBe("2026-07-30T00:02:00.000Z");
    expect(reloaded.delete("client-2")).toBe(true);
    expect(reloaded.get("client-2")).toBeNull();
  });

  test("persists connection history with start, end, and manual deletion", () => {
    const { filePath, store } = createStore();
    const historyId = store.startConnection(
      {
        clientId: "client-history",
        clientName: "Paseo Desktop",
        clientHostname: "macbook",
        clientType: "mobile",
        appVersion: "0.2.0",
        remoteAddress: "10.0.0.5",
        remotePort: 54321,
        transport: "direct",
        peer: "external",
      },
      "2026-07-30T00:00:00.000Z",
    );
    expect(store.endConnection(historyId, "2026-07-30T00:05:00.000Z")).toBe(true);

    const logger = {
      child: vi.fn(() => logger),
      info: vi.fn(),
      warn: vi.fn(),
    };
    const reloaded = new ClientAccessStore(logger as never, filePath);
    expect(reloaded.listHistory()).toEqual([
      expect.objectContaining({
        id: historyId,
        clientId: "client-history",
        clientHostname: "macbook",
        connectedAt: "2026-07-30T00:00:00.000Z",
        disconnectedAt: "2026-07-30T00:05:00.000Z",
      }),
    ]);
    expect(reloaded.deleteHistory(historyId)).toBe(true);
    expect(reloaded.listHistory()).toEqual([]);
  });
});
