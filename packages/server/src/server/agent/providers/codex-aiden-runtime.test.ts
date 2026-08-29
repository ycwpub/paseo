import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { asInternals } from "../../test-utils/class-mocks.js";
import * as spawnUtils from "../../../utils/spawn.js";
import { CodexAppServerAgentClient } from "./codex-app-server-agent.js";

function childProcessStub(): ChildProcessWithoutNullStreams {
  const child = new EventEmitter() as ChildProcessWithoutNullStreams;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  return child;
}

describe("Aiden Codex runtime", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("passes the selected model to Aiden and injects runtime compatibility", async () => {
    const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-aiden-codex-home-"));
    const spawnSpy = vi.spyOn(spawnUtils, "spawnProcess").mockReturnValue(childProcessStub());
    const client = new CodexAppServerAgentClient(
      createTestLogger(),
      {
        command: {
          mode: "replace",
          argv: [process.execPath, "x", "codex", "--model", "old-model"],
        },
      },
      {
        customProvider: {
          id: "aiden-codex",
          label: "Aiden Codex",
          extends: "codex",
        },
      },
    );
    const internals = asInternals<{
      spawnAppServer(
        launchEnv?: Record<string, string>,
        options?: { goalsEnabled?: boolean; agentId?: string; model?: string | null },
      ): Promise<ChildProcessWithoutNullStreams>;
    }>(client);

    try {
      await internals.spawnAppServer(
        { NODE_OPTIONS: "--trace-warnings", CODEX_HOME: codexHome },
        {
          goalsEnabled: true,
          agentId: "agent-aiden-codex",
          model: "[custom]gpt-5.6",
        },
      );

      expect(spawnSpy).toHaveBeenCalledTimes(1);
      const [command, args, options] = spawnSpy.mock.calls[0]!;
      expect(command).toBe(process.execPath);
      expect(args).toEqual([
        "x",
        "codex",
        "--model",
        "[custom]gpt-5.6",
        "app-server",
        "--enable",
        "goals",
      ]);
      expect(options.envOverlay?.NODE_OPTIONS).toContain("--trace-warnings");
      expect(options.envOverlay?.NODE_OPTIONS).toContain("paseo-aiden-model-fallback-v1.cjs");
      expect(options.envOverlay?.PASEO_AIDEN_RUNTIME_TARGET).toBe("codex");
      expect(options.envOverlay?.CODEX_HOME).toBe(codexHome);
    } finally {
      fs.rmSync(codexHome, { recursive: true, force: true });
    }
  });
});
