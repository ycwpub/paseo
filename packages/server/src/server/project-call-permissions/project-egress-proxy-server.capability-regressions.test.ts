import http from "node:http";
import { once } from "node:events";
import net from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProjectEgressProxyCredentials } from "./project-egress-proxy-credentials.js";
import { ProjectEgressProxyServer } from "./project-egress-proxy-server.js";

const servers: ProjectEgressProxyServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

async function proxyRequest(input: {
  port: number;
  target: string;
  token?: string;
  authorization?: string;
}): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {};
  if (input.authorization) {
    headers["Proxy-Authorization"] = input.authorization;
  } else if (input.token) {
    headers["Proxy-Authorization"] = `Bearer ${input.token}`;
  }
  const request = http.request({
    host: "127.0.0.1",
    port: input.port,
    method: "GET",
    path: input.target,
    headers,
  });
  request.end();
  const [response] = (await once(request, "response")) as [http.IncomingMessage];
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(Buffer.from(chunk));
  return {
    status: response.statusCode ?? 0,
    body: Buffer.concat(chunks).toString("utf8"),
  };
}

async function proxyConnect(input: {
  port: number;
  target: string;
  token: string;
}): Promise<string> {
  const socket = net.connect(input.port, "127.0.0.1");
  await once(socket, "connect");
  socket.end(
    `CONNECT ${input.target} HTTP/1.1\r\nHost: ${input.target}\r\nProxy-Authorization: Bearer ${input.token}\r\n\r\n`,
  );
  const chunks: Buffer[] = [];
  for await (const chunk of socket) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

describe("ProjectEgressProxyServer", () => {
  it("requires a live proxy credential", async () => {
    const server = new ProjectEgressProxyServer({
      authorizer: { authorize: vi.fn() },
      credentials: new ProjectEgressProxyCredentials(),
      fetchImplementation: vi.fn(),
    });
    servers.push(server);
    const address = await server.start();

    await expect(
      proxyRequest({ port: address.port, target: "http://example.com/private" }),
    ).resolves.toEqual({
      status: 407,
      body: "Project proxy authentication required",
    });
  });

  it("authorizes and forwards an absolute HTTP request without leaking proxy credentials", async () => {
    const authorize = vi.fn(async () => ({
      allowed: true,
      reason: "matched_allow" as const,
      matchedRuleId: "allow-example",
      enforcement: "strict" as const,
    }));
    const fetchImplementation = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.has("proxy-authorization")).toBe(false);
      return new Response("proxied", { status: 200 });
    });
    const credentials = new ProjectEgressProxyCredentials({
      createToken: () => "secret-token",
    });
    const issued = credentials.issue({
      workspaceId: "workspace-a",
      source: "agent_process",
    });
    const server = new ProjectEgressProxyServer({
      authorizer: { authorize },
      credentials,
      fetchImplementation,
    });
    servers.push(server);
    const address = await server.start();

    await expect(
      proxyRequest({
        port: address.port,
        target: "http://example.com/v1/items?limit=1",
        token: issued.token,
      }),
    ).resolves.toEqual({ status: 200, body: "proxied" });
    expect(authorize).toHaveBeenCalledWith({
      workspaceId: "workspace-a",
      source: "agent_process",
      request: {
        kind: "http",
        url: "http://example.com/v1/items?limit=1",
        method: "GET",
      },
    });
  });

  it("accepts Basic proxy authentication emitted by standard proxy URLs", async () => {
    const credentials = new ProjectEgressProxyCredentials({
      createToken: () => "basic-token",
    });
    credentials.issue({ workspaceId: "workspace-a", source: "agent_process" });
    const server = new ProjectEgressProxyServer({
      authorizer: {
        authorize: async () => ({
          allowed: true,
          reason: "matched_allow",
          matchedRuleId: "allow-example",
          enforcement: "strict",
        }),
      },
      credentials,
      fetchImplementation: async () => new Response("basic-ok"),
    });
    servers.push(server);
    const address = await server.start();

    await expect(
      proxyRequest({
        port: address.port,
        target: "http://example.com/",
        authorization: `Basic ${Buffer.from("paseo:basic-token").toString("base64")}`,
      }),
    ).resolves.toEqual({ status: 200, body: "basic-ok" });
  });

  it("returns a permission failure without contacting the target", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const credentials = new ProjectEgressProxyCredentials({
      createToken: () => "denied-token",
    });
    credentials.issue({ workspaceId: "workspace-a", source: "agent_process" });
    const server = new ProjectEgressProxyServer({
      authorizer: {
        authorize: async () => {
          throw new Error("PROJECT_PERMISSION_DENIED");
        },
      },
      credentials,
      fetchImplementation,
    });
    servers.push(server);
    const address = await server.start();

    await expect(
      proxyRequest({
        port: address.port,
        target: "http://example.com/private",
        token: "denied-token",
      }),
    ).resolves.toEqual({
      status: 403,
      body: "PROJECT_PERMISSION_DENIED",
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects CONNECT when DNS resolves to any restricted address", async () => {
    const credentials = new ProjectEgressProxyCredentials({
      createToken: () => "connect-token",
    });
    credentials.issue({ workspaceId: "workspace-a", source: "agent_process" });
    const server = new ProjectEgressProxyServer({
      authorizer: {
        authorize: async () => ({
          allowed: true,
          reason: "matched_allow",
          matchedRuleId: "allow-host",
          enforcement: "strict",
        }),
      },
      credentials,
      lookup: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ],
    });
    servers.push(server);
    const address = await server.start();

    await expect(
      proxyConnect({
        port: address.port,
        target: "api.example.com:443",
        token: "connect-token",
      }),
    ).resolves.toContain("502 Bad Gateway");
  });

  it("rejects ordinary HTTP when DNS resolves to a restricted address", async () => {
    const credentials = new ProjectEgressProxyCredentials({
      createToken: () => "http-rebind-token",
    });
    credentials.issue({ workspaceId: "workspace-a", source: "agent_process" });
    const server = new ProjectEgressProxyServer({
      authorizer: {
        authorize: async () => ({
          allowed: true,
          reason: "matched_allow",
          matchedRuleId: "allow-hostname",
          enforcement: "strict",
        }),
      },
      credentials,
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    servers.push(server);
    const address = await server.start();

    await expect(
      proxyRequest({
        port: address.port,
        target: "http://rebind.example.test/private",
        token: "http-rebind-token",
      }),
    ).resolves.toEqual({
      status: 502,
      body: "Project proxy rejected a restricted or private target address",
    });
  });
});
