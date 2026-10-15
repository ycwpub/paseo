import { describe, expect, it } from "vitest";

import { resolveProjectNetworkProcess } from "./project-network-process.js";

describe("resolveProjectNetworkProcess", () => {
  it("wraps a Linux command with the installed Project network helper", () => {
    expect(
      resolveProjectNetworkProcess({
        platform: "linux",
        command: "/usr/bin/node",
        args: ["agent.js", "--verbose"],
        env: {
          PASEO_PROJECT_NETWORK_ISOLATION: "1",
          PASEO_LINUX_NETWORK_HELPER_PATH: "/opt/Paseo/helper",
          PASEO_PROJECT_PROXY_PORT: "43123",
          PASEO_PROJECT_PROXY_TOKEN: "token-value-0123456789",
        },
      }),
    ).toEqual({
      command: "/opt/Paseo/helper",
      args: ["--proxy-port", "43123", "--", "/usr/bin/node", "agent.js", "--verbose"],
    });
  });

  it("fails closed when strict isolation metadata is incomplete", () => {
    expect(() =>
      resolveProjectNetworkProcess({
        platform: "linux",
        command: "/usr/bin/node",
        args: [],
        env: { PASEO_PROJECT_NETWORK_ISOLATION: "1" },
      }),
    ).toThrow("Incomplete Linux Project network isolation environment");
  });

  it("does not wrap ordinary commands or recurse around the helper", () => {
    expect(
      resolveProjectNetworkProcess({
        platform: "linux",
        command: "/usr/bin/node",
        args: ["script.js"],
        env: {},
      }),
    ).toEqual({ command: "/usr/bin/node", args: ["script.js"] });
    expect(
      resolveProjectNetworkProcess({
        platform: "linux",
        command: "/opt/Paseo/helper",
        args: ["--status-json"],
        env: {
          PASEO_PROJECT_NETWORK_ISOLATION: "1",
          PASEO_LINUX_NETWORK_HELPER_PATH: "/opt/Paseo/helper",
          PASEO_PROJECT_PROXY_PORT: "43123",
          PASEO_PROJECT_PROXY_TOKEN: "token-value-0123456789",
        },
      }),
    ).toEqual({ command: "/opt/Paseo/helper", args: ["--status-json"] });
  });

  it("does not apply Linux isolation wrappers on another platform", () => {
    expect(
      resolveProjectNetworkProcess({
        platform: "darwin",
        command: "/usr/bin/node",
        args: [],
        env: { PASEO_PROJECT_NETWORK_ISOLATION: "1" },
      }),
    ).toEqual({ command: "/usr/bin/node", args: [] });
  });
});
