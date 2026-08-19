import path from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserWindow, ipcMain, screen, type Rectangle, type WebContents } from "electron";
import log from "electron-log/main";

import { getDesktopSettingsStore } from "../settings/desktop-settings-electron.js";
import {
  IslandNotificationQueue,
  parseIslandNotification,
  type IslandNotification,
  type IslandNotificationInput,
} from "./island-model.js";
import { getIslandDocument } from "./island-view.js";

const COMPACT_BOUNDS = { width: 420, height: 72 };
const EXPANDED_MIN_HEIGHT = 142;
const EXPANDED_ITEM_HEIGHT = 47;
const EXPANDED_MAX_HEIGHT = 274;

interface IslandRendererState {
  expanded: boolean;
  items: IslandNotification[];
}

interface IslandActionInput {
  action?: unknown;
  id?: unknown;
}

interface IslandExpandedInput {
  expanded?: unknown;
}

class IslandController {
  readonly #queue = new IslandNotificationQueue();
  readonly #sources = new Map<string, WebContents>();
  readonly #timers = new Map<string, NodeJS.Timeout>();
  #window: BrowserWindow | null = null;
  #expanded = false;
  #displayId: number | null = null;

  async show(source: WebContents, rawInput?: IslandNotificationInput): Promise<boolean> {
    const settings = await getDesktopSettingsStore().get();
    if (!settings.island.enabled) {
      return false;
    }
    const sourceWindow = BrowserWindow.fromWebContents(source);
    if (
      !settings.island.showWhenFocused &&
      BrowserWindow.getAllWindows().some(
        (candidate) =>
          candidate !== this.#window && !candidate.isDestroyed() && candidate.isFocused(),
      )
    ) {
      return false;
    }

    const now = Date.now();
    const notification = parseIslandNotification(rawInput, now, randomUUID);
    if (!notification) {
      return false;
    }

    this.#queue.upsert(notification);
    this.#sources.set(notification.id, source);
    this.#scheduleDismiss(notification);
    await this.#ensureWindow(sourceWindow);
    this.#render();
    return true;
  }

  dismiss(id?: string): boolean {
    const targetId = id?.trim() || this.#queue.current()?.id;
    if (!targetId) {
      return false;
    }
    this.#clearTimer(targetId);
    this.#sources.delete(targetId);
    const removed = this.#queue.remove(targetId);
    this.#render();
    return removed;
  }

