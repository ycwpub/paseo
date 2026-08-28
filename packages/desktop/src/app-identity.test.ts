import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveDesktopAppIdentity, resolveEarlyDesktopUserDataPath } from "./app-identity.js";

describe("resolveDesktopAppIdentity", () => {
  it("uses the production application name for normal builds", () => {
    expect(
      resolveDesktopAppIdentity({
        execPath: "/Applications/Paseo.app/Contents/MacOS/Paseo",
      }),
    ).toEqual({
      appName: "Paseo",
      isTestBuild: false,
    });
  });

  it("uses the executable name instead of the npm package name for test builds", () => {
    expect(
      resolveDesktopAppIdentity({
        execPath: "/Applications/Paseo-Feishu-Test.app/Contents/MacOS/Paseo-Feishu-Test",
      }),
    ).toEqual({
      appName: "Paseo-Feishu-Test",
      isTestBuild: true,
    });
  });

  it("supports an explicit test application name", () => {
    expect(
      resolveDesktopAppIdentity({
        execPath: "/Applications/Paseo-Test.app/Contents/MacOS/Paseo-Test",
        testAppNameOverride: "Paseo-Isolated-Test",
      }),
    ).toEqual({
      appName: "Paseo-Isolated-Test",
      isTestBuild: true,
    });
  });
});

describe("resolveEarlyDesktopUserDataPath", () => {
  it("isolates packaged test builds from production renderer data", () => {
    expect(
      resolveEarlyDesktopUserDataPath({
        appDataPath: "/Users/test/Library/Application Support",
        appName: "Paseo-Feishu-Test",
        isPackaged: true,
        isTestBuild: true,
      }),
    ).toBe(path.join("/Users/test/Library/Application Support", "Paseo-Feishu-Test"));
  });

  it("does not override the normal production userData path", () => {
    expect(
      resolveEarlyDesktopUserDataPath({
        appDataPath: "/Users/test/Library/Application Support",
        appName: "Paseo",
        isPackaged: true,
        isTestBuild: false,
      }),
    ).toBeNull();
  });

  it("keeps explicit userData overrides as the highest priority", () => {
    expect(
      resolveEarlyDesktopUserDataPath({
        appDataPath: "/Users/test/Library/Application Support",
        appName: "Paseo-Feishu-Test",
        forcedUserDataDir: "/tmp/paseo-user-data",
        isPackaged: true,
        isTestBuild: true,
      }),
    ).toBe("/tmp/paseo-user-data");
  });
});
