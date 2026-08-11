import { describe, expect, test } from "vitest";
import {
  DaemonClientAccessEntrySchema,
  DaemonClientAccessSetPausedRequestSchema,
  MutableDaemonConfigPatchSchema,
  MutableDaemonConfigSchema,
  WSHelloMessageSchema,
} from "./messages";

describe("mutable daemon client access config", () => {
  test("does not require client approval by default", () => {
    const config = MutableDaemonConfigSchema.parse({
      mcp: { injectIntoAgents: true },
    });

    expect(config.clientAccess).toEqual({ requireApproval: false });
  });

  test("allows client approval to be disabled in a patch", () => {
    expect(
      MutableDaemonConfigPatchSchema.parse({
        clientAccess: { requireApproval: false },
      }),
    ).toEqual({
      clientAccess: { requireApproval: false },
    });
  });
});

describe("daemon client access messages", () => {
  test("carries a human-readable client name separately from the identity id", () => {
    const hello = WSHelloMessageSchema.parse({
      type: "hello",
      clientId: "cid_123",
      clientName: "Paseo Desktop · workstation",
      clientHostname: "workstation",
      clientType: "mobile",
      protocolVersion: 1,
    });

    expect(hello.clientName).toBe("Paseo Desktop · workstation");
    expect(hello.clientHostname).toBe("workstation");
  });

  test("supports paused access entries and pause mutations", () => {
    expect(
      DaemonClientAccessEntrySchema.parse({
        clientId: "cid_123",
        clientName: "Paseo · Pixel",
        clientHostname: "alice-pixel",
        clientType: "mobile",
        appVersion: null,
        remoteAddress: "10.0.0.9",
        remotePort: 54321,
        transport: "relay",
        peer: "external",
        status: "paused",
        requestedAt: "2026-07-30T00:00:00.000Z",
        approvedAt: "2026-07-30T00:01:00.000Z",
        lastConnectedAt: "2026-07-30T00:02:00.000Z",
        connected: false,
      }),
    ).toMatchObject({
      status: "paused",
      clientHostname: "alice-pixel",
      remoteAddress: "10.0.0.9",
      remotePort: 54321,
      lastConnectedAt: "2026-07-30T00:02:00.000Z",
    });
    expect(
      DaemonClientAccessSetPausedRequestSchema.parse({
        type: "daemon.client_access.set_paused.request",
        requestId: "req_1",
        clientId: "cid_123",
        paused: true,
      }).paused,
    ).toBe(true);
  });

  test("defaults the latest connection time for older daemon responses", () => {
    const entry = DaemonClientAccessEntrySchema.parse({
      clientId: "cid_legacy",
      clientName: null,
      clientType: "mobile",
      appVersion: null,
      transport: "direct",
      peer: "external",
      status: "approved",
      requestedAt: "2026-07-30T00:00:00.000Z",
      approvedAt: "2026-07-30T00:01:00.000Z",
      connected: false,
    });

    expect(entry.lastConnectedAt).toBeNull();
  });

  test("supports clients implicitly allowed while admission checks are bypassed", () => {
    const entry = DaemonClientAccessEntrySchema.parse({
      clientId: "cid_allowed",
      clientName: "Paseo Desktop",
      clientHostname: "workstation",
      clientType: "mobile",
      appVersion: null,
      remoteAddress: "127.0.0.1",
      remotePort: 54321,
      transport: "direct",
      peer: "loopback",
      status: "allowed",
      requestedAt: "2026-07-30T00:00:00.000Z",
      approvedAt: null,
      lastConnectedAt: "2026-07-30T00:00:00.000Z",
      connected: true,
    });

    expect(entry.status).toBe("allowed");
  });
});
