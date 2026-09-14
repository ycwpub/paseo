import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { asInternals } from "../../test-utils/class-mocks.js";
import { ACPAgentSession, DEFAULT_ACP_CAPABILITIES } from "./acp-agent.js";

interface ACPMcpInternals {
  acpMcpServers(): Array<{
    name: string;
    command: string;
    args: string[];
    env: Array<{ name: string; value: string }>;
  }>;
}

const tempDirectories: string[] = [];
const originalPaseoHome = process.env.PASEO_HOME;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalPaseoHome === undefined) {
    delete process.env.PASEO_HOME;
  } else {
    process.env.PASEO_HOME = originalPaseoHome;
  }
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("TRAE ACP macOS MCP launch", () => {
  test("runs Codex-bundled node_repl from a private path outside the app bundle", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-trae-mcp-"));
    tempDirectories.push(root);
    process.env.PASEO_HOME = path.join(root, "paseo-home");

    const sourceCommand = path.join(
      root,
      "Codex.app",
      "Contents",
      "Resources",
      "cua_node",
      "bin",
      "node_repl",
    );
    mkdirSync(path.dirname(sourceCommand), { recursive: true });
    writeFileSync(sourceCommand, "#!/bin/sh\ncat\n");
    chmodSync(sourceCommand, 0o755);

    const session = new ACPAgentSession(
      {
        provider: "traecli",
        cwd: root,
        mcpServers: {
          node_repl: {
            type: "stdio",
            command: sourceCommand,
            args: ["--stdio"],
            env: { TEST_VALUE: "preserved" },
          },
        },
      },
      {
        provider: "traecli",
        logger: createTestLogger(),
        defaultCommand: ["traecli", "acp", "serve"],
        defaultModes: [],
        capabilities: DEFAULT_ACP_CAPABILITIES,
        backgroundAppBundleMcpProcesses: true,
      },
    );

    const [server] = asInternals<ACPMcpInternals>(session).acpMcpServers();

    expect(server).toMatchObject({
      name: "node_repl",
      args: ["--stdio"],
      env: [{ name: "TEST_VALUE", value: "preserved" }],
    });
    expect(server.command).not.toBe(sourceCommand);
    expect(server.command).not.toContain(".app/Contents/");
    expect(server.command).toContain(path.join(process.env.PASEO_HOME, "cache"));
    expect(readFileSync(server.command, "utf8")).toBe("#!/bin/sh\ncat\n");
    expect(statSync(server.command).mode & 0o111).not.toBe(0);
  });

  test("keeps the original command for non-TRAE providers", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    const sourceCommand = "/Applications/Codex.app/Contents/Resources/cua_node/bin/node_repl";
    const session = new ACPAgentSession(
      {
        provider: "codex",
        cwd: os.tmpdir(),
        mcpServers: {
          node_repl: {
            type: "stdio",
            command: sourceCommand,
          },
        },
      },
      {
        provider: "codex",
        logger: createTestLogger(),
        defaultCommand: ["codex"],
        defaultModes: [],
        capabilities: DEFAULT_ACP_CAPABILITIES,
      },
    );

    const [server] = asInternals<ACPMcpInternals>(session).acpMcpServers();
    expect(server.command).toBe(sourceCommand);
  });
});
