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

  test("completes a custom-only app-server catalog from Aiden's local cache", async () => {
    const aidenConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-aiden-catalog-"));
    const cacheDir = path.join(aidenConfigDir, "x", "models-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(aidenConfigDir, "settings.json"),
      JSON.stringify({
        xLauncherSelections: { codex: { model: "gpt-5.5" } },
        xCustomModels: {
          "gpt-5.6": {
            visible: { codex: true, claude_code: true },
            description: "Custom GPT",
            claude_code: { series: "Custom GPT", alias: "sonnet" },
          },
        },
      }),
    );
    fs.writeFileSync(
      path.join(cacheDir, "claudecode.json"),
      JSON.stringify({
        schema_version: 1,
        fetched_at_ms: 1,
        sections: [
          {
            cliType: "claudecode",
            entries: [
              {
                modelName: "gpt-5.5",
                displayName: "gpt-5.5",
                series: "GPT 系列",
                config: {
                  visible: true,
                  description: "GPT 系列",
                  context_length: 272_000,
                },
                modelMetadata: {
                  context_window: 272_000,
                  default_reasoning_level: "medium",
                  supported_reasoning_levels: [
                    { effort: "low", description: "Fast" },
                    { effort: "high", description: "Deep" },
                  ],
                },
                claudeCode: { series: "GPT 系列", alias: "opus" },
              },
            ],
          },
        ],
      }),
    );

    const fakeClient = {
      request: vi.fn(async (method: string) => {
        if (method === "model/list") {
          return { data: [{ id: "[custom]gpt-5.6", displayName: "[custom]gpt-5.6" }] };
        }
        if (method === "getUserSavedConfig" || method === "config/read") {
          return { config: {} };
        }
        return {};
      }),
      notify: vi.fn(),
      dispose: vi.fn(async () => {}),
    };
    const client = new CodexAppServerAgentClient(
      createTestLogger(),
      {
        command: {
          mode: "replace",
          argv: [process.execPath, "x", "codex"],
        },
      },
      {
        customProvider: {
          id: "aiden-codex",
          label: "Aiden Codex",
          extends: "codex",
        },
        aidenConfigDir,
        _createCodexClient: () => fakeClient,
      },
    );
    const internals = asInternals<{
      spawnAppServer(): Promise<ChildProcessWithoutNullStreams>;
      fetchModelsFromAppServer(options: {
        scope: "workspace";
        cwd: string;
        force: boolean;
      }): Promise<
        Array<{
          id: string;
          isDefault?: boolean;
          contextWindowMaxTokens?: number;
          thinkingOptions?: Array<{ id: string }>;
        }>
      >;
    }>(client);
    internals.spawnAppServer = async () => childProcessStub();

    try {
      const models = await internals.fetchModelsFromAppServer({
        scope: "workspace",
        cwd: os.tmpdir(),
        force: false,
      });

      expect(models.map((model) => model.id)).toEqual(["gpt-5.5", "[custom]gpt-5.6"]);
      expect(models[0]).toEqual(
        expect.objectContaining({
          isDefault: true,
          contextWindowMaxTokens: 272_000,
          thinkingOptions: [
            expect.objectContaining({ id: "low" }),
            expect.objectContaining({ id: "high" }),
            expect.objectContaining({ id: "medium" }),
          ],
        }),
      );
    } finally {
      fs.rmSync(aidenConfigDir, { recursive: true, force: true });
    }
  });
});
