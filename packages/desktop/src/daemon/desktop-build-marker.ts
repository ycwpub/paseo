import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DESKTOP_BUILD_MARKER_FILENAME = "desktop-daemon-build-id";

export function readDesktopDaemonBuildId(paseoHome: string): string | null {
  try {
    const value = readFileSync(path.join(paseoHome, DESKTOP_BUILD_MARKER_FILENAME), "utf-8").trim();
    return value || null;
  } catch {
    return null;
  }
}

export function writeDesktopDaemonBuildId(paseoHome: string, buildId: string): void {
  mkdirSync(paseoHome, { recursive: true });
  writeFileSync(path.join(paseoHome, DESKTOP_BUILD_MARKER_FILENAME), `${buildId}\n`, "utf-8");
}
