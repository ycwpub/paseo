import { describe, expect, test } from "vitest";
import type { HostProfile } from "@/types/host-connection";
import {
  buildRelayHostLabelMap,
  buildRelayServerDeviceTypeMap,
  formatRelayPeerEndpoint,
  resolveRelayServerDeviceType,
  resolveRelayServerHostname,
} from "./relay-connection-display";

function host(serverId: string, label: string): HostProfile {
  return {
    serverId,
    label,
    lifecycle: {},
    connections: [],
    preferredConnectionId: null,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  };
}

describe("buildRelayHostLabelMap", () => {
  test("maps a Relay server identity to its user-facing host name", () => {
    const labels = buildRelayHostLabelMap([host("srv_aG2mxohnM8GI", "MLWMD2H2LQ")]);

    expect(labels.get("srv_aG2mxohnM8GI")).toBe("MLWMD2H2LQ");
  });

  test("does not duplicate an identity-only fallback label", () => {
    const labels = buildRelayHostLabelMap([host("srv_unknown", "srv_unknown")]);

    expect(labels.has("srv_unknown")).toBe(false);
  });

  test("ignores blank labels", () => {
    const labels = buildRelayHostLabelMap([host("srv_unknown", "   ")]);

    expect(labels.has("srv_unknown")).toBe(false);
  });
});

describe("formatRelayPeerEndpoint", () => {
  test("labels IPv4 peers with their port", () => {
    expect(formatRelayPeerEndpoint("10.71.95.148", 60620)).toBe("10.71.95.148:60620");
  });

  test("wraps IPv6 peers before appending the port", () => {
    expect(formatRelayPeerEndpoint("2001:db8::1", 6769)).toBe("[2001:db8::1]:6769");
  });

  test("returns null when the Relay does not report a peer address", () => {
    expect(formatRelayPeerEndpoint(null, null)).toBeNull();
  });
});

describe("resolveRelayServerHostname", () => {
  test("prefers the hostname reported by the connected daemon", () => {
    expect(
      resolveRelayServerHostname(
        "remote-paseo-host",
        "srv_remote",
        new Map([["srv_remote", "Saved host label"]]),
      ),
    ).toBe("remote-paseo-host");
  });

  test("falls back to the saved host label for older daemons", () => {
    expect(
      resolveRelayServerHostname(null, "srv_saved", new Map([["srv_saved", "Saved host label"]])),
    ).toBe("Saved host label");
  });
});

describe("Relay server device types", () => {
  test("uses the device type reported by connected daemons", () => {
    const deviceTypes = buildRelayServerDeviceTypeMap([
      {
        serverId: "srv_mac",
        hostname: "macbook",
        version: "0.2.0",
        desktopManaged: true,
        relayDeviceType: "mac",
      },
      {
        serverId: "srv_cli",
        hostname: "linux-host",
        version: "0.2.0",
        desktopManaged: false,
      },
      {
        serverId: "srv_legacy_desktop",
        hostname: "desktop-host",
        version: "0.1.0",
        desktopManaged: true,
      },
    ]);

    expect(deviceTypes.get("srv_mac")).toBe("mac");
    expect(deviceTypes.get("srv_cli")).toBe("cli");
    expect(deviceTypes.has("srv_legacy_desktop")).toBe(false);
  });

  test("falls back to server info when legacy Relay connections omit device type", () => {
    const deviceTypes = new Map([["srv_mac", "mac"] as const]);

    expect(resolveRelayServerDeviceType(null, "server_control", "srv_mac", deviceTypes)).toBe(
      "mac",
    );
    expect(resolveRelayServerDeviceType("linux", "server_data", "srv_mac", deviceTypes)).toBe(
      "linux",
    );
    expect(resolveRelayServerDeviceType(null, "server_control", "srv_unknown", deviceTypes)).toBe(
      null,
    );
    expect(resolveRelayServerDeviceType(null, "client", "srv_mac", deviceTypes)).toBeNull();
  });
});
