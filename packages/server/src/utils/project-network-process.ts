import path from "node:path";

export const PROJECT_NETWORK_ENV = {
  enabled: "PASEO_PROJECT_NETWORK_ISOLATION",
  helperPath: "PASEO_LINUX_NETWORK_HELPER_PATH",
  proxyPort: "PASEO_PROJECT_PROXY_PORT",
  proxyToken: "PASEO_PROJECT_PROXY_TOKEN",
} as const;

export interface ResolveProjectNetworkProcessInput {
  platform?: NodeJS.Platform;
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface ResolvedProjectNetworkProcess {
  command: string;
  args: string[];
}

export function resolveProjectNetworkProcess(
  input: ResolveProjectNetworkProcessInput,
): ResolvedProjectNetworkProcess {
  const platform = input.platform ?? process.platform;
  if (platform !== "linux" || input.env[PROJECT_NETWORK_ENV.enabled] !== "1") {
    return { command: input.command, args: input.args };
  }
  const helperPath = input.env[PROJECT_NETWORK_ENV.helperPath]?.trim() ?? "";
  const proxyPort = input.env[PROJECT_NETWORK_ENV.proxyPort]?.trim() ?? "";
  const proxyToken = input.env[PROJECT_NETWORK_ENV.proxyToken]?.trim() ?? "";
  const parsedPort = Number(proxyPort);
  if (
    !path.isAbsolute(helperPath) ||
    !Number.isSafeInteger(parsedPort) ||
    parsedPort < 1 ||
    parsedPort > 65_535 ||
    !/^[A-Za-z0-9_-]{16,128}$/u.test(proxyToken)
  ) {
    throw new Error("Incomplete Linux Project network isolation environment");
  }
  if (path.resolve(input.command) === path.resolve(helperPath)) {
    return { command: input.command, args: input.args };
  }
  return {
    command: helperPath,
    args: ["--proxy-port", proxyPort, "--", input.command, ...input.args],
  };
}
