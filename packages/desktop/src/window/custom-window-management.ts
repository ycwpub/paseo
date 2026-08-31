import { BrowserWindow, ipcMain, nativeTheme } from "electron";
import type { DesktopWindowChromeMode } from "./chrome.js";

const MAC_TRAFFIC_LIGHT_POSITION = { x: 16, y: 14 } as const;
const MAX_TRAFFIC_LIGHT_OFFSET_Y = 10;

export const MAX_CUSTOM_WINDOW_NAME_LENGTH = 80;

const customNameByWindow = new WeakMap<BrowserWindow, string>();
const automaticTitleByWindow = new WeakMap<BrowserWindow, string>();
const defaultTitleByWindow = new WeakMap<BrowserWindow, string>();

export type WindowTheme = "light" | "dark";

export interface WindowControlsOverlayUpdate {
  height?: number;
  backgroundColor?: string;
  foregroundColor?: string;
  trafficLightOffsetY?: number;
}

export interface WindowControlsOverlayState {
  height: number;
  backgroundColor?: string;
  foregroundColor?: string;
}

export function normalizeCustomWindowName(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }
  const trimmed = input.trim();
  return trimmed ? trimmed.slice(0, MAX_CUSTOM_WINDOW_NAME_LENGTH) : null;
}

function getAutomaticWindowTitle(win: BrowserWindow): string {
  return automaticTitleByWindow.get(win) ?? defaultTitleByWindow.get(win) ?? win.getTitle();
}

export function getWindowDisplayName(win: BrowserWindow): string {
  return customNameByWindow.get(win) ?? getAutomaticWindowTitle(win);
}

export function setCustomWindowName(win: BrowserWindow, input: unknown): string | null {
  const name = normalizeCustomWindowName(input);
  if (!name) {
    return null;
  }
  customNameByWindow.set(win, name);
  win.setTitle(name);
  return name;
}

export function resetCustomWindowName(win: BrowserWindow): string {
  customNameByWindow.delete(win);
  const title = getAutomaticWindowTitle(win);
  win.setTitle(title);
  return title;
}

export function setupWindowTitleManagement(win: BrowserWindow, defaultTitle: string): void {
  defaultTitleByWindow.set(win, defaultTitle);
  automaticTitleByWindow.set(win, defaultTitle);
  win.webContents.on("page-title-updated", (event, title) => {
    automaticTitleByWindow.set(win, title.trim() || defaultTitle);
    const customName = customNameByWindow.get(win);
    if (!customName) {
      return;
    }
    event.preventDefault();
    win.setTitle(customName);
  });
  win.on("closed", () => {
    customNameByWindow.delete(win);
    automaticTitleByWindow.delete(win);
    defaultTitleByWindow.delete(win);
  });
}

function resolveSystemWindowTheme(): WindowTheme {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

export function getTitleBarOverlayOptions(theme: WindowTheme): Electron.TitleBarOverlayOptions {
  return theme === "dark"
    ? { color: "#181B1A", symbolColor: "#e4e4e7", height: 29 }
    : { color: "#ffffff", symbolColor: "#09090b", height: 29 };
}

export function getMainWindowChromeOptions(input: {
  platform: NodeJS.Platform;
  theme: WindowTheme;
}): Pick<
  Electron.BrowserWindowConstructorOptions,
  "titleBarStyle" | "trafficLightPosition" | "frame" | "titleBarOverlay" | "autoHideMenuBar"
> {
  if (input.platform === "darwin") {
    return {
      titleBarStyle: "hidden",
      titleBarOverlay: true,
      trafficLightPosition: MAC_TRAFFIC_LIGHT_POSITION,
    };
  }
  return {
    titleBarStyle: "hidden",
    frame: false,
    titleBarOverlay: getTitleBarOverlayOptions(input.theme),
    autoHideMenuBar: true,
  };
}

export function createWindowControlsOverlayState(theme: WindowTheme): WindowControlsOverlayState {
  const overlay = getTitleBarOverlayOptions(theme);
  return {
    height: overlay.height ?? 29,
    backgroundColor: overlay.color,
    foregroundColor: overlay.symbolColor,
  };
}

function readFiniteOverlayHeight(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  const rounded = Math.round(input);
  return rounded >= 1 ? rounded : null;
}

function readOverlayColor(input: unknown): string | null {
  return typeof input === "string" ? input : null;
}

function readTrafficLightOffsetY(input: unknown): number | null {
  if (typeof input !== "number" || !Number.isFinite(input)) {
    return null;
  }
  return Math.abs(input) <= MAX_TRAFFIC_LIGHT_OFFSET_Y ? input : null;
}

export function readWindowControlsOverlayUpdate(
  input: unknown,
): WindowControlsOverlayUpdate | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as Record<string, unknown>;
  const height = readFiniteOverlayHeight(candidate.height);
  const backgroundColor = readOverlayColor(candidate.backgroundColor);
  const foregroundColor = readOverlayColor(candidate.foregroundColor);
  const trafficLightOffsetY = readTrafficLightOffsetY(candidate.trafficLightOffsetY);
  if (
    height === null &&
    backgroundColor === null &&
    foregroundColor === null &&
    trafficLightOffsetY === null
  ) {
    return null;
  }
  return {
    ...(height !== null ? { height } : {}),
    ...(backgroundColor !== null ? { backgroundColor } : {}),
    ...(foregroundColor !== null ? { foregroundColor } : {}),
    ...(trafficLightOffsetY !== null ? { trafficLightOffsetY } : {}),
  };
}

