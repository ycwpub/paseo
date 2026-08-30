import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo, Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, expect, test } from "vitest";
import type { HubExecutionAgents } from "./daemon-executions.js";
import { type HubConnectionState, HubRelationshipController, type HubRelationshipClock, type HubRelationshipRetryPolicy, type ScheduledRelationshipTask } from "./relationship-controller.js";
import { DirectHubRelationshipRemote } from "./relationship-remote.js";
const openServers: ReturnType<typeof createServer>[] = [];
const openUpgradeHubs: UpgradeRejectingHub[] = [];
const openPaseoHomes: string[] = [];
afterEach(async () => {
    for (const hub of openUpgradeHubs.splice(0))
        hub.destroyConnections();
    await Promise.all(openServers.splice(0).map((server) => closeServer(server)));
    await Promise.all(openPaseoHomes.splice(0).map((home) => rm(home, { recursive: true })));
});
test("controller redials once after a failed upgrade without also handling its close", async () => {
    const hub = await UpgradeRejectingHub.start([0, 401]);
    const clock = new ManualRelationshipClock();
    const controller = await connectController(hub, clock);
    await hub.expectAttemptReleased(1);
    await expectControllerState(controller, "reconnecting");
    expect(controller.status().state).toBe("reconnecting");
    expect(clock.scheduledAttempts()).toEqual([0]);
    expect(clock.pendingTasks()).toBe(1);
    clock.runNext();
    await hub.expectAttemptReleased(2);
    expect(hub.attemptCount()).toBe(2);
    expect(controller.status().state).toBe("revoked");
    expect(clock.pendingTasks()).toBe(0);
});
function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}
interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
}
function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((accept) => {
        resolve = accept;
    });
    return { promise, resolve };
}
class UpgradeRejectingHub {
    private readonly server = createServer(async (request, response) => {
        let body = "";
        for await (const chunk of request)
            body += chunk;
        const enrollment = JSON.parse(body) as {
            daemonId: string;
        };
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
            daemonId: enrollment.daemonId,
            scopes: ["hub.execution.*"],
            webSocketUrl: this.webSocketUrl,
        }));
    });
    private readonly sockets = new Set<Socket>();
    private readonly releasedAttempts = new Map<number, Deferred<void>>();
    private attemptObserved = deferred<void>();
    private attempts = 0;
    private constructor(private readonly statuses: Array<number | "stall">) {
        this.server.on("upgrade", (_request, socket) => {
            const attempt = ++this.attempts;
            this.attemptObserved.resolve();
            this.attemptObserved = deferred<void>();
            const released = deferred<void>();
            this.releasedAttempts.set(attempt, released);
            this.sockets.add(socket);
            socket.once("close", () => {
                this.sockets.delete(socket);
                released.resolve();
            });
            const status = this.statuses[attempt - 1] ?? this.statuses.at(-1) ?? 503;
            if (status === "stall") {
                socket.resume();
                return;
            }
            if (status === 0) {
                socket.destroy();
                return;
            }
            socket.end(`HTTP/1.1 ${status} Rejected\r\nContent-Length: 4\r\nConnection: close\r\n\r\ndeny`);
        });
    }
    static async start(statuses: Array<number | "stall">): Promise<UpgradeRejectingHub> {
        const hub = new UpgradeRejectingHub(statuses);
        openUpgradeHubs.push(hub);
        openServers.push(hub.server);
        await new Promise<void>((resolve, reject) => {
            hub.server.once("error", reject);
            hub.server.listen(0, "127.0.0.1", resolve);
        });
        return hub;
    }
    get webSocketUrl(): string {
        const address = this.server.address() as AddressInfo;
        return `ws://127.0.0.1:${address.port}/daemon`;
    }
    get origin(): string {
        const address = this.server.address() as AddressInfo;
        return `http://127.0.0.1:${address.port}`;
    }
    attemptCount(): number {
        return this.attempts;
    }
    openConnections(): number {
        return this.sockets.size;
    }
    destroyConnections(): void {
        for (const socket of this.sockets)
            socket.destroy();
    }
    async expectAttemptReleased(attempt: number): Promise<void> {
        while (this.attempts < attempt) {
            await withDeadline(this.attemptObserved.promise, `Hub did not receive socket attempt ${attempt}`);
        }
        const released = this.releasedAttempts.get(attempt);
        if (!released)
            throw new Error(`Hub did not receive socket attempt ${attempt}`);
        await withDeadline(released.promise, `Hub socket attempt ${attempt} remained open`);
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
}
class ManualRelationshipClock implements HubRelationshipClock, HubRelationshipRetryPolicy {
    private readonly tasks: Array<{
        cancelled: boolean;
        task: () => void;
    }> = [];
    private readonly attempts: number[] = [];
    now(): Date {
        return new Date("2026-07-13T00:00:00.000Z");
    }
    delay(attempt: number): number {
        this.attempts.push(attempt);
        return 0;
    }
    schedule(_delayMs: number, task: () => void): ScheduledRelationshipTask {
        const scheduled = { cancelled: false, task };
        this.tasks.push(scheduled);
        return { cancel: () => (scheduled.cancelled = true) };
    }
    pendingTasks(): number {
        return this.tasks.filter((task) => !task.cancelled).length;
    }
    scheduledAttempts(): number[] {
        return this.attempts.slice();
    }
    runNext(): void {
        const scheduled = this.tasks.shift();
        if (!scheduled || scheduled.cancelled)
            throw new Error("No Hub reconnect is scheduled");
        scheduled.task();
    }
}
const unusedExecutionAgents: HubExecutionAgents = {
    create: async () => {
        throw new Error("Unexpected Hub agent create");
    },
    subscribe: () => () => undefined,
    invalidateAuthority: async () => undefined,
};
async function connectController(hub: UpgradeRejectingHub, clock: ManualRelationshipClock): Promise<HubRelationshipController> {
    const paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-hub-socket-"));
    openPaseoHomes.push(paseoHome);
    const controller = new HubRelationshipController({
        paseoHome,
        hostname: "test-daemon.local",
        serverId: "server-1",
        daemonPublicKey: "daemon-public-key",
        logger: pino({ level: "silent" }),
        remote: new DirectHubRelationshipRemote(),
        clock,
        retryPolicy: clock,
        attachSocket: async () => undefined,
        createExecutionAgents: () => unusedExecutionAgents,
    });
    await controller.connect({ hubUrl: hub.origin, token: "enrollment-token" });
    return controller;
}
async function withDeadline<T>(promise: Promise<T>, message: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(message)), 2000);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
async function expectControllerState(controller: HubRelationshipController, expected: HubConnectionState): Promise<void> {
    await withDeadline((async () => {
        while (controller.status().state !== expected) {
            await new Promise<void>((resolve) => setImmediate(resolve));
        }
    })(), `Hub controller did not reach ${expected}`);
}
