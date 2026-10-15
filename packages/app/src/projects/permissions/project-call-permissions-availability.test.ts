import { describe, expect, it } from "vitest";

import { resolveProjectHttpPermissionAvailability } from "./project-call-permissions-availability";

describe("resolveProjectHttpPermissionAvailability", () => {
  it("allows HTTP whitelist and blacklist editing only while the Debian proxy is on", () => {
    expect(
      resolveProjectHttpPermissionAvailability({
        featureAdvertised: true,
        externalProxyEnabled: true,
      }),
    ).toEqual({ editable: true, reason: null });
  });

  it("keeps saved rules disabled when the Debian proxy is off", () => {
    expect(
      resolveProjectHttpPermissionAvailability({
        featureAdvertised: true,
        externalProxyEnabled: false,
      }),
    ).toEqual({
      editable: false,
      reason: "服务器未开启外部代理，请先在主机设置中开启。",
    });
  });

  it("keeps rules disabled on non-Debian and old servers", () => {
    expect(
      resolveProjectHttpPermissionAvailability({
        featureAdvertised: false,
        externalProxyEnabled: true,
      }),
    ).toEqual({
      editable: false,
      reason: "当前服务器不支持 Debian 外部代理。",
    });
  });
});
