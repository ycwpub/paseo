import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import pino from "pino";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createPaseoDaemon, type PaseoDaemonConfig } from "./bootstrap.js";
import { generateLocalPairingOffer } from "./pairing-offer.js";
import { createTestAgentClients } from "./test-utils/fake-agent-client.js";
import { DaemonClient } from "./test-utils/daemon-client.js";
import { isPlatform } from "../test-utils/platform.js";
import type { HubEnrollment, HubEnrollmentResult, HubRelationshipRemote, HubRevocation, HubSocketConnection, HubSocketCredentials, HubSocketEvents } from "./hub/relationship-remote.js";
describe("paseo daemon bootstrap", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });
    test("relay config changes during Hub enrollment reach the live runtime", async () => {
        const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), "paseo-relay-startup-"));
        const paseoHome = path.join(paseoHomeRoot, ".paseo");
        const staticDir = await mkdtemp(path.join(os.tmpdir(), "paseo-static-"));
        await mkdir(paseoHome, { recursive: true });
        await writeFile(path.join(paseoHome, "hub-relationship.json"), `${JSON.stringify({
            version: 1,
            state: "pending",
            relationship: {
                daemonId: "daemon-startup-race",
                idempotencyKey: "enrollment-startup-race",
                hubOrigin: "https://hub.test",
                createdAt: "2026-07-31T00:00:00.000Z",
                scopes: ["hub.execution.*"],
            },
            credential: { secret: "credential" },
            enrollment: { token: "enrollment-token" },
            identity: { serverId: "server-startup-race", daemonPublicKey: "public-key" },
        })}\n`, "utf-8");
        let markEnrollmentStarted: () => void = () => undefined;
        const enrollmentStarted = new Promise<void>((resolve) => {
            markEnrollmentStarted = resolve;
        });
        let releaseEnrollment: () => void = () => undefined;
        const enrollmentReleased = new Promise<void>((resolve) => {
            releaseEnrollment = resolve;
        });
        const remote: HubRelationshipRemote = {
            async enroll(input: HubEnrollment): Promise<HubEnrollmentResult> {
                markEnrollmentStarted();
                await enrollmentReleased;
                return {
                    daemonId: input.daemonId,
                    scopes: input.scopes,
                    webSocketUrl: "wss://hub.test/daemon",
                };
            },
            async revoke(_input: HubRevocation): Promise<void> { },
            openSocket(_input: HubSocketCredentials, _events: HubSocketEvents): HubSocketConnection {
                return { close: () => undefined };
            },
        };
        const config: PaseoDaemonConfig = {
            listen: "127.0.0.1:0",
            paseoHome,
            corsAllowedOrigins: [],
            hostnames: true,
            mcpEnabled: false,
            staticDir,
            mcpDebug: false,
            agentClients: createTestAgentClients(),
            agentStoragePath: path.join(paseoHome, "agents"),
            relayEnabled: false,
            relayEndpoint: "127.0.0.1:9",
            relayUseTls: false,
            appBaseUrl: "https://app.paseo.sh",
            openai: undefined,
            speech: undefined,
        };
        const daemon = await createPaseoDaemon(config, pino({ level: "silent" }), {
            hubRelationshipRemote: remote,
        });
        const starting = daemon.start();
        let client: DaemonClient | null = null;
        try {
            await enrollmentStarted;
            const listenTarget = daemon.getListenTarget();
            if (!listenTarget || listenTarget.type !== "tcp") {
                throw new Error("Expected daemon TCP listener during Hub enrollment");
            }
            client = new DaemonClient({
                url: `ws://127.0.0.1:${listenTarget.port}/ws`,
                appVersion: "0.1.82",
            });
            await client.connect();
            await client.patchDaemonConfig({
                relay: {
                    endpoints: [{ endpoint: "127.0.0.1:9", useTls: false }],
                },
            });
            releaseEnrollment();
            await starting;
            const status = await client.getDaemonStatus();
            expect(status.relay?.enabled).toBe(true);
        }
        finally {
            releaseEnrollment();
            await starting.catch(() => undefined);
            await client?.close().catch(() => undefined);
            await daemon.stop().catch(() => undefined);
            await rm(paseoHomeRoot, { recursive: true, force: true });
            await rm(staticDir, { recursive: true, force: true });
        }
    });
    // POSIX-only: Unix socket listen paths are invalid Windows listen targets.
    test.skipIf(isPlatform("win32"))("generates a relay pairing offer for unix socket listeners", async () => {
        const paseoHomeRoot = await mkdtemp(path.join(os.tmpdir(), "paseo-socket-relay-"));
        const paseoHome = path.join(paseoHomeRoot, ".paseo");
        const staticDir = await mkdtemp(path.join(os.tmpdir(), "paseo-static-"));
        const socketPath = path.join(paseoHomeRoot, "run", "paseo.sock");
        await mkdir(path.dirname(socketPath), { recursive: true });
        await mkdir(paseoHome, { recursive: true });
        const logger = pino({ level: "silent" });
        const config: PaseoDaemonConfig = {
            listen: socketPath,
            paseoHome,
            corsAllowedOrigins: [],
            hostnames: true,
            mcpEnabled: false,
            staticDir,
            mcpDebug: false,
            agentClients: createTestAgentClients(),
            agentStoragePath: path.join(paseoHome, "agents"),
            relayEnabled: true,
            relayEndpoint: "127.0.0.1:9",
            relayPublicEndpoint: "127.0.0.1:9",
            appBaseUrl: "https://app.paseo.sh",
            openai: undefined,
            speech: undefined,
        };
        const daemon = await createPaseoDaemon(config, logger);
        try {
            await daemon.start();
            const pairing = await generateLocalPairingOffer({
                paseoHome,
                relayEnabled: true,
                relayEndpoint: "127.0.0.1:9",
                relayPublicEndpoint: "127.0.0.1:9",
                appBaseUrl: "https://app.paseo.sh",
                includeQr: false,
            });
            expect(pairing.relayEnabled).toBe(true);
            expect(pairing.url?.startsWith("http://127.0.0.1:9/#offer=")).toBe(true);
        }
        finally {
            await daemon.stop().catch(() => undefined);
            await daemon.agentManager.flush().catch(() => undefined);
            await rm(paseoHomeRoot, { recursive: true, force: true });
            await rm(staticDir, { recursive: true, force: true });
        }
    });
});
