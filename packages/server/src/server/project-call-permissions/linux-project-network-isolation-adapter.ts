import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ProjectNetworkIsolationAdapter } from "./project-network-enforcer.js";
import type { ProjectEgressProxyCredentials } from "./project-egress-proxy-credentials.js";
import type { ProjectEgressProxyServer } from "./project-egress-proxy-server.js";
import { PROJECT_NETWORK_ENV } from "../../utils/project-network-process.js";

const execFileAsync = promisify(execFile);

const LinuxProjectNetworkHelperStatusSchema = z
  .object({
    version: z.string().min(1),
    capability: z.string().min(1),
    privilege_active: z.boolean(),
    strict_ready: z.boolean(),
  })
  .strict();

export interface LinuxProjectNetworkHelperStatus {
  version: string;
  capability: string;
  privilegeActive: boolean;
  strictReady: boolean;
}

export function parseLinuxProjectNetworkHelperStatus(
  output: string,
): LinuxProjectNetworkHelperStatus {
  try {
    const parsed = LinuxProjectNetworkHelperStatusSchema.parse(JSON.parse(output));
    return {
      version: parsed.version,
      capability: parsed.capability,
      privilegeActive: parsed.privilege_active,
      strictReady: parsed.strict_ready,
    };
  } catch (error) {
    throw new Error("Invalid Linux network helper status", { cause: error });
  }
}

export interface LinuxProjectNetworkIsolationAdapterOptions {
  platform?: NodeJS.Platform;
  externalProxyAvailable?: boolean;
  helperPath: string | null | undefined;
  runStatus?: (helperPath: string) => Promise<string>;
  proxyServer?: Pick<ProjectEgressProxyServer, "start">;
  credentials?: Pick<ProjectEgressProxyCredentials, "issue">;
}

async function runHelperStatus(helperPath: string): Promise<string> {
  const result = await execFileAsync(helperPath, ["--status-json"], {
    encoding: "utf8",
    timeout: 2_000,
    windowsHide: true,
  });
  return result.stdout;
}

export class LinuxProjectNetworkIsolationAdapter implements ProjectNetworkIsolationAdapter {
  private readonly platform: NodeJS.Platform;
  private readonly externalProxyAvailable: boolean;
  private readonly helperPath: string | null;
  private readonly runStatus: (helperPath: string) => Promise<string>;
  private readonly proxyServer: Pick<ProjectEgressProxyServer, "start"> | null;
  private readonly credentials: Pick<ProjectEgressProxyCredentials, "issue"> | null;

  public constructor(options: LinuxProjectNetworkIsolationAdapterOptions) {
    this.platform = options.platform ?? process.platform;
    this.externalProxyAvailable = options.externalProxyAvailable ?? false;
    this.helperPath = options.helperPath?.trim() || null;
    this.runStatus = options.runStatus ?? runHelperStatus;
    this.proxyServer = options.proxyServer ?? null;
    this.credentials = options.credentials ?? null;
  }

  public async status(_projectId: string): Promise<"active" | "unavailable"> {
    if (this.platform !== "linux" || !this.externalProxyAvailable || !this.helperPath) {
      return "unavailable";
    }
    try {
      const status = parseLinuxProjectNetworkHelperStatus(await this.runStatus(this.helperPath));
      return status.privilegeActive && status.strictReady ? "active" : "unavailable";
    } catch {
      return "unavailable";
    }
  }

  public async prepare(input: {
    projectId: string;
    workspaceId?: string;
    source: string;
  }): Promise<Record<string, string>> {
    if (!this.helperPath || !this.proxyServer || !this.credentials) {
      throw new Error("Linux Project network isolation is not fully configured");
    }
    const proxy = await this.proxyServer.start();
    const credential = this.credentials.issue({
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : { projectId: input.projectId }),
      source: input.source,
    });
    return {
      [PROJECT_NETWORK_ENV.enabled]: "1",
      [PROJECT_NETWORK_ENV.helperPath]: this.helperPath,
      [PROJECT_NETWORK_ENV.proxyPort]: String(proxy.port),
      [PROJECT_NETWORK_ENV.proxyToken]: credential.token,
    };
  }
}
