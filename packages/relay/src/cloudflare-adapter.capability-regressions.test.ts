import { describe, expect, it, vi } from "vitest";
import { RelayDurableObject } from "./cloudflare-adapter.js";
type DurableObjectStateArg = ConstructorParameters<typeof RelayDurableObject>[0];
type MockSocket = WebSocket & {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    serializeAttachment: ReturnType<typeof vi.fn>;
    deserializeAttachment: ReturnType<typeof vi.fn>;
};
function createMockSocket(attachment: unknown = null): MockSocket {
    let storedAttachment = attachment;
    return {
        send: vi.fn(),
        close: vi.fn(),
        serializeAttachment: vi.fn((value: unknown) => {
            storedAttachment = value;
        }),
        deserializeAttachment: vi.fn(() => storedAttachment),
    } as unknown as MockSocket;
}
function createMockState() {
    const socketsByTag = new Map<string, WebSocket[]>();
    const state = {
        acceptWebSocket: vi.fn(),
        getWebSockets: vi.fn((tag?: string): WebSocket[] => {
            if (!tag) {
                const out: WebSocket[] = [];
                for (const sockets of socketsByTag.values())
                    out.push(...sockets);
                return out;
            }
            return socketsByTag.get(tag) ?? [];
        }),
    };
    return {
        state,
        setTagSockets: (tag: string, sockets: WebSocket[]) => {
            socketsByTag.set(tag, sockets);
        },
    };
}
async function withMockWebSocketPair(run: (sockets: {
    clientWs: MockSocket;
    serverWs: MockSocket;
}) => Promise<void> | void): Promise<void> {
    const serverWs = createMockSocket();
    const clientWs = createMockSocket();
    const WebSocketPairMock = class {
        [index: number]: WebSocket;
        constructor() {
            this[0] = clientWs as unknown as WebSocket;
            this[1] = serverWs as unknown as WebSocket;
        }
    };
    const previousPair = (globalThis as unknown as {
        WebSocketPair?: unknown;
    }).WebSocketPair;
    (globalThis as unknown as {
        WebSocketPair: unknown;
    }).WebSocketPair = WebSocketPairMock;
    try {
        await run({ clientWs, serverWs });
    }
    finally {
        if (previousPair === undefined) {
            delete (globalThis as unknown as {
                WebSocketPair?: unknown;
            }).WebSocketPair;
        }
        else {
            (globalThis as unknown as {
                WebSocketPair: unknown;
            }).WebSocketPair = previousPair;
        }
    }
}
const swallow = () => undefined;
describe("RelayDurableObject versioning", () => {
    it("assigns a connectionId when v2 client connects without one", async () => {
        const { state } = createMockState();
        await withMockWebSocketPair(async ({ serverWs }) => {
            const relay = new RelayDurableObject(state as unknown as DurableObjectStateArg);
            const req = new Request("https://relay.test/ws?role=client&serverId=srv_test&v=2", {
                headers: {
                    Upgrade: "websocket",
                    "cf-connecting-ip": "203.0.113.8",
                },
            });
            await relay.fetch(req).catch(swallow);
            expect(state.acceptWebSocket).toHaveBeenCalled();
            const attachment = serverWs.deserializeAttachment();
            expect(attachment).toMatchObject({
                role: "client",
                connectionId: expect.stringMatching(/^conn_/),
                remoteAddress: "203.0.113.8",
                remotePort: null,
            });
            expect(attachment).not.toHaveProperty("userAgent");
        });
    });
});
