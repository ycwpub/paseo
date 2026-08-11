import { afterEach, describe, expect, it, vi } from "vitest";
import Constants from "expo-constants";
import { getDesktopHost } from "@/desktop/host";
import {
  resolveClientDeviceType,
  resolveClientHostname,
  resolveClientName,
  resolveClientType,
  resolveWebClientDescription,
} from "./client-name";

vi.mock("@/desktop/host", () => ({
  getDesktopHost: vi.fn(),
}));

const mockedGetDesktopHost = vi.mocked(getDesktopHost);
const originalDeviceName = Constants.deviceName;

afterEach(() => {
  mockedGetDesktopHost.mockReset();
  Object.defineProperty(Constants, "deviceName", {
    configurable: true,
    value: originalDeviceName,
  });
  vi.unstubAllGlobals();
});

describe("client name", () => {
  it("identifies the desktop app even when the preload has no device name", () => {
    mockedGetDesktopHost.mockReturnValue({});
    Object.defineProperty(Constants, "deviceName", {
      configurable: true,
      value: "Chrome",
    });

    expect(resolveClientName()).toBe("Paseo Desktop");
    expect(resolveClientHostname()).toBeUndefined();
  });

  it("keeps the desktop device name only in the hostname field", () => {
    mockedGetDesktopHost.mockReturnValue({ deviceName: "development-mac", platform: "darwin" });

    expect(resolveClientName()).toBe("Paseo Desktop");
    expect(resolveClientHostname()).toBe("development-mac");
    expect(resolveClientType()).toBe("mobile");
    expect(resolveClientDeviceType()).toBe("mac");
  });

  it("reports the native desktop platform to Relay management", () => {
    mockedGetDesktopHost.mockReturnValue({ platform: "win32" });
    expect(resolveClientDeviceType()).toBe("windows");

    mockedGetDesktopHost.mockReturnValue({ platform: "linux" });
    expect(resolveClientDeviceType()).toBe("linux");
  });

  it("recognizes Electron if the preload bridge is temporarily unavailable", () => {
    mockedGetDesktopHost.mockReturnValue(null);
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/146.0.0.0 Electron/41.2.0",
    });

    expect(resolveClientName()).toBe("Paseo Desktop");
    expect(resolveClientDeviceType()).toBe("mac");
  });

  it("includes the operating system and browser for web clients", () => {
    mockedGetDesktopHost.mockReturnValue(null);
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    });

    expect(resolveWebClientDescription()).toBe("macOS · Chrome");
    expect(resolveClientName()).toBe("Paseo Web · macOS · Chrome");
  });

  it("does not report Chromium-based Edge as Chrome", () => {
    expect(
      resolveWebClientDescription(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36 Edg/146.0.0.0",
      ),
    ).toBe("Windows · Edge");
  });
});
