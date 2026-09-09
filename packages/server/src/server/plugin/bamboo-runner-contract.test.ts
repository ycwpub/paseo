import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertBambooRunnerContract } from "./bamboo-runner-contract.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

async function runnerWithContract(commands: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-bamboo-runner-contract-"));
  temporaryDirectories.push(directory);
  const runnerPath = path.join(directory, "bamboo-alert-runner.mjs");
  await mkdir(directory, { recursive: true });
  await writeFile(runnerPath, "export {};\n", "utf8");
  await writeFile(
    path.join(directory, "bamboo-alert-runner-contracts.mjs"),
    `export const commands = ${JSON.stringify(commands.map((name) => ({ name })))};\n`,
    "utf8",
  );
  return runnerPath;
}

describe("assertBambooRunnerContract", () => {
  it("accepts a Runner that exposes every command used by Paseo", async () => {
    const runnerPath = await runnerWithContract([
      "prepare-single-troubleshoot-data",
      "publish-troubleshooting-doc",
      "publish-sop-doc",
      "validate-model-result-json",
      "validate-result-dir",
      "close-ready-work-items",
      "auto-troubleshoot-drain",
      "final-drain-check",
      "render-run-report",
    ]);

    await expect(assertBambooRunnerContract(runnerPath)).resolves.toBeUndefined();
  });

  it("fails before execution when the installed Runner is too old", async () => {
    const runnerPath = await runnerWithContract(["prepare-single-troubleshoot-data"]);
    await expect(assertBambooRunnerContract(runnerPath)).rejects.toThrow(
      "Bamboo Runner 契约不兼容",
    );
  });
});
