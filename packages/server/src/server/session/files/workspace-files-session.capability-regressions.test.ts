import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import pino from "pino";
import { WorkspaceFilesSession, type WorkspaceFilesSessionHost } from "./workspace-files-session.js";
import { DownloadTokenStore } from "../../file-download/token-store.js";
import type { SessionOutboundMessage } from "../../messages.js";
const tempDirs: string[] = [];
afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true });
    }
});
function makeDir(prefix: string): string {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
    tempDirs.push(dir);
    return dir;
}
function makeSubsystem(options: {
    hasBinaryChannel?: boolean;
    emitBinary?: (frame: Uint8Array) => Promise<void> | void;
} = {}) {
    const emitted: SessionOutboundMessage[] = [];
    const binary: Uint8Array[] = [];
    let hasBinary = options.hasBinaryChannel ?? false;
    const host: WorkspaceFilesSessionHost = {
        emit: (msg) => emitted.push(msg),
        emitBinary: async (frame) => {
            binary.push(frame);
            await options.emitBinary?.(frame);
        },
        hasBinaryChannel: () => hasBinary,
    };
    const paseoHome = makeDir("workspace-files-home-");
    const subsystem = new WorkspaceFilesSession({
        host,
        downloadTokenStore: new DownloadTokenStore({ ttlMs: 60000 }),
        paseoHome,
        logger: pino({ level: "silent" }),
    });
    return {
        subsystem,
        emitted,
        binary,
        paseoHome,
        setHasBinary: (value: boolean) => {
            hasBinary = value;
        },
    };
}
describe("WorkspaceFilesSession", () => {
    test("marks a missing directory without exposing a raw filesystem error code", async () => {
        const cwd = makeDir("workspace-files-missing-");
        const { subsystem, emitted } = makeSubsystem();
        await subsystem.handleFileExplorerRequest({
            type: "file_explorer_request",
            cwd,
            path: "missing",
            mode: "list",
            requestId: "req-missing",
        });
        expect(emitted).toHaveLength(1);
        const message = emitted[0];
        if (message.type !== "file_explorer_response") {
            throw new Error(`expected file_explorer_response, got ${message.type}`);
        }
        expect(message.payload).toMatchObject({
            directory: null,
            errorCode: "not_found",
            requestId: "req-missing",
        });
    });
});
