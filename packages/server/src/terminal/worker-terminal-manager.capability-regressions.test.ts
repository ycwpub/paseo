import { afterEach, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createWorkerTerminalManager } from "./worker-terminal-manager.js";
import type { TerminalManager } from "./terminal-manager.js";
import { type TerminalSession } from "./terminal.js";
function nodeTerminalCommand(script: string): {
    command: string;
    args: string[];
} {
    return {
        command: process.execPath,
        args: ["-e", script],
    };
}
async function waitForCondition(predicate: () => boolean | Promise<boolean>, timeoutMs: number, intervalMs = 25): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}
let manager: TerminalManager | null = null;
const temporaryDirs: string[] = [];
const terminalSessions: TerminalSession[] = [];
function trackTerminal(session: TerminalSession): TerminalSession {
    terminalSessions.push(session);
    return session;
}
async function removeTemporaryDir(dir: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            rmSync(dir, { recursive: true, force: true });
            return;
        }
        catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw lastError;
}
afterEach(async () => {
    const sessions = terminalSessions.splice(0);
    await Promise.all(sessions.map((session) => session
        .killAndWait({
        gracefulTimeoutMs: 1000,
        forceTimeoutMs: 500,
    })
        .catch(() => { })));
    manager?.killAll();
    manager = null;
    while (temporaryDirs.length > 0) {
        const dir = temporaryDirs.pop();
        if (dir) {
            await removeTemporaryDir(dir);
        }
    }
});
it("keeps registered cwd env inheritance behind the worker manager interface", async () => {
    manager = createWorkerTerminalManager();
    const cwd = mkdtempSync(join(tmpdir(), "worker-terminal-manager-env-"));
    temporaryDirs.push(cwd);
    const markerPath = join(cwd, "env.txt");
    manager.registerCwdEnv({
        cwd,
        env: { PASEO_WORKER_TERMINAL_TEST: "worker-env" },
    });
    trackTerminal(await manager.createTerminal({
        workspaceId: "ws-test",
        cwd,
        ...nodeTerminalCommand(`
      require("node:fs").writeFileSync(
        ${JSON.stringify(markerPath)},
        process.env.PASEO_WORKER_TERMINAL_TEST ?? "",
      );
      setInterval(() => {}, 1000);
    `),
    }));
    await waitForCondition(() => existsSync(markerPath), 20000);
    expect(readFileSync(markerPath, "utf8")).toBe("worker-env");
});
