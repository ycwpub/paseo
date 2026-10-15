import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DaemonConfigStore, validateLocalRelayListenAddress } from "./daemon-config-store.js";
import { loadPersistedConfig } from "./persisted-config.js";
describe("DaemonConfigStore", () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("persists disabled client approval", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);
    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        clientAccess: { requireApproval: true },
      },
      undefined,
    );
    expect(store.patch({ clientAccess: { requireApproval: false } }).clientAccess).toEqual({
      requireApproval: false,
    });
    expect(loadPersistedConfig(paseoHome).daemon?.clientAccess).toEqual({
      requireApproval: false,
    });
  });
  test("persists the Debian external proxy switch and notifies live runtimes", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);
    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
      },
      undefined,
      { externalProxyAvailable: true },
    );
    const onChange = vi.fn();
    store.onFieldChange("externalProxy.enabled", onChange);

    expect(store.patch({ externalProxy: { enabled: true } }).externalProxy).toEqual({
      enabled: true,
    });
    expect(onChange).toHaveBeenCalledWith(true);
    expect(loadPersistedConfig(paseoHome).daemon?.externalProxy).toEqual({
      enabled: true,
    });
  });

  test("forces the external proxy off and rejects enable patches outside Debian", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);
    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        externalProxy: { enabled: true },
      },
      undefined,
      { externalProxyAvailable: false },
    );

    expect(store.get().externalProxy).toEqual({ enabled: false });
    expect(() => store.patch({ externalProxy: { enabled: true } })).toThrow(
      "外部代理仅支持 Debian 服务器",
    );
    expect(loadPersistedConfig(paseoHome).daemon?.externalProxy).toBeUndefined();
  });

  test("persists daemon-global instruction templates", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);
    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
      },
      undefined,
    );
    const instructionTemplates = [
      {
        id: "review",
        name: "Review changes",
        content: "Review {{serviceName}}.",
      },
    ];
    expect(store.patch({ instructionTemplates }).instructionTemplates).toEqual(
      instructionTemplates,
    );
    expect(loadPersistedConfig(paseoHome).daemon?.instructionTemplates).toEqual(
      instructionTemplates,
    );
  });
  test("persists Host general and standard knowledge", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);
    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
      },
      undefined,
    );
    const knowledge = {
      general: [
        { type: "local-directory" as const, source: "shared" },
        { type: "local-document" as const, source: "overview.md" },
      ],
      standards: [
        { type: "local-document" as const, source: "standards/review.md" },
        { type: "cloud-document" as const, source: "https://example.com/standards" },
      ],
    };
    expect(store.patch({ knowledge }).knowledge).toEqual(knowledge);
    expect(loadPersistedConfig(paseoHome).daemon?.knowledge).toEqual(knowledge);
  });
  test("patch persists Relay settings and notifies the live runtime", () => {
    const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-daemon-config-store-"));
    tempDirs.push(paseoHome);
    const store = new DaemonConfigStore(
      paseoHome,
      {
        mcp: { injectIntoAgents: false },
        browserTools: { enabled: false },
        relay: {
          endpoints: [{ endpoint: "relay-old.example.com:443", useTls: true }],
          pairingBaseUrls: [],
          local: { enabled: false, listen: "0.0.0.0:6769" },
        },
        providers: {},
        metadataGeneration: { providers: [] },
        autoArchiveAfterMerge: false,
        enableTerminalAgentHooks: false,
        appendSystemPrompt: "",
      },
      undefined,
    );
    const onRelayChange = vi.fn();
    store.onFieldChange("relay", onRelayChange);
    const relay = {
      endpoints: [
        { endpoint: "relay-new.example.com:443", useTls: true },
        { endpoint: "192.168.1.20:6769", useTls: false },
      ],
      pairingBaseUrls: ["https://app.example.com", "http://192.168.1.20:6769"],
      local: { enabled: true, listen: "0.0.0.0:7788" },
    };
    store.patch({ relay });
    expect(onRelayChange).toHaveBeenCalledTimes(1);
    expect(onRelayChange).toHaveBeenCalledWith({ ...relay, enabled: true });
    expect(loadPersistedConfig(paseoHome).daemon?.relay).toEqual({
      enabled: true,
      endpoints: relay.endpoints,
      local: relay.local,
    });
    store.patch({ relay });
    expect(onRelayChange).toHaveBeenCalledTimes(1);
  });
});
describe("validateLocalRelayListenAddress", () => {
  test("accepts wildcard and assigned private addresses", () => {
    expect(() =>
      validateLocalRelayListenAddress("0.0.0.0:6769", ["192.168.1.102", "10.4.232.206"]),
    ).not.toThrow();
    expect(() =>
      validateLocalRelayListenAddress("10.4.232.206:6769", ["192.168.1.102", "10.4.232.206"]),
    ).not.toThrow();
  });
  test("rejects an address that is not assigned to this machine with actionable guidance", () => {
    expect(() =>
      validateLocalRelayListenAddress("10.71.95.148:6769", [
        "127.0.0.1",
        "192.168.1.102",
        "10.4.232.206",
      ]),
    ).toThrow(
      "LAN Relay listen IP 10.71.95.148 is not assigned to this machine. Use 0.0.0.0 to listen on all interfaces, or choose a local IP: 10.4.232.206, 127.0.0.1, 192.168.1.102.",
    );
  });
});
