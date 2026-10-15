import { execFile } from "node:child_process";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeProjectConfigForProject } from "../project/project-config-storage.js";
import { ProjectCallAuthorizer } from "./project-call-authorizer.js";
import { ProjectEgressProxyCredentials } from "./project-egress-proxy-credentials.js";
import { ProjectEgressProxyServer } from "./project-egress-proxy-server.js";
import { execCommand } from "../../utils/spawn.js";

const execFileAsync = promisify(execFile);
const helperPath = process.env.PASEO_LINUX_NETWORK_HELPER_TEST_PATH!;
const targetAddress = process.env.PASEO_LINUX_NETWORK_TARGET_ADDRESS!;

describe("Linux Project network isolation", () => {
  const paseoHome = mkdtempSync(path.join(tmpdir(), "paseo-linux-network-e2e-"));
  const project = { projectId: "project-linux-e2e", rootPath: "/tmp/project-linux-e2e" };
  const workspace = {
    workspaceId: "workspace-linux-e2e",
    projectId: project.projectId,
    archivedAt: null,
  };
  const credentials = new ProjectEgressProxyCredentials({
    createToken: () => "linux-e2e-token-0123456789abcdef",
  });
  let targetServer: http.Server;
  let targetPort = 0;
  let proxy: ProjectEgressProxyServer;
  let proxyPort = 0;
  let token = "";

  beforeAll(async () => {
    const write = writeProjectConfigForProject({
      paseoHome,
      project,
      expectedRevision: null,
      config: {
        project: {
          directoryMode: "single",
          permissions: {
            enabled: true,
            enforcement: "strict",
            defaultAction: "deny",
            httpRules: [
              {
                id: "allow-test-target",
                action: "allow",
                protocols: ["http"],
                hosts: [{ type: "exact", value: targetAddress }],
                methods: ["GET"],
                path: { type: "exact", value: "/allowed" },
              },
              {
                id: "allow-rebind-hostname",
                action: "allow",
                protocols: ["http"],
                hosts: [{ type: "exact", value: "paseo-rebind.test" }],
              },
            ],
          },
        },
      },
    });
    expect(write.ok).toBe(true);
    targetServer = http.createServer((_request, response) => {
      response.end("target-ok");
    });
    await new Promise<void>((resolve) => targetServer.listen(0, targetAddress, resolve));
    targetPort = (targetServer.address() as { port: number }).port;

    const authorizer = new ProjectCallAuthorizer({
      paseoHome,
      workspaceRegistry: {
        get: async (workspaceId) => (workspaceId === workspace.workspaceId ? workspace : null),
      },
      projectRegistry: {
        get: async (projectId) => (projectId === project.projectId ? project : null),
      },
    });
    proxy = new ProjectEgressProxyServer({
      authorizer,
      credentials,
      host: "0.0.0.0",
    });
    proxyPort = (await proxy.start()).port;
    token = credentials.issue({
      workspaceId: workspace.workspaceId,
      source: "agent_process",
    }).token;
  });

  afterAll(async () => {
    await proxy.stop();
    await new Promise<void>((resolve) => targetServer.close(() => resolve()));
  });

  async function isolatedCurl(args: string[]): Promise<{ stdout: string; stderr: string }> {
    const result = await execFileAsync(
      helperPath,
      ["--proxy-port", String(proxyPort), "--", "curl", ...args],
      {
        env: {
          ...process.env,
          PASEO_PROJECT_PROXY_TOKEN: token,
        },
        timeout: 10_000,
      },
    );
    return { stdout: String(result.stdout), stderr: String(result.stderr) };
  }

  it("allows only the configured HTTP method and path through the authenticated proxy", async () => {
    await expect(
      isolatedCurl([
        "--fail",
        "--silent",
        "--show-error",
        `http://${targetAddress}:${targetPort}/allowed`,
      ]),
    ).resolves.toMatchObject({ stdout: "target-ok" });

    await expect(
      isolatedCurl([
        "--fail",
        "--silent",
        "--show-error",
        `http://${targetAddress}:${targetPort}/blocked`,
      ]),
    ).rejects.toThrow();
  });

  it("blocks direct sockets even when the same target is allowed through the proxy", async () => {
    await expect(
      isolatedCurl([
        "--noproxy",
        "*",
        "--connect-timeout",
        "1",
        "--fail",
        "--silent",
        `http://${targetAddress}:${targetPort}/allowed`,
      ]),
    ).rejects.toThrow();
  });

  it("blocks DNS rebinding to loopback after the hostname rule is allowed", async () => {
    await expect(
      isolatedCurl([
        "--fail",
        "--silent",
        "--show-error",
        `http://paseo-rebind.test:${targetPort}/allowed`,
      ]),
    ).rejects.toThrow();
  });

  it("enforces the same helper through the shared Provider/Workflow/Plugin process wrapper", async () => {
    const result = await execCommand(
      "curl",
      ["--fail", "--silent", "--show-error", `http://${targetAddress}:${targetPort}/allowed`],
      {
        env: {
          ...process.env,
          PASEO_PROJECT_NETWORK_ISOLATION: "1",
          PASEO_LINUX_NETWORK_HELPER_PATH: helperPath,
          PASEO_PROJECT_PROXY_PORT: String(proxyPort),
          PASEO_PROJECT_PROXY_TOKEN: token,
        },
        timeout: 10_000,
      },
    );
    expect(result.stdout).toBe("target-ok");
  });
});
