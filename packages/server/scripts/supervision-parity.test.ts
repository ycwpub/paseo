import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("supervision parity", () => {
  test("has exactly one runtime callsite for runSupervisor", () => {
    const daemonRunner = readFileSync(
      new URL("./supervisor-entrypoint.ts", import.meta.url),
      "utf8",
    );
    const devRunner = readFileSync(new URL("./dev-runner.ts", import.meta.url), "utf8");

    const daemonRunnerCalls = (daemonRunner.match(/\brunSupervisor\s*\(/g) ?? []).length;
    const devRunnerCalls = (devRunner.match(/\brunSupervisor\s*\(/g) ?? []).length;

    expect(daemonRunnerCalls + devRunnerCalls).toBe(1);
  });

  test("supervisor worker implementation is not server/index", () => {
    const daemonRunner = readFileSync(
      new URL("./supervisor-entrypoint.ts", import.meta.url),
      "utf8",
    );

    expect(daemonRunner).toContain("daemon-worker");
    expect(daemonRunner).not.toContain("server/server/index.js");
    expect(daemonRunner).not.toContain("src/server/index.ts");
  });

  test("supervisor heartbeat keeps worker shutdown monitoring without a restart watchdog", () => {
    const supervisor = readFileSync(new URL("./supervisor.ts", import.meta.url), "utf8");
    const daemonWorker = readFileSync(
      new URL("../src/server/daemon-worker.ts", import.meta.url),
      "utf8",
    );

    expect(supervisor).toContain('"paseo:supervisor-heartbeat"');
    expect(supervisor).not.toContain("Worker heartbeat timed out; restarting worker");
    expect(supervisor).not.toContain("worker_heartbeat_timeout");
    expect(daemonWorker).toContain('"paseo:supervisor-heartbeat"');
  });

  test("dev runner waits asynchronously for supervisor shutdown", () => {
    const devRunner = readFileSync(new URL("./dev-runner.ts", import.meta.url), "utf8");

    expect(devRunner).toContain('import { spawn } from "node:child_process"');
    expect(devRunner).not.toContain("spawnSync");
    expect(devRunner).toContain('supervisor.on("exit"');
  });

  test("npm dev script runs dev-runner as the signal-handling node process", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { scripts?: Record<string, string> };

    const devScript = packageJson.scripts?.dev ?? "";

    expect(devScript).toContain("node --import tsx scripts/dev-runner.ts");
    expect(devScript).not.toMatch(/^cross-env NODE_ENV=development tsx scripts\/dev-runner\.ts$/);
  });
});
