import type { ProviderRuntimeSettings } from "../../provider-launch-config.js";

const AIDEN_PROVIDER_TARGETS = {
  "aiden-claude": "claude",
  "aiden-codex": "codex",
} as const;

type AidenProviderId = keyof typeof AIDEN_PROVIDER_TARGETS;

function isAidenProviderId(providerId: string): providerId is AidenProviderId {
  return providerId in AIDEN_PROVIDER_TARGETS;
}

function commandBasename(command: string): string {
  return command.split(/[\\/]/u).at(-1) ?? command;
}

function isLegacyPaseoAidenWrapper(command: string, target: "claude" | "codex"): boolean {
  return new RegExp(`^aiden-x-${target}-paseo(?:\\.(?:sh|cmd|bat|exe))?$`, "iu").test(
    commandBasename(command),
  );
}

function resolveAidenCommand(runtimeSettings: ProviderRuntimeSettings | undefined): string {
  return runtimeSettings?.env?.AIDEN_BIN?.trim() || process.env.AIDEN_BIN?.trim() || "aiden";
}

/**
 * Older Paseo configurations pointed Aiden providers at generated wrapper scripts.
 * Those scripts captured the absolute Aiden path from the machine that created
 * them, so copied configurations could later fail with exit code 127.
 *
 * Current Aiden argument adaptation lives in the provider runtime itself. Rewrite
 * only the known Paseo wrapper names and leave user-owned custom launchers intact.
 */
export function normalizeAidenProviderRuntimeSettings(
  providerId: string,
  runtimeSettings: ProviderRuntimeSettings | undefined,
): ProviderRuntimeSettings | undefined {
  if (!isAidenProviderId(providerId)) {
    return runtimeSettings;
  }

  const target = AIDEN_PROVIDER_TARGETS[providerId];
  const command = runtimeSettings?.command;
  if (command?.mode === "replace") {
    const [executable, ...args] = command.argv;
    if (!isLegacyPaseoAidenWrapper(executable, target)) {
      return runtimeSettings;
    }
    return {
      ...runtimeSettings,
      command: {
        mode: "replace",
        argv: [resolveAidenCommand(runtimeSettings), "x", target, ...args],
      },
    };
  }

  if (command) {
    return runtimeSettings;
  }

  return {
    ...runtimeSettings,
    command: {
      mode: "replace",
      argv: [resolveAidenCommand(runtimeSettings), "x", target],
    },
  };
}
