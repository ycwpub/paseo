import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { lookup as dnsLookup } from "node:dns/promises";
import net, { type AddressInfo, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import type { ProjectCallAuthorizer } from "./project-call-authorizer.js";
import type { ProjectEgressProxyCredentials } from "./project-egress-proxy-credentials.js";
import { projectFetch } from "./project-http-client.js";
import {
  authorizeProjectProxyTarget,
  isRestrictedProjectProxyAddress,
  parseProjectProxyConnectTarget,
} from "./project-egress-proxy-policy.js";

const MAX_REQUEST_BODY_BYTES = 16 * 1024 * 1024;
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface ProjectEgressProxyAddress {
  host: string;
  port: number;
}

export interface ProjectEgressProxyServerOptions {
  authorizer: Pick<ProjectCallAuthorizer, "authorize">;
  credentials: ProjectEgressProxyCredentials;
  fetchImplementation?: typeof fetch;
  host?: string;
  port?: number;
  lookup?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  connect?: (options: { host: string; port: number; family: number }) => Socket;
}

async function lookupAll(hostname: string): Promise<Array<{ address: string; family: number }>> {
  return dnsLookup(hostname, { all: true, verbatim: true });
}

function proxyToken(request: IncomingMessage): string | null {
  const header = request.headers["proxy-authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/u.exec(value?.trim() ?? "");
  return match?.[1] ?? null;
}

function writeText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_REQUEST_BODY_BYTES) {
      throw new Error(`Project proxy request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function forwardedHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, rawValue] of Object.entries(request.headers)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase()) || rawValue === undefined) continue;
    if (Array.isArray(rawValue)) {
      for (const value of rawValue) headers.append(name, value);
    } else {
      headers.set(name, rawValue);
    }
  }
  return headers;
}

export class ProjectEgressProxyServer {
  private readonly server: http.Server;
  private readonly host: string;
  private readonly port: number;
  private readonly options: ProjectEgressProxyServerOptions;
  private address: ProjectEgressProxyAddress | null = null;

  public constructor(options: ProjectEgressProxyServerOptions) {
    this.options = options;
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 0;
    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response);
    });
    this.server.on("connect", (request, socket, head) => {
      void this.handleConnect(request, socket, head);
    });
  }

  public async start(): Promise<ProjectEgressProxyAddress> {
    if (this.address) return this.address;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };
      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen(this.port, this.host);
    });
    const address = this.server.address() as AddressInfo;
    this.address = { host: address.address, port: address.port };
    return this.address;
  }

  public async stop(): Promise<void> {
    if (!this.server.listening) {
      this.address = null;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.address = null;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const token = proxyToken(request);
    const credential = token ? this.options.credentials.resolve(token) : null;
    if (!credential) {
      response.setHeader("proxy-authenticate", 'Bearer realm="Paseo Project"');
      writeText(response, 407, "Project proxy authentication required");
      return;
    }

    try {
      const target = new URL(request.url ?? "");
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        writeText(response, 400, "Project proxy requires an absolute HTTP URL");
        return;
      }
      const body = await readRequestBody(request);
      const upstream = await projectFetch(target, {
        workspaceId: credential.workspaceId,
        source: credential.source,
        authorize: this.options.authorizer.authorize.bind(this.options.authorizer),
        fetchImplementation: this.options.fetchImplementation,
        method: request.method ?? "GET",
        headers: forwardedHeaders(request),
        body: body ? new Uint8Array(body) : undefined,
      });
      const responseHeaders: Record<string, string> = {};
      upstream.headers.forEach((value, name) => {
        if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) responseHeaders[name] = value;
      });
      const responseBody = Buffer.from(await upstream.arrayBuffer());
      responseHeaders["content-length"] = String(responseBody.length);
      response.writeHead(upstream.status, responseHeaders);
      response.end(responseBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeText(response, message.includes("PROJECT_PERMISSION_DENIED") ? 403 : 502, message);
    }
  }

  private async handleConnect(
    request: IncomingMessage,
    clientSocket: Duplex,
    head: Buffer,
  ): Promise<void> {
    const token = proxyToken(request);
    const credential = token ? this.options.credentials.resolve(token) : null;
    if (!credential) {
      clientSocket.end(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Bearer realm="Paseo Project"\r\nConnection: close\r\n\r\n',
      );
      return;
    }

    try {
      const target = parseProjectProxyConnectTarget(request.url ?? "");
      await authorizeProjectProxyTarget({
        workspaceId: credential.workspaceId,
        source: credential.source,
        method: "CONNECT",
        target: request.url ?? "",
        authorize: this.options.authorizer.authorize.bind(this.options.authorizer),
      });
      const addresses = await (this.options.lookup ?? lookupAll)(target.hostname);
      if (
        addresses.length === 0 ||
        addresses.some((entry) => isRestrictedProjectProxyAddress(entry.address))
      ) {
        throw new Error("Project proxy rejected a restricted or private target address");
      }
      const selected = addresses[0]!;
      const upstream = (this.options.connect ?? net.connect)({
        host: selected.address,
        port: target.port,
        family: selected.family,
      });
      const onError = (error: Error) => {
        if (!clientSocket.destroyed) {
          clientSocket.end(
            `HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(error.message)}\r\n\r\n${error.message}`,
          );
        }
      };
      upstream.once("error", onError);
      upstream.once("connect", () => {
        upstream.off("error", onError);
        upstream.on("error", () => clientSocket.destroy());
        clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length > 0) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("PROJECT_PERMISSION_DENIED") ? 403 : 502;
      clientSocket.end(
        `HTTP/1.1 ${status} ${status === 403 ? "Forbidden" : "Bad Gateway"}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
      );
    }
  }
}
