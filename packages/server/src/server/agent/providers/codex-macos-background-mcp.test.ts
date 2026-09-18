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
import { CodexAppServerAgentSession } from "./codex-app-server-agent.js";

interface CodexMcpInternals {
  buildCodexInnerConfig(): {
    mcp_servers?: Record<
      string,
      {
        command?: string;
        args?: string[];
        env?: Record<string, string>;
      }
    >;
  } | null;
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

describe("Codex app-server macOS MCP launch", () => {
  test("runs Codex-bundled node_repl from a private path outside the app bundle", () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

    const root = mkdtempSync(path.join(os.tmpdir(), "paseo-codex-mcp-"));
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

    const session = new CodexAppServerAgentSession(
      {
        provider: "codex",
        cwd: root,
        model: "gpt-5.4",
        mcpServers: {
          node_repl: {
            type: "stdio",
            command: sourceCommand,
            args: ["--stdio"],
            env: { TEST_VALUE: "preserved" },
          },
        },
      },
      null,
      createTestLogger(),
      () => {
        throw new Error("Test session cannot spawn Codex app-server");
      },
    );

    const innerConfig = asInternals<CodexMcpInternals>(session).buildCodexInnerConfig();
    const server = innerConfig?.mcp_servers?.node_repl;

    expect(server).toMatchObject({
      args: ["--stdio"],
      env: { TEST_VALUE: "preserved" },
    });
    expect(server?.command).not.toBe(sourceCommand);
    expect(server?.command).not.toContain(".app/Contents/");
    expect(server?.command).toContain(path.join(process.env.PASEO_HOME, "cache"));
    expect(readFileSync(server?.command ?? "", "utf8")).toBe("#!/bin/sh\ncat\n");
    expect(statSync(server?.command ?? "").mode & 0o111).not.toBe(0);
  });
});
