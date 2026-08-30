import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestPaseoDaemon } from "./test-utils/paseo-daemon.js";
const originalEnv = { ...process.env };
const CORRECT_PASSWORD_HASH = "$2b$12$OLxyuuP9uLK30Uzc4wQX0O6liuU/Q1t5P2b0Ebf36mULvpVK3DRZW";
describe("daemon bearer auth", () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        process.env = { ...originalEnv, PASEO_SUPERVISED: "0" };
    });
    test("bypasses bearer auth for preflight and liveness endpoints", async () => {
        const daemonHandle = await createTestPaseoDaemon({
            auth: { password: CORRECT_PASSWORD_HASH },
        });
        try {
            const preflight = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/files/download`, {
                method: "OPTIONS",
                headers: { Origin: "https://app.paseo.sh" },
            });
            expect(preflight.status).toBe(204);
            const health = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/health`);
            expect(health.status).toBe(200);
            const oauthCallback = await fetch(`http://127.0.0.1:${daemonHandle.port}/oauth/lark?code=test&state=invalid`);
            expect(oauthCallback.status).toBe(400);
            expect(oauthCallback.headers.get("content-type")).toContain("text/html");
            const status = await fetch(`http://127.0.0.1:${daemonHandle.port}/api/status`);
            expect(status.status).toBe(401);
        }
        finally {
            await daemonHandle.close();
        }
    });
});
