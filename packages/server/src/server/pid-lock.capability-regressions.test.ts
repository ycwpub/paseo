import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { acquirePidLock, getPidLockInfo } from "./pid-lock.js";
describe("pid-lock ownership", () => {
    test("persists desktop build id for desktop-managed daemons", async () => {
        const paseoHome = await mkdtemp(join(tmpdir(), "paseo-pid-lock-desktop-build-"));
        const ownerPid = process.pid + 10000;
        const originalDesktopManaged = process.env.PASEO_DESKTOP_MANAGED;
        const originalDesktopBuildId = process.env.PASEO_DESKTOP_BUILD_ID;
        try {
            process.env.PASEO_DESKTOP_MANAGED = "1";
            process.env.PASEO_DESKTOP_BUILD_ID = "test-build-id";
            await acquirePidLock(paseoHome, "127.0.0.1:6769", { ownerPid });
            const lock = await getPidLockInfo(paseoHome);
            expect(lock?.desktopManaged).toBe(true);
            expect(lock?.desktopBuildId).toBe("test-build-id");
        }
        finally {
            if (originalDesktopManaged === undefined) {
                delete process.env.PASEO_DESKTOP_MANAGED;
            }
            else {
                process.env.PASEO_DESKTOP_MANAGED = originalDesktopManaged;
            }
            if (originalDesktopBuildId === undefined) {
                delete process.env.PASEO_DESKTOP_BUILD_ID;
            }
            else {
                process.env.PASEO_DESKTOP_BUILD_ID = originalDesktopBuildId;
            }
            await rm(paseoHome, { recursive: true, force: true });
        }
    });
});
