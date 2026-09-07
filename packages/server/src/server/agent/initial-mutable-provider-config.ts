import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import type { ProviderOverride } from "./provider-launch-config.js";

export function resolveInitialMutableProviderConfig(
  providerOverrides: Record<string, ProviderOverride> | undefined,
): MutableDaemonConfig["providers"] {
  return providerOverrides ?? {};
}