export function resolveRuntimeTitleBarOverlayOptions(
  state: WindowControlsOverlayState,
): Electron.TitleBarOverlayOptions {
  return {
    color: state.backgroundColor?.trim() === "" ? undefined : state.backgroundColor,
    symbolColor: state.foregroundColor?.trim() === "" ? undefined : state.foregroundColor,
    height: Math.max(0, state.height - 1),
  };
}

export function applyWindowControlsOverlayUpdate(input: {
  win: Pick<BrowserWindow, "setTitleBarOverlay">;
  current: WindowControlsOverlayState;
  update: WindowControlsOverlayUpdate;
}): WindowControlsOverlayState {
  const next: WindowControlsOverlayState = {
    height: input.update.height ?? input.current.height,
    backgroundColor: input.update.backgroundColor ?? input.current.backgroundColor,
    foregroundColor: input.update.foregroundColor ?? input.current.foregroundColor,
  };
  input.win.setTitleBarOverlay(resolveRuntimeTitleBarOverlayOptions(next));
  return next;
}

function applyMacWindowControlsUpdate(input: {
  win: Pick<BrowserWindow, "setWindowButtonPosition">;
  update: WindowControlsOverlayUpdate;
}): void {
  if (input.update.trafficLightOffsetY === undefined) {
    return;
  }
  input.win.setWindowButtonPosition({
    x: MAC_TRAFFIC_LIGHT_POSITION.x,
    y: MAC_TRAFFIC_LIGHT_POSITION.y + input.update.trafficLightOffsetY,
  });
}

export function registerCustomWindowManagement(input: { mode: DesktopWindowChromeMode }): void {
  const overlayStateByWindow = new WeakMap<BrowserWindow, WindowControlsOverlayState>();

  ipcMain.handle("paseo:window:getName", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? getWindowDisplayName(win) : "";
  });
  ipcMain.handle("paseo:window:setName", (event, name: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      throw new Error("Window is unavailable.");
    }
    const normalizedName = setCustomWindowName(win, name);
    if (!normalizedName) {
      throw new Error("Window name is required.");
    }
    return normalizedName;
  });
  ipcMain.handle("paseo:window:resetName", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? resetCustomWindowName(win) : "";
  });
  ipcMain.handle("paseo:window:updateWindowControls", (event, update?: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return;
    }
    const nextUpdate = readWindowControlsOverlayUpdate(update);
    if (!nextUpdate) {
      return;
    }
    if (nextUpdate.backgroundColor) {
      win.setBackgroundColor(nextUpdate.backgroundColor);
    }
    if (input.mode === "native-mac") {
      applyMacWindowControlsUpdate({ win, update: nextUpdate });
      return;
    }
    const current =
      overlayStateByWindow.get(win) ?? createWindowControlsOverlayState(resolveSystemWindowTheme());
    overlayStateByWindow.set(
      win,
      applyWindowControlsOverlayUpdate({ win, current, update: nextUpdate }),
    );
  });
}
