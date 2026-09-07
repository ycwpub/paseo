import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { ClaudeAgentClient } from "./agent.js";
import { getClaudeModels } from "./models.js";
const createdClaudeConfigDirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    createdClaudeConfigDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
  createdClaudeConfigDirs.length = 0;
});
async function createClaudeConfigDir(settings: unknown): Promise<string> {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-claude-models-"));
  createdClaudeConfigDirs.push(configDir);
  await fs.writeFile(path.join(configDir, "settings.json"), JSON.stringify(settings, null, 2));
  return configDir;
}
async function writeAidenModelCache(
  configDir: string,
  filename: string,
  cliType: string,
  entries: unknown[],
): Promise<void> {
  const cacheDir = path.join(configDir, "x", "models-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(
    path.join(cacheDir, filename),
    JSON.stringify({
      schema_version: 1,
      fetched_at_ms: 1,
      sections: [{ cliType, entries }],
    }),
  );
}
describe("ClaudeAgentClient.fetchCatalog", () => {
  it("loads only Claude-compatible models from Aiden for Aiden Claude", async () => {
    const aidenConfigDir = await createClaudeConfigDir({
      xLauncherSelections: {
        claude: {
          model: "gpt-5.5",
        },
      },
      xCustomModels: {
        "gpt-5.6": {
          protocol: "responses",
          model: "gpt-5.6-sol",
          visible: { codex: true, claude_code: true },
          claude_code: { series: "Custom GPT", alias: "sonnet" },
        },
        "hidden-model": {
          protocol: "responses",
          model: "hidden",
          visible: { claude_code: false },
          claude_code: { series: "Hidden", alias: "sonnet" },
        },
        "codex-only": {
          protocol: "responses",
          model: "codex-only",
          visible: true,
        },
      },
    });
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        schema_version: 1,
        models: [
          {
            cli_type: "claudecode",
            id: "gpt-5.5",
            series: "GPT",
            alias: "sonnet",
            context_length: 400000,
          },
          {
            cli_type: "claudecode",
            id: "[custom]gpt-5.6",
            series: "Custom GPT",
            alias: "sonnet",
          },
          {
            cli_type: "codex",
            id: "codex-only",
          },
        ],
      }),
      stderr: "",
    }));
    const resolveVersion = vi.fn(async () => "2.1.219");
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      customProvider: { id: "aiden-claude" },
      configDir: aidenConfigDir,
      aidenConfigDir,
      aidenModelCommandRunner: runCommand,
      resolveVersion,
    });
    const { models } = await client.fetchCatalog({
      scope: "workspace",
      cwd: os.tmpdir(),
      force: true,
    });
    expect(models).toEqual([
      {
        provider: "claude",
        id: "gpt-5.5",
        label: "gpt-5.5",
        description: "GPT · sonnet · From Aiden",
        contextWindowMaxTokens: 400000,
        isDefault: true,
      },
      {
        provider: "claude",
        id: "[custom]gpt-5.6",
        label: "[custom]gpt-5.6",
        description: "Custom GPT · sonnet · From Aiden",
      },
    ]);
    expect(runCommand).toHaveBeenCalledWith(
      "aiden",
      ["x", "models", "--json", "--claude", "--no-cache", "--timeout", "15000"],
      expect.objectContaining({ cwd: os.tmpdir() }),
    );
    expect(resolveVersion).not.toHaveBeenCalled();
  });
  it("falls back only to local Aiden models when the Aiden catalog is unavailable", async () => {
    const aidenConfigDir = await createClaudeConfigDir({
      model: "gpt-5.6",
      xCustomModels: {
        "gpt-5.6": {
          protocol: "responses",
          model: "gpt-5.6-sol",
          visible: { codex: true, claude_code: true },
          claude_code: { series: "Custom GPT", alias: "sonnet" },
        },
        "hidden-model": {
          protocol: "responses",
          model: "hidden",
          visible: { claude_code: false },
          claude_code: { series: "Hidden", alias: "sonnet" },
        },
        "codex-only": {
          protocol: "responses",
          model: "codex-only",
          visible: true,
        },
      },
    });
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      customProvider: { id: "aiden-claude" },
      aidenConfigDir,
      aidenModelCommandRunner: async () => {
        throw new Error("Aiden login required");
      },
    });
    const { models } = await client.fetchCatalog({
      scope: "workspace",
      cwd: os.tmpdir(),
      force: false,
    });
    expect(models).toEqual([
      {
        provider: "claude",
        id: "[custom]gpt-5.6",
        label: "[custom]gpt-5.6",
        description: "Custom model gpt-5.6 from Aiden",
        isDefault: true,
      },
    ]);
  });
  it("falls back to Aiden's complete local model cache when online discovery fails", async () => {
    const aidenConfigDir = await createClaudeConfigDir({
      xLauncherSelections: {
        claude: {
          model: "gpt-5.5",
        },
      },
      xCustomModels: {
        "gpt-5.6": {
          visible: { codex: true, claude_code: true },
          description: "Custom GPT",
          claude_code: { series: "Custom GPT", alias: "sonnet" },
        },
      },
    });
    await writeAidenModelCache(aidenConfigDir, "claudecode.json", "claudecode", [
      {
        modelName: "Doubao-Seed-2.1-Pro",
        displayName: "Doubao-Seed-2.1-Pro",
        series: "Doubao 系列",
        config: {
          visible: true,
          description: "Doubao 系列",
          context_length: 224000,
        },
        modelMetadata: {
          context_window: 224000,
        },
        claudeCode: {
          series: "Doubao 系列",
          alias: "opus",
        },
      },
      {
        modelName: "gpt-5.5",
        displayName: "gpt-5.5",
        series: "GPT 系列",
        config: {
          visible: true,
          description: "GPT 系列",
          context_length: 272000,
        },
        modelMetadata: {
          context_window: 272000,
        },
        claudeCode: {
          series: "GPT 系列",
          alias: "opus",
        },
      },
    ]);
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      customProvider: { id: "aiden-claude" },
      aidenConfigDir,
      aidenModelCommandRunner: async () => {
        throw new Error("Aiden login required");
      },
    });
    const { models } = await client.fetchCatalog({
      scope: "workspace",
      cwd: os.tmpdir(),
      force: false,
    });
    expect(models.map((model) => model.id)).toEqual([
      "Doubao-Seed-2.1-Pro",
      "gpt-5.5",
      "[custom]gpt-5.6",
    ]);
    expect(models.find((model) => model.id === "gpt-5.5")).toEqual(
      expect.objectContaining({
        contextWindowMaxTokens: 272000,
        isDefault: true,
      }),
    );
  });
  it("keeps Aiden model discovery scoped to the Aiden Claude provider", async () => {
    const aidenConfigDir = await createClaudeConfigDir({
      xCustomModels: {
        "gpt-5.6": {
          protocol: "responses",
          model: "gpt-5.6-sol",
          claude_code: { series: "Custom GPT", alias: "sonnet" },
        },
      },
    });
    const client = new ClaudeAgentClient({
      logger: createTestLogger(),
      configDir: aidenConfigDir,
      aidenConfigDir,
      resolveVersion: async () => "2.1.219",
    });
    const { models } = await client.fetchCatalog({
      scope: "workspace",
      cwd: os.tmpdir(),
      force: true,
    });
    expect(models).toEqual(getClaudeModels());
  });
});
