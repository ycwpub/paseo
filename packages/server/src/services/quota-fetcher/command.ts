import { execFile } from "node:child_process";

export interface UsageCommandResult {
  stdout: string;
  stderr: string;
}

export type UsageCommandRunner = (
  file: string,
  args: readonly string[],
  options: {
    timeoutMs: number;
    maxBufferBytes: number;
  },
) => Promise<UsageCommandResult>;

export const runUsageCommand: UsageCommandRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      [...args],
      {
        timeout: options.timeoutMs,
        maxBuffer: options.maxBufferBytes,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });

export function usageCommandError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const candidate = error as Error & { stderr?: unknown };
  const stderr = typeof candidate.stderr === "string" ? candidate.stderr.trim() : "";
  const message = stderr || error.message;
  const compact = message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/giu, "Bearer [REDACTED]")
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[REDACTED_JWT]")
    .replace(/\s+/g, " ")
    .trim();
  return compact.length > 300 ? `${compact.slice(0, 297)}...` : compact;
}
