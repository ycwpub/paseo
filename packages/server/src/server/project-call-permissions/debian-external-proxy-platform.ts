import { readFileSync } from "node:fs";

export interface DebianExternalProxyCapability {
  available: boolean;
  reason: string;
}

export interface DetectDebianExternalProxyCapabilityOptions {
  platform?: NodeJS.Platform;
  readOsRelease?: () => string;
}

function parseOsReleaseId(contents: string): string | null {
  for (const line of contents.split(/\r?\n/u)) {
    const match = /^\s*ID\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    const rawValue = match[1] ?? "";
    const unquoted =
      rawValue.length >= 2 &&
      ((rawValue.startsWith('"') && rawValue.endsWith('"')) ||
        (rawValue.startsWith("'") && rawValue.endsWith("'")))
        ? rawValue.slice(1, -1)
        : rawValue;
    const normalized = unquoted.trim().toLowerCase();
    return normalized || null;
  }
  return null;
}

export function detectDebianExternalProxyCapability(
  options: DetectDebianExternalProxyCapabilityOptions = {},
): DebianExternalProxyCapability {
  const platform = options.platform ?? process.platform;
  if (platform !== "linux") {
    return {
      available: false,
      reason: "外部代理仅支持 Debian 服务器",
    };
  }

  let osRelease: string;
  try {
    osRelease = (options.readOsRelease ?? (() => readFileSync("/etc/os-release", "utf8")))();
  } catch {
    return {
      available: false,
      reason: "无法确认服务器是否为 Debian，外部代理保持关闭",
    };
  }

  const id = parseOsReleaseId(osRelease);
  if (id === "debian") {
    return { available: true, reason: "" };
  }
  if (id) {
    return {
      available: false,
      reason: "外部代理仅支持 Debian 服务器",
    };
  }
  return {
    available: false,
    reason: "无法确认服务器是否为 Debian，外部代理保持关闭",
  };
}
