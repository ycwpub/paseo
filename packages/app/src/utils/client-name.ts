import Constants from "expo-constants";
import { Platform } from "react-native";
import type { RelayDeviceType } from "@getpaseo/protocol/daemon-endpoints";
import { getDesktopHost } from "@/desktop/host";
import { getClientHostnameOverride } from "./client-hostname";

export function resolveClientName(): string {
  const desktopHost = getDesktopHost();
  if (desktopHost || isElectronUserAgent()) {
    return "Paseo Desktop";
  }

  if (Platform.OS === "web") {
    const browserDescription = resolveWebClientDescription();
    return browserDescription ? `Paseo Web · ${browserDescription}` : "Paseo Web";
  }
  if (Platform.OS === "android") {
    return "Paseo Android";
  }
  return "Paseo Mobile";
}

export function resolveClientHostname(): string | undefined {
  const configuredHostname = getClientHostnameOverride();
  if (configuredHostname) {
    return configuredHostname;
  }

  const desktopDeviceName = getDesktopHost()?.deviceName?.trim();
  if (desktopDeviceName) {
    return desktopDeviceName;
  }

  if (Platform.OS === "web") {
    return undefined;
  }

  return Constants.deviceName?.trim() || undefined;
}

export function resolveClientType(): "mobile" | "browser" {
  return Platform.OS === "web" && !getDesktopHost() && !isElectronUserAgent()
    ? "browser"
    : "mobile";
}

export function resolveClientDeviceType(): RelayDeviceType {
  const desktopPlatform = getDesktopHost()?.platform?.trim().toLowerCase();
  if (desktopPlatform === "darwin" || desktopPlatform === "mac" || desktopPlatform === "macos") {
    return "mac";
  }
  if (desktopPlatform === "win32" || desktopPlatform === "windows") {
    return "windows";
  }
  if (desktopPlatform === "linux") {
    return "linux";
  }
  if (isElectronUserAgent() && typeof navigator !== "undefined") {
    if (/\b(Macintosh|Mac OS X)\b/i.test(navigator.userAgent)) return "mac";
    if (/\bWindows\b/i.test(navigator.userAgent)) return "windows";
    if (/\bLinux\b/i.test(navigator.userAgent)) return "linux";
  }
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "ios") return "ios";
  return "web";
}

export function resolveWebClientDescription(
  userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "",
): string | null {
  const os = resolveBrowserOperatingSystem(userAgent);
  const browser = resolveBrowserName(userAgent);
  const parts = [os, browser].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function resolveBrowserOperatingSystem(userAgent: string): string | null {
  if (/\bAndroid\b/i.test(userAgent)) return "Android";
  if (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)) return "iOS";
  if (/\bWindows\b/i.test(userAgent)) return "Windows";
  if (/\b(Macintosh|Mac OS X)\b/i.test(userAgent)) return "macOS";
  if (/\bCrOS\b/i.test(userAgent)) return "ChromeOS";
  if (/\bLinux\b/i.test(userAgent)) return "Linux";
  return null;
}

function resolveBrowserName(userAgent: string): string | null {
  if (/\b(EdgA|EdgiOS|Edg)\/[\d.]+/i.test(userAgent)) return "Edge";
  if (/\b(OPR|Opera)\/[\d.]+/i.test(userAgent)) return "Opera";
  if (/\b(CriOS|Chrome)\/[\d.]+/i.test(userAgent)) return "Chrome";
  if (/\b(FxiOS|Firefox)\/[\d.]+/i.test(userAgent)) return "Firefox";
  if (/\bVersion\/[\d.]+.*\bSafari\/[\d.]+/i.test(userAgent)) return "Safari";
  return null;
}

function isElectronUserAgent(): boolean {
  return typeof navigator !== "undefined" && /\bElectron\/[\d.]+/i.test(navigator.userAgent);
}
