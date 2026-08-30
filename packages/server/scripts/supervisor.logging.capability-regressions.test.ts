import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { describe, expect, test } from "vitest";
const repoRoot = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const supervisorPath = fileURLToPath(new URL("./supervisor.ts", import.meta.url));
async function runSupervisorFixture(options: {
    workerSource: string;
    restartOnCrash?: boolean;
    timeoutMs?: number;
    workerHeartbeat?: {
        intervalMs?: number;
    };
}): Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    elapsedMs: number;
    log: string;
    stdout: string;
    stderr: string;
}> {
    const tempDir = await mkdtemp(path.join(tmpdir(), "paseo-supervisor-log-"));
    const logPath = path.join(tempDir, "daemon.log");
    const workerPath = path.join(tempDir, "worker.mjs");
    const runnerPath = path.join(tempDir, "runner.mjs");
    await writeFile(workerPath, options.workerSource);
    await writeFile(runnerPath, `
      import { runSupervisor } from ${JSON.stringify(pathToFileURL(supervisorPath).href)};

      runSupervisor({
        name: "TestSupervisor",
        startupMessage: "starting fixture",
        resolveWorkerEntry: () => ${JSON.stringify(workerPath)},
        workerArgs: [],
        workerEnv: process.env,
        workerExecArgv: [],
        restartOnCrash: ${JSON.stringify(options.restartOnCrash ?? false)},
        workerHeartbeat: ${JSON.stringify(options.workerHeartbeat)},
        logFile: {
          path: ${JSON.stringify(logPath)},
          rotate: { maxSize: "1m", maxFiles: 2 },
        },
      });
    `);
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["--import", "tsx", runnerPath], {
        cwd: repoRoot,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
        stderr += chunk;
    });
    const { code, signal } = await new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
    }>((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("supervisor fixture timed out"));
        }, options.timeoutMs ?? 10000);
        child.on("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on("close", (exitCode, exitSignal) => {
            clearTimeout(timeout);
            resolve({ code: exitCode, signal: exitSignal });
        });
    });
    const log = await readFile(logPath, "utf8");
    return { code, signal, elapsedMs: Date.now() - startedAt, log, stdout, stderr };
}
describe("supervisor durable logging", () => {
    test("does not restart a worker based on heartbeat absence", async () => {
        const result = await runSupervisorFixture({
            timeoutMs: 10000,
            workerHeartbeat: {
                intervalMs: 250,
            },
            workerSource: `
        import { existsSync, writeFileSync } from "node:fs";

        const marker = process.argv[1] + ".started";
        if (!existsSync(marker)) {
          writeFileSync(marker, "started");
          setTimeout(() => {
            process.send?.({ type: "paseo:shutdown", reason: "silent_worker_test_complete" });
          }, 2_000);
          setInterval(() => {}, 1_000);
        } else {
          process.send?.({ type: "paseo:shutdown", reason: "unexpected_silent_worker_restart" });
          setInterval(() => {}, 1_000);
        }
      `,
        });
        expect(result.code).toBe(0);
        expect(result.signal).toBeNull();
        expect(result.log).toContain('"reason":"silent_worker_test_complete"');
        expect(result.log).not.toContain('"reason":"unexpected_silent_worker_restart"');
        expect(result.log).not.toContain('"msg":"Worker heartbeat timed out; restarting worker"');
    }, 10000);
});
