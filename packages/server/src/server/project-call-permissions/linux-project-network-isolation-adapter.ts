import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { ProjectNetworkIsolationAdapter } from "./project-network-enforcer.js";

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
  helperPath: string | null | undefined;
  runStatus?: (helperPath: string) => Promise<string>;
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
  private readonly helperPath: string | null;
  private readonly runStatus: (helperPath: string) => Promise<string>;

  public constructor(options: LinuxProjectNetworkIsolationAdapterOptions) {
    this.platform = options.platform ?? process.platform;
    this.helperPath = options.helperPath?.trim() || null;
    this.runStatus = options.runStatus ?? runHelperStatus;
  }

  public async status(_projectId: string): Promise<"active" | "unavailable"> {
    if (this.platform !== "linux" || !this.helperPath) return "unavailable";
    try {
      const status = parseLinuxProjectNetworkHelperStatus(await this.runStatus(this.helperPath));
      return status.privilegeActive && status.strictReady ? "active" : "unavailable";
    } catch {
      return "unavailable";
    }
  }
}