  clear(): void {
    for (const timer of this.#timers.values()) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    this.#sources.clear();
    this.#queue.clear();
    this.#expanded = false;
    this.#render();
  }

  setExpanded(expanded: boolean): void {
    if (this.#expanded === expanded) {
      return;
    }
    this.#expanded = expanded;
    this.#render();
  }

  open(id?: string): void {
    const target = (id ? this.#queue.get(id) : null) ?? this.#queue.current();
    if (!target) {
      return;
    }
    const source = this.#sources.get(target.id);
    this.dismiss(target.id);
    const targetWindow = this.#resolveTargetWindow(source);
    if (!targetWindow) {
      return;
    }
    targetWindow.show();
    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }
    targetWindow.focus();
    if (target.data && Object.keys(target.data).length > 0) {
      targetWindow.webContents.send("paseo:event:notification-click", { data: target.data });
    }
  }

  isIslandSender(sender: WebContents): boolean {
    return this.#window?.webContents === sender;
  }

  renderWhenReady(): void {
    this.#render();
  }

  reposition(): void {
    const win = this.#window;
    if (!win || win.isDestroyed() || !win.isVisible()) {
      return;
    }
    const display = this.#resolveDisplay();
    this.#displayId = display.id;
    const bounds = this.#resolveBounds(display.bounds);
    win.setBounds(bounds, true);
  }

  async #ensureWindow(sourceWindow: BrowserWindow | null): Promise<void> {
    if (this.#window && !this.#window.isDestroyed()) {
      if (sourceWindow) {
        this.#displayId = screen.getDisplayMatching(sourceWindow.getBounds()).id;
      }
      return;
    }

    if (sourceWindow) {
      this.#displayId = screen.getDisplayMatching(sourceWindow.getBounds()).id;
    }
    const win = new BrowserWindow({
      ...COMPACT_BOUNDS,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      acceptFirstMouse: true,
      webPreferences: {
        preload: path.join(__dirname, "island-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.#window = win;
    win.setAlwaysOnTop(true, "screen-saver");
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setContentProtection(false);
    win.on("closed", () => {
      if (this.#window === win) {
        this.#window = null;
      }
    });
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getIslandDocument())}`);
  }

  #render(): void {
    const win = this.#window;
    const items = this.#queue.list();
    if (!win || win.isDestroyed()) {
      return;
    }
    if (items.length === 0) {
      this.#expanded = false;
      win.hide();
      return;
    }

    const display = this.#resolveDisplay();
    const bounds = this.#resolveBounds(display.bounds, items.length);
    this.#displayId = display.id;
    win.setBounds(bounds, true);
    const state: IslandRendererState = {
      expanded: this.#expanded,
      items,
    };
    win.webContents.send("paseo:island:state", state);
    if (!win.isVisible()) {
      win.showInactive();
    }
  }

  #resolveDisplay(): Electron.Display {
    const displays = screen.getAllDisplays();
    if (this.#displayId !== null) {
      const selected = displays.find((display) => display.id === this.#displayId);
      if (selected) {
        return selected;
      }
    }
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  }

  #resolveBounds(displayBounds: Rectangle, itemCount = this.#queue.list().length): Rectangle {
    const width = COMPACT_BOUNDS.width;
    const height = this.#expanded
      ? Math.min(
          EXPANDED_MAX_HEIGHT,
          Math.max(EXPANDED_MIN_HEIGHT, 82 + Math.min(4, itemCount) * EXPANDED_ITEM_HEIGHT),
        )
      : COMPACT_BOUNDS.height;
    return {
      x: Math.round(displayBounds.x + (displayBounds.width - width) / 2),
      y: displayBounds.y + 6,
      width,
      height,
    };
  }

  #resolveTargetWindow(source: WebContents | undefined): BrowserWindow | null {
    if (source && !source.isDestroyed()) {
      const sourceWindow = BrowserWindow.fromWebContents(source);
      if (sourceWindow && !sourceWindow.isDestroyed()) {
        return sourceWindow;
      }
    }
    return (
      BrowserWindow.getAllWindows().find(
        (candidate) => candidate !== this.#window && !candidate.isDestroyed(),
      ) ?? null
    );
  }

  #scheduleDismiss(notification: IslandNotification): void {
    this.#clearTimer(notification.id);
    const timer = setTimeout(() => {
      this.#timers.delete(notification.id);
      this.#sources.delete(notification.id);
      this.#queue.remove(notification.id);
      this.#render();
    }, notification.durationMs);
    timer.unref();
    this.#timers.set(notification.id, timer);
  }

  #clearTimer(id: string): void {
    const timer = this.#timers.get(id);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.#timers.delete(id);
  }
}

const controller = new IslandController();

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function registerIslandHandlers(): void {
  ipcMain.handle("paseo:island:show", async (event, input?: IslandNotificationInput) => {
    try {
      return await controller.show(event.sender, input);
    } catch (error) {
      log.warn("[island] failed to show reminder", { error });
      return false;
    }
  });

  ipcMain.handle("paseo:island:dismiss", (_event, input?: { id?: unknown }) => {
    return controller.dismiss(readString(input?.id));
  });

  ipcMain.handle("paseo:island:clear", () => {
    controller.clear();
    return true;
  });

  ipcMain.on("paseo:island:ready", (event) => {
    if (controller.isIslandSender(event.sender)) {
      controller.renderWhenReady();
    }
  });

  ipcMain.on("paseo:island:set-expanded", (event, input?: IslandExpandedInput) => {
    if (controller.isIslandSender(event.sender)) {
      controller.setExpanded(input?.expanded === true);
    }
  });

  ipcMain.on("paseo:island:action", (event, input?: IslandActionInput) => {
    if (!controller.isIslandSender(event.sender)) {
      return;
    }
    const id = readString(input?.id);
    if (input?.action === "open") {
      controller.open(id);
    } else if (input?.action === "dismiss") {
      controller.dismiss(id);
    }
  });

  screen.on("display-added", () => controller.reposition());
  screen.on("display-removed", () => controller.reposition());
  screen.on("display-metrics-changed", () => controller.reposition());
}
