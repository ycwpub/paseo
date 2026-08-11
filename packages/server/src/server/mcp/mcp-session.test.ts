import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { McpSession } from "./mcp-session.js";
import { McpStore } from "./mcp-store.js";

describe("McpSession", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  test("refreshes shared resources before returning the MCP list", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-mcp-session-"));
    const store = new McpStore({ paseoHome: tempRoot, logger: createTestLogger() });
    const emitted: SessionOutboundMessage[] = [];
    const refreshSharedResources = vi.fn(() => {
      store.create({
        name: "new-server",
        transport: { type: "stdio", command: "new-server" },
      });
    });
    const session = new McpSession({
      host: { emit: (message) => emitted.push(message) },
      store,
      refreshSharedResources,
      logger: createTestLogger(),
    });

    await session.handleRequest({
      type: "mcp.list.request",
      requestId: "request-1",
      refresh: true,
    });

    expect(refreshSharedResources).toHaveBeenCalledOnce();
    expect(emitted).toContainEqual({
      type: "mcp.list.response",
      payload: {
        requestId: "request-1",
        servers: [expect.objectContaining({ name: "new-server" })],
        error: null,
      },
    });
  });
});
