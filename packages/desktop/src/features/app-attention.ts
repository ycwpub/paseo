import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, nativeImage } from "electron";
import log from "electron-log/main";

import { getDesktopSettingsStore } from "../settings/desktop-settings-electron.js";

const MAC_ATTENTION_SOUND_PATH = "/System/Library/Sounds/Glass.aiff";

export type DesktopAttentionReason = "finished" | "intervention";

interface DesktopAttentionControllerDependencies {
  isAppFocused(): boolean;
  showAttentionIcon(): void;
  showNormalIcon(): void;
  bounceDock(): void;
  playSound(volume: number): void;
}

export interface DesktopAttentionController {
  signal(volume: number): boolean;
  clear(): void;
  isActive(): boolean;
}

export function createDesktopAttentionController(
  dependencies: DesktopAttentionControllerDependencies,
): DesktopAttentionController {
  let active = false;

  return {
    signal(volume) {
      if (dependencies.isAppFocused()) {
        if (active) {
          active = false;
          dependencies.showNormalIcon();
        }
        return false;
      }

      if (!active) {
        active = true;
        dependencies.showAttentionIcon();
      }
      dependencies.bounceDock();
      if (volume > 0) {
        dependencies.playSound(Math.min(1, Math.max(0, volume)));
      }
      return true;
    },
    clear() {
      if (!active) {
        return;
      }
      active = false;
      dependencies.showNormalIcon();
    },
    isActive() {
      return active;
    },
  };
}

function getDockIconPath(attention: boolean): string | null {
  const filename = attention ? "icon-attention.png" : "icon.png";
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, "desktop-icons", filename)]
    : [path.resolve(__dirname, "../assets", filename)];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function applyDockIcon(attention: boolean): void {
  if (process.platform !== "darwin") {
    return;
  }
  const iconPath = getDockIconPath(attention);
  if (!iconPath) {
    return;
  }
  const icon = nativeImage.createFromPath(iconPath);
  if (!icon.isEmpty()) {
    app.dock?.setIcon(icon);
  }
}

export function applyNormalDockIcon(): void {
  applyDockIcon(false);
}

function playMacAttentionSound(volume: number): void {
  if (process.platform !== "darwin" || !existsSync(MAC_ATTENTION_SOUND_PATH)) {
    return;
  }
  try {
    const child = spawn("/usr/bin/afplay", ["-v", volume.toFixed(2), MAC_ATTENTION_SOUND_PATH], {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", (error) => {
      log.warn("[app-attention] failed to play attention sound", { error });
    });
    child.unref();
  } catch (error) {
    log.warn("[app-attention] failed to start attention sound", { error });
  }
}

function isAnyPaseoWindowFocused(): boolean {
  return BrowserWindow.getAllWindows().some(
    (window) => !window.isDestroyed() && window.isFocused(),
  );
}

function readAttentionReason(input: unknown): DesktopAttentionReason | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const reason = (input as { reason?: unknown }).reason;
  return reason === "finished" || reason === "intervention" ? reason : null;
}

export function registerAppAttentionHandlers(): void {
  const controller = createDesktopAttentionController({
    isAppFocused: isAnyPaseoWindowFocused,
    showAttentionIcon: () => applyDockIcon(true),
    showNormalIcon: applyNormalDockIcon,
    bounceDock: () => {
      app.dock?.bounce("informational");
    },
    playSound: playMacAttentionSound,
  });

  ipcMain.handle("paseo:attention:signal", async (_event, input?: unknown) => {
    if (process.platform !== "darwin" || !readAttentionReason(input)) {
      return false;
    }
    const settings = await getDesktopSettingsStore().get();
    return controller.signal(settings.attention.soundVolume);
  });

  app.on("browser-window-focus", () => {
    controller.clear();
  });
}
