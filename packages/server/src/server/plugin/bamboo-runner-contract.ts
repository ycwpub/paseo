import { constants } from "node:fs";
import { access, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_RUNNER_COMMANDS = [
  "prepare-single-troubleshoot-data",
  "publish-troubleshooting-doc",
  "publish-sop-doc",
  "validate-model-result-json",
  "validate-result-dir",
  "close-ready-work-items",
  "auto-troubleshoot-drain",
  "final-drain-check",
  "render-run-report",
] as const;

function executableCandidates(name: string): string[] {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((directory) => path.join(directory, name));
}

async function nvmExecutableCandidates(name: string): Promise<string[]> {
  const versionsRoot = path.join(homedir(), ".nvm", "versions", "node");
  try {
    const versions = await readdir(versionsRoot);
    return versions
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((version) => path.join(versionsRoot, version, "bin", name));
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
    path.join(packageRoot, "skills", "bamboo", "scripts", "bamboo-alert-runner.mjs"),
    path.join(packageRoot, "scripts", "bamboo", "bamboo-alert-runner.mjs"),
  ]);
}

export async function assertBambooRunnerContract(runnerPath: string): Promise<void> {
  const contractPath = path.join(path.dirname(runnerPath), "bamboo-alert-runner-contracts.mjs");
  let contractSource: string;
  try {
    contractSource = await readFile(contractPath, "utf8");
  } catch (error) {
    throw new Error(`Bamboo Runner 缺少机器可读契约：${contractPath}`, { cause: error });
  }
  const missing = REQUIRED_RUNNER_COMMANDS.filter(
    (command) =>
      !new RegExp(`(?:name|["']name["'])\\s*:\\s*["']${command}["']`, "u").test(contractSource),
  );
  if (missing.length > 0) {
    throw new Error(`Bamboo Runner 契约不兼容，缺少命令：${missing.join(", ")}`);
  }
}

export async function resolveCompatibleBambooRunnerPath(): Promise<string> {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const bundled = await existingFile([
    process.env.PASEO_BAMBOO_ALERT_RUNNER_PATH ?? "",
    path.resolve(
      moduleDirectory,
      "../skills/life-settle-ai-assistant/scripts/bamboo/bamboo-alert-runner.mjs",
    ),
    path.resolve(
      moduleDirectory,
      "../../../../../skills/life-settle-ai-assistant/scripts/bamboo/bamboo-alert-runner.mjs",
    ),
  ]);
  const runnerPath = bundled ?? (await runnerFromCliExecutable());
  if (!runnerPath) {
    throw new Error(
      "未找到兼容的 Bamboo Runner；请重新安装 Paseo，或安装 life-settle-ai-assistant",
    );
  }
  await assertBambooRunnerContract(runnerPath);
  return runnerPath;
}
