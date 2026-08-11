import { describe, expect, it, vi } from "vitest";

import {
  applyMacWindowControlsUpdate,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  getMainWindowChromeOptions,
  readBadgeCount,
  readWindowChromeUpdate,
  readWindowTheme,
  resolveWindowBounds,
  setCustomWindowName,
  setupWindowTitleManagement,
} from "./window-manager";

describe("window-manager", () => {
  describe("normalizeCustomWindowName", () => {
    it("trims names and rejects empty or non-string values", () => {
      expect(normalizeCustomWindowName("  Finance team  ")).toBe("Finance team");
      expect(normalizeCustomWindowName("   ")).toBeNull();
      expect(normalizeCustomWindowName(undefined)).toBeNull();
      expect(normalizeCustomWindowName(42)).toBeNull();
    });

    it("limits names to the supported native title length", () => {
      const name = "x".repeat(MAX_CUSTOM_WINDOW_NAME_LENGTH + 10);
      expect(normalizeCustomWindowName(name)).toBe("x".repeat(MAX_CUSTOM_WINDOW_NAME_LENGTH));
    });
  });

  describe("custom window titles", () => {
    it("keeps a custom title while remembering page title updates for reset", () => {
      const setTitle = vi.fn();
      const webContentsOn = vi.fn();
      const win = {
        getTitle: () => "Paseo",
        setTitle,
        webContents: {
          on: webContentsOn,
        },
        on: vi.fn(),
      };

      setupWindowTitleManagement(win as never, "Paseo");
      expect(setCustomWindowName(win as never, "Finance")).toBe("Finance");

      const [, pageTitleUpdated] = (webContentsOn.mock.calls[0] ?? []) as [
        string?,
        ((event: { preventDefault: () => void }, title: string) => void)?,
      ];
      const preventDefault = vi.fn();
      pageTitleUpdated?.({ preventDefault }, "Settlement workspace");

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(setTitle).toHaveBeenLastCalledWith("Finance");
      expect(resetCustomWindowName(win as never)).toBe("Settlement workspace");
      expect(setTitle).toHaveBeenLastCalledWith("Settlement workspace");
    });
  });

  describe("readBadgeCount", () => {
    it("returns valid non-negative integers", () => {
      expect(readBadgeCount(0)).toBe(0);
      expect(readBadgeCount(3)).toBe(3);
    });

    it("falls back to zero for invalid payloads", () => {
      expect(readBadgeCount(undefined)).toBe(0);
      expect(readBadgeCount(null)).toBe(0);
      expect(readBadgeCount(Number.NaN)).toBe(0);
      expect(readBadgeCount(Number.POSITIVE_INFINITY)).toBe(0);
      expect(readBadgeCount(-1)).toBe(0);
      expect(readBadgeCount(1.5)).toBe(0);
      expect(readBadgeCount("2")).toBe(0);
      expect(readBadgeCount({ count: 2 })).toBe(0);
    });
  });

  describe("readWindowTheme", () => {
    it("accepts supported title bar themes", () => {
      expect(readWindowTheme("light")).toBe("light");
      expect(readWindowTheme("dark")).toBe("dark");
    });

    it("rejects invalid title bar themes", () => {
      expect(readWindowTheme(undefined)).toBeNull();
      expect(readWindowTheme("auto")).toBeNull();
      expect(readWindowTheme("system")).toBeNull();
    });
  });

  describe("readWindowChromeUpdate", () => {
    it("accepts partial runtime overlay updates", () => {
      expect(
        readWindowChromeUpdate({
          backgroundColor: "#181B1A",
          trafficLightOffsetY: -5,
        }),
      ).toEqual({
        backgroundColor: "#181B1A",
        trafficLightOffsetY: -5,
      });
    });

    it("rejects empty and invalid payloads", () => {
      expect(readWindowChromeUpdate(undefined)).toBeNull();
      expect(readWindowChromeUpdate({})).toBeNull();
      expect(readWindowChromeUpdate({ backgroundColor: 12 })).toBeNull();
      expect(readWindowChromeUpdate({ trafficLightOffsetY: -11 })).toBeNull();
    });

    it("preserves fractional traffic-light offsets", () => {
      expect(readWindowChromeUpdate({ trafficLightOffsetY: 1.5 })).toEqual({
        trafficLightOffsetY: 1.5,
      });
    });
  });

  describe("applyMacWindowControlsUpdate", () => {
    it("uses the focus and normal traffic-light positions", () => {
      const setWindowButtonPosition = vi.fn();

      applyMacWindowControlsUpdate({
        win: { setWindowButtonPosition },
        update: { trafficLightOffsetY: -5 },
      });
      applyMacWindowControlsUpdate({
        win: { setWindowButtonPosition },
        update: { trafficLightOffsetY: 0.5 },
      });

      expect(setWindowButtonPosition).toHaveBeenNthCalledWith(1, { x: 16, y: 9 });
      expect(setWindowButtonPosition).toHaveBeenNthCalledWith(2, { x: 16, y: 14.5 });
    });
  });

  describe("getMainWindowChromeOptions", () => {
    it("uses renderer-painted controls on windows", () => {
      expect(
        getMainWindowChromeOptions({
          mode: "custom-windows",
        }),
      ).toEqual({
        frame: false,
        autoHideMenuBar: true,
      });
    });

    it("uses renderer-painted controls on linux", () => {
      expect(
        getMainWindowChromeOptions({
          mode: "custom-linux",
        }),
      ).toEqual({
        frame: false,
        autoHideMenuBar: true,
      });
    });

    it("keeps the mac traffic-light path separate", () => {
      expect(
        getMainWindowChromeOptions({
          mode: "native-mac",
        }),
      ).toEqual({
        titleBarStyle: "hidden",
        titleBarOverlay: true,
        trafficLightPosition: { x: 16, y: 14 },
      });
    });
  });

  describe("resolveWindowBounds", () => {
    it("falls back to the default size when no state is saved", () => {
      expect(resolveWindowBounds(null)).toEqual({
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
      });
    });

    it("restores the full size and position", () => {
      expect(
        resolveWindowBounds({ x: 120, y: 80, width: 1024, height: 720, isMaximized: false }),
      ).toEqual({ width: 1024, height: 720, x: 120, y: 80 });
    });

    it("omits the position when only the size was persisted", () => {
      expect(resolveWindowBounds({ width: 1024, height: 720, isMaximized: true })).toEqual({
        width: 1024,
        height: 720,
      });
    });
  });
});
