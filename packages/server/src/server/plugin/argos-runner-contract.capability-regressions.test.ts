import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  argosBundledRunnerCandidates,
  assertArgosRunnerContract,
  resolveCompatibleArgosRunnerPath,
} from "./argos-runner-contract.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

async function runnerWithCommands(commands: readonly string[]): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "paseo-argos-runner-contract-"));
  directories.push(directory);
  const file = path.join(directory, "argos-alarm-runner.mjs");
  await writeFile(
    file,
    commands.map((command) => `if (subcommand === "${command}") {}`).join("\n"),
    "utf8",
  );
  return file;
}

describe("assertArgosRunnerContract", () => {
  it("accepts the deterministic commands used by the Paseo orchestrator", async () => {
    const runner = await runnerWithCommands([
      "prepare-single-troubleshoot-data",
      "publish-troubleshooting-doc",
      "publish-sop-doc",
      "validate-result-dir",
      "close-ready-work-items",
      "auto-troubleshoot-drain",
      "render-run-report",
    ]);

    await expect(assertArgosRunnerContract(runner)).resolves.toBeUndefined();
  });

  it("rejects an outdated runner before task execution", async () => {
    const runner = await runnerWithCommands(["prepare-single-troubleshoot-data"]);
    await expect(assertArgosRunnerContract(runner)).rejects.toThrow("Argos Runner 契约不兼容");
  });

  it("resolves the bundled Runner before falling back to a global installation", async () => {
    await expect(resolveCompatibleArgosRunnerPath()).resolves.toContain(
      "/skills/life-settle-ai-assistant/scripts/argos_alarm/argos-alarm-runner.mjs",
    );
  });

  it("includes the packaged dist/server/skills location used by the built daemon", () => {
    const moduleDirectory = path.join(
      "/repo",
      "packages",
      "server",
      "dist",
      "server",
      "server",
      "plugin",
    );
    expect(argosBundledRunnerCandidates(moduleDirectory)).toContain(
      path.join(
        "/repo",
        "packages",
        "server",
        "dist",
        "server",
        "skills",
        "life-settle-ai-assistant",
        "scripts",
        "argos_alarm",
        "argos-alarm-runner.mjs",
      ),
    );
  });
});
