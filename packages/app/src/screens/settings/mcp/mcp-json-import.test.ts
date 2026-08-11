import { describe, expect, it } from "vitest";
import {
  buildMcpOriginalJson,
  normalizeStdioTransport,
  parseMcpJsonImport,
} from "./mcp-json-import";

describe("parseMcpJsonImport", () => {
  it("parses Claude/Codex style mcpServers objects", () => {
    const result = parseMcpJsonImport({
      mcpServers: {
        weather: {
          command: "uv",
          args: ["run", "weather.py"],
          env: { API_KEY: "secret" },
          description: "Weather tools",
        },
        docs: {
          type: "http",
          url: "https://example.com/mcp",
          headers: { Authorization: "Bearer token" },
        },
      },
    });

    expect(result.isValid).toBe(true);
    if (!result.isValid) return;
    expect(result.servers).toHaveLength(2);
    expect(result.servers[0]).toMatchObject({
      name: "weather",
      description: "Weather tools",
      transport: {
        type: "stdio",
        command: "uv",
        args: ["run", "weather.py"],
        env: { API_KEY: "secret" },
      },
    });
    expect(result.servers[1]).toMatchObject({
      name: "docs",
      transport: {
        type: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: "Bearer token" },
      },
    });
  });

  it("parses array imports with a name field", () => {
    const result = parseMcpJsonImport([
      {
        name: "linear",
        transport: {
          type: "sse",
          url: "https://example.com/sse",
        },
      },
    ]);

    expect(result).toMatchObject({
      isValid: true,
      servers: [
        {
          name: "linear",
          transport: {
            type: "sse",
            url: "https://example.com/sse",
          },
        },
      ],
    });
  });

  it("rejects bare server objects with a helpful error key", () => {
    const result = parseMcpJsonImport({
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
    });

    expect(result).toEqual({ isValid: false, errorKey: "bare-server" });
  });
});

describe("normalizeStdioTransport", () => {
  it("splits launcher commands pasted as one shell string", () => {
    expect(
      normalizeStdioTransport({
        type: "stdio",
        command: "npx -y @modelcontextprotocol/server-filesystem /tmp",
        args: [],
      }),
    ).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    });
  });
});

describe("buildMcpOriginalJson", () => {
  it("round-trips a single server into mcpServers JSON", () => {
    expect(
      JSON.parse(buildMcpOriginalJson("docs", "Docs", { type: "http", url: "https://x.test/mcp" })),
    ).toEqual({
      mcpServers: {
        docs: {
          description: "Docs",
          type: "http",
          url: "https://x.test/mcp",
        },
      },
    });
  });
});
