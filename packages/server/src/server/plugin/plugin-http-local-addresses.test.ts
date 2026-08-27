import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import {
  assertLocalHttpHost,
  isLocalHttpHost,
  listLocalHttpAddresses,
  normalizeLocalHttpHost,
} from "./plugin-http-local-addresses.js";

function ipv4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    netmask: "255.255.255.0",
    family: "IPv4",
    mac: "00:00:00:00:00:00",
    internal,
    cidr: `${address}/24`,
  };
}

describe("plugin HTTP local addresses", () => {
  it("returns loopback first and deduplicates active IPv4 interfaces", () => {
    expect(
      listLocalHttpAddresses({
        en1: [ipv4("192.168.1.9")],
        en0: [ipv4("10.8.0.2"), ipv4("10.8.0.2")],
        lo0: [ipv4("127.0.0.1", true)],
      }),
    ).toEqual([
      { address: "127.0.0.1", interfaceName: null, kind: "loopback" },
      { address: "10.8.0.2", interfaceName: "en0", kind: "network" },
      { address: "192.168.1.9", interfaceName: "en1", kind: "network" },
    ]);
  });

  it("rejects wildcard, hostnames, and addresses not assigned to this Host", () => {
    const addresses = [
      { address: "127.0.0.1", interfaceName: null, kind: "loopback" as const },
      { address: "10.8.0.2", interfaceName: "en0", kind: "network" as const },
    ];

    expect(normalizeLocalHttpHost(" LOCALHOST ")).toBe("127.0.0.1");
    expect(isLocalHttpHost("127.0.0.8", addresses)).toBe(true);
    expect(isLocalHttpHost("10.8.0.2", addresses)).toBe(true);
    expect(isLocalHttpHost("0.0.0.0", addresses)).toBe(false);
    expect(isLocalHttpHost("example.com", addresses)).toBe(false);
    expect(isLocalHttpHost("10.8.0.3", addresses)).toBe(false);
    expect(() => assertLocalHttpHost("0.0.0.0", addresses)).toThrow("不是当前 Host 的本机 IP");
  });
});
