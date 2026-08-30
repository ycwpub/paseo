import { describe, expect, it, vi } from "vitest";
import { applyWindowControlsOverlayUpdate, createWindowControlsOverlayState, getMainWindowChromeOptions, getTitleBarOverlayOptions, MAX_CUSTOM_WINDOW_NAME_LENGTH, normalizeCustomWindowName, readWindowControlsOverlayUpdate, resetCustomWindowName, resolveRuntimeTitleBarOverlayOptions, setCustomWindowName, setupWindowTitleManagement } from "./window-manager";
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
                ((event: {
                    preventDefault: () => void;
                }, title: string) => void)?
            ];
            const preventDefault = vi.fn();
            pageTitleUpdated?.({ preventDefault }, "Settlement workspace");
            expect(preventDefault).toHaveBeenCalledOnce();
            expect(setTitle).toHaveBeenLastCalledWith("Finance");
            expect(resetCustomWindowName(win as never)).toBe("Settlement workspace");
            expect(setTitle).toHaveBeenLastCalledWith("Settlement workspace");
        });
    });
    describe("getTitleBarOverlayOptions", () => {
        it("returns light title bar overlay colors", () => {
            expect(getTitleBarOverlayOptions("light")).toEqual({
                color: "#ffffff",
                symbolColor: "#09090b",
                height: 29,
            });
        });
        it("returns dark title bar overlay colors", () => {
            expect(getTitleBarOverlayOptions("dark")).toEqual({
                color: "#181B1A",
                symbolColor: "#e4e4e7",
                height: 29,
            });
        });
    });
    describe("readWindowControlsOverlayUpdate", () => {
        it("accepts partial runtime overlay updates", () => {
            expect(readWindowControlsOverlayUpdate({
                height: 48,
                backgroundColor: "#181B1A",
                trafficLightOffsetY: -5,
            })).toEqual({
                height: 48,
                backgroundColor: "#181B1A",
                trafficLightOffsetY: -5,
            });
        });
        it("rejects empty and invalid payloads", () => {
            expect(readWindowControlsOverlayUpdate(undefined)).toBeNull();
            expect(readWindowControlsOverlayUpdate({})).toBeNull();
            expect(readWindowControlsOverlayUpdate({ height: 0 })).toBeNull();
            expect(readWindowControlsOverlayUpdate({ backgroundColor: 12 })).toBeNull();
            expect(readWindowControlsOverlayUpdate({ trafficLightOffsetY: -11 })).toBeNull();
        });
        it("preserves fractional traffic-light offsets", () => {
            expect(readWindowControlsOverlayUpdate({ trafficLightOffsetY: 1.5 })).toEqual({
                trafficLightOffsetY: 1.5,
            });
        });
    });
    describe("resolveRuntimeTitleBarOverlayOptions", () => {
        it("applies the VS Code height minus border adjustment", () => {
            expect(resolveRuntimeTitleBarOverlayOptions({
                height: 48,
                backgroundColor: "#ffffff",
                foregroundColor: "#09090b",
            })).toEqual({
                color: "#ffffff",
                symbolColor: "#09090b",
                height: 47,
            });
        });
    });
    describe("applyWindowControlsOverlayUpdate", () => {
        it("merges cached colors with later runtime height updates", () => {
            const setTitleBarOverlay = vi.fn();
            let state = createWindowControlsOverlayState("dark");
            state = applyWindowControlsOverlayUpdate({
                win: { setTitleBarOverlay },
                current: state,
                update: {
                    backgroundColor: "#181B1A",
                    foregroundColor: "#e4e4e7",
                },
            });
            state = applyWindowControlsOverlayUpdate({
                win: { setTitleBarOverlay },
                current: state,
                update: { height: 48 },
            });
            expect(state).toEqual({
                height: 48,
                backgroundColor: "#181B1A",
                foregroundColor: "#e4e4e7",
            });
            expect(setTitleBarOverlay).toHaveBeenNthCalledWith(1, {
                color: "#181B1A",
                symbolColor: "#e4e4e7",
                height: 28,
            });
            expect(setTitleBarOverlay).toHaveBeenNthCalledWith(2, {
                color: "#181B1A",
                symbolColor: "#e4e4e7",
                height: 47,
            });
        });
    });
    describe("getMainWindowChromeOptions", () => {
        it("uses frameless hidden title bars with overlay on windows", () => {
            expect(getMainWindowChromeOptions({
                platform: "win32",
                theme: "dark",
            })).toEqual({
                titleBarStyle: "hidden",
                frame: false,
                autoHideMenuBar: true,
                titleBarOverlay: {
                    color: "#181B1A",
                    symbolColor: "#e4e4e7",
                    height: 29,
                },
            });
        });
        it("uses frameless hidden title bars with overlay on linux", () => {
            expect(getMainWindowChromeOptions({
                platform: "linux",
                theme: "light",
            })).toEqual({
                titleBarStyle: "hidden",
                frame: false,
                autoHideMenuBar: true,
                titleBarOverlay: {
                    color: "#ffffff",
                    symbolColor: "#09090b",
                    height: 29,
                },
            });
        });
        it("keeps the mac traffic-light path separate", () => {
            expect(getMainWindowChromeOptions({
                platform: "darwin",
                theme: "dark",
            })).toEqual({
                titleBarStyle: "hidden",
                titleBarOverlay: true,
                trafficLightPosition: { x: 16, y: 14 },
            });
        });
    });
});
