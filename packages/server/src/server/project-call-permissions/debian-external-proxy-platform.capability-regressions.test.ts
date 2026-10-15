import { describe, expect, it } from "vitest";

import { detectDebianExternalProxyCapability } from "./debian-external-proxy-platform.js";

describe("detectDebianExternalProxyCapability", () => {
  it("allows Debian even when the os-release value is quoted", () => {
    expect(
      detectDebianExternalProxyCapability({
        platform: "linux",
        readOsRelease: () => 'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nID="debian"\n',
      }),
    ).toEqual({ available: true, reason: "" });
  });

  it("rejects Ubuntu and other Linux distributions", () => {
    expect(
      detectDebianExternalProxyCapability({
        platform: "linux",
        readOsRelease: () => 'ID=ubuntu\nID_LIKE="debian"\n',
      }),
    ).toEqual({
      available: false,
      reason: "外部代理仅支持 Debian 服务器",
    });
  });

  it("rejects non-Linux hosts without reading os-release", () => {
    let reads = 0;
    expect(
      detectDebianExternalProxyCapability({
        platform: "darwin",
        readOsRelease: () => {
          reads += 1;
          return "ID=debian\n";
        },
      }),
    ).toEqual({
      available: false,
      reason: "外部代理仅支持 Debian 服务器",
    });
    expect(reads).toBe(0);
  });

  it("fails closed for unreadable or malformed os-release files", () => {
    expect(
      detectDebianExternalProxyCapability({
        platform: "linux",
        readOsRelease: () => {
          throw new Error("missing");
        },
      }),
    ).toEqual({
      available: false,
      reason: "无法确认服务器是否为 Debian，外部代理保持关闭",
    });
    expect(
      detectDebianExternalProxyCapability({
        platform: "linux",
        readOsRelease: () => "NAME=Unknown\n",
      }),
    ).toEqual({
      available: false,
      reason: "无法确认服务器是否为 Debian，外部代理保持关闭",
    });
  });
});
