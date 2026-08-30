import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { allocateWorkspaceServicePort } from "./workspace-service-port-allocator.js";
describe("allocateWorkspaceServicePort", () => {
    const tempDirs: string[] = [];
    afterEach(() => {
        for (const tempDir of tempDirs.splice(0)) {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
    it("passes service and workspace context to portScript", async () => {
        const tempDir = mkdtempSync(join(tmpdir(), "workspace-service-port-allocator-"));
        tempDirs.push(tempDir);
        const port = await getFreePort();
        const scriptPath = createContextPortScript(tempDir, port);
        await expect(allocateWorkspaceServicePort({
            allocation: { range: "1-1", portScript: scriptPath },
            cwd: tempDir,
            scriptName: "app-server",
            workspaceId: "wks_port_allocator",
            branchName: "feature/allocator-context",
        })).resolves.toBe(port);
        expect(readFileSync(join(tempDir, "cwd"), "utf8")).toBe(realpathSync(tempDir));
        expect(readFileSync(join(tempDir, "argv"), "utf8")).toBe(`app-server|wks_port_allocator|feature/allocator-context|${tempDir}`);
        expect(readFileSync(join(tempDir, "env"), "utf8")).toBe(`app-server|wks_port_allocator|feature/allocator-context|${tempDir}`);
    });
    function createContextPortScript(tempDir: string, port: number): string {
        const contents = process.platform === "win32"
            ? `@echo off\r\n<nul set /p "=%CD%" > cwd\r\n<nul set /p "=%~1|%~2|%~3|%~4" > argv\r\n<nul set /p "=%PASEO_SCRIPTNAME%|%PASEO_WORKSPACE_ID%|%PASEO_BRANCH_NAME%|%PASEO_WORKTREE_PATH%" > env\r\necho ${port}\r\n`
            : `#!/bin/sh\nprintf '%s' "$PWD" > cwd\nprintf '%s|%s|%s|%s' "$1" "$2" "$3" "$4" > argv\nprintf '%s|%s|%s|%s' "$PASEO_SCRIPTNAME" "$PASEO_WORKSPACE_ID" "$PASEO_BRANCH_NAME" "$PASEO_WORKTREE_PATH" > env\nprintf '${port}\\n'\n`;
        return writePortScript(tempDir, contents);
    }
    function writePortScript(tempDir: string, contents: string): string {
        const fileName = process.platform === "win32" ? "portmake.cmd" : "portmake";
        const scriptPath = join(tempDir, fileName);
        writeFileSync(scriptPath, contents);
        if (process.platform !== "win32")
            chmodSync(scriptPath, 0o755);
        return scriptPath;
    }
});
function getFreePort(): Promise<number> {
    const server = net.createServer();
    return new Promise((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            if (!address || typeof address === "string") {
                reject(new Error("Expected TCP server address"));
                return;
            }
            server.close((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(address.port);
            });
        });
        server.on("error", reject);
    });
}
