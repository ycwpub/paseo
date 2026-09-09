import { constants } from "node:fs";
import { access, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_COMMANDS = [
  "prepare-single-troubleshoot-data",
  "publish-troubleshooting-doc",
  "publish-sop-doc",
  "validate-result-dir",
  "close-ready-work-items",
  "auto-troubleshoot-drain",
  "render-run-report",
] as const;

function executableCandidates(name: string): string[] {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, name));
}

async function nvmExecutableCandidates(name: string): Promise<string[]> {
  try {
    return (await readdir(path.join(homedir(), ".nvm", "versions", "node")))
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((version) => path.join(homedir(), ".nvm", "versions", "node", version, "bin", name));
  } catch {
    return [];
  }
}

async function existingFile(candidates: readonly string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate, constants.R_OK);
      return realpath(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

async function runnerFromCliExecutable(): Promise<string | null> {
  const executable = await existingFile([
    ...executableCandidates("life-settle-ai-assistant"),
    ...(await nvmExecutableCandidates("life-settle-ai-assistant")),
  ]);
  if (!executable) return null;
  const packageRoot = path.dirname(path.dirname(executable));
  return existingFile([
    path.join(packageRoot, "skills", "argos_alarm", "scripts", "argos-alarm-runner.mjs"),
    path.join(packageRoot, "scripts", "argos_alarm", "argos-alarm-runner.mjs"),
  ]);
}

export async function assertArgosRunnerContract(runnerPath: string): Promise<void> {
  const source = await readFile(runnerPath, "utf8");
  const missing = REQUIRED_COMMANDS.filter(
    (command) => !source.includes(`subcommand === "${command}"`),
  );
  if (missing.length > 0) {
    throw new Error(`Argos Runner 契约不兼容，缺少命令：${missing.join("、")}`);
  }
}

export function argosBundledRunnerCandidates(moduleDirectory: string): string[] {
  const runnerRelativePath = path.join(
    "skills",
    "life-settle-ai-assistant",
    "scripts",
    "argos_alarm",
    "argos-alarm-runner.mjs",
  );
  return [
    path.resolve(moduleDirectory, "..", runnerRelativePath),
    path.resolve(moduleDirectory, "..", "..", runnerRelativePath),
    path.resolve(moduleDirectory, "..", "..", "..", "..", "..", runnerRelativePath),
  ];
}

export async function resolveCompatibleArgosRunnerPath(): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bundled = await existingFile([
    process.env.PASEO_ARGOS_ALERT_RUNNER_PATH ?? "",
    ...argosBundledRunnerCandidates(moduleDirectory),
  ]);
  const runnerPath = bundled ?? (await runnerFromCliExecutable());
  if (!runnerPath) {
    throw new Error("未找到兼容的 Argos Runner；请重新安装 Paseo，或安装 life-settle-ai-assistant");
  }
  await assertArgosRunnerContract(runnerPath);
  return runnerPath;
}
