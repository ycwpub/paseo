import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { normalizeAidenSelectedModel, readAidenLocalModelCatalog } from "./model-catalog.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function createAidenConfigDir(settings: unknown, caches: Record<string, unknown>) {
  const configDir = await fs.mkdtemp(path.join(os.tmpdir(), "paseo-aiden-model-catalog-"));
  tempDirs.push(configDir);
  await fs.writeFile(path.join(configDir, "settings.json"), JSON.stringify(settings));
  const cacheDir = path.join(configDir, "x", "models-cache");
  await fs.mkdir(cacheDir, { recursive: true });
  await Promise.all(
    Object.entries(caches).map(([filename, content]) =>
      fs.writeFile(path.join(cacheDir, filename), JSON.stringify(content)),
    ),
  );
  return configDir;
}

function cacheSection(cliType: string, entries: unknown[]) {
  return {
    schema_version: 1,
    // Stale caches intentionally remain valid as an offline fallback.
    fetched_at_ms: 1,
    sections: [{ cliType, entries }],
  };
}

describe("readAidenLocalModelCatalog", () => {
  test("loads stale Claude cache and merges target-visible custom models", async () => {
    const configDir = await createAidenConfigDir(
      {
        xLauncherSelections: { claude: { model: "gpt-5.5" } },
        xCustomModels: {
          "gpt-5.6": {
            visible: { codex: true, claude_code: true },
            description: "Custom GPT",
            claude_code: { series: "Custom", alias: "sonnet" },
          },
          "codex-only": {
            visible: { codex: true, claude_code: false },
          },
        },
      },
      {
        "claudecode.json": cacheSection("claudecode", [
          {
            modelName: "gpt-5.5",
            displayName: "GPT 5.5",
            series: "GPT",
            config: {
              visible: true,
              description: "GPT series",
              context_length: 272_000,
              openai_api_key: "must-not-leak",
            },
            modelMetadata: {
              default_reasoning_level: "medium",
              supported_reasoning_levels: [
                { effort: "low", description: "Fast" },
                { effort: "high", description: "Deep" },
              ],
            },
            claudeCode: { series: "GPT", alias: "opus" },
          },
        ]),
      },
    );

    const catalog = await readAidenLocalModelCatalog({
      logger: createTestLogger(),
      cwd: os.tmpdir(),
      configDir,
      target: "claude",
    });

    expect(catalog.selectedModel).toBe("gpt-5.5");
    expect(catalog.models).toEqual([
      {
        id: "gpt-5.5",
        label: "GPT 5.5",
        description: "GPT series",
        series: "GPT",
        alias: "opus",
        contextWindowMaxTokens: 272_000,
        defaultReasoningEffort: "medium",
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Fast" },
          { reasoningEffort: "high", description: "Deep" },
        ],
      },
      {
        id: "[custom]gpt-5.6",
        description: "Custom GPT",
        series: "Custom",
        alias: "sonnet",
      },
    ]);
    expect(JSON.stringify(catalog)).not.toContain("must-not-leak");
  });

  test("uses Codex cache first and fills missing fields from settings", async () => {
    const configDir = await createAidenConfigDir(
      {
        xLauncherSelections: { codex: "[custom]gpt-5.6" },
        xCustomModels: {
          "gpt-5.6": {
            visible: { codex: true },
            description: "Configured description",
            context_length: 300_000,
          },
        },
      },
      {
        "codex.json": cacheSection("codex", [
          {
            modelName: "[custom]gpt-5.6",
            displayName: "Cached custom model",
            config: { visible: true },
          },
        ]),
      },
    );

    const catalog = await readAidenLocalModelCatalog({
      logger: createTestLogger(),
      cwd: os.tmpdir(),
      configDir,
      target: "codex",
    });

    expect(catalog.models).toEqual([
      {
        id: "[custom]gpt-5.6",
        label: "Cached custom model",
        description: "Configured description",
        contextWindowMaxTokens: 300_000,
      },
    ]);
    expect(normalizeAidenSelectedModel(catalog.selectedModel, catalog.models)).toBe(
      "[custom]gpt-5.6",
    );
  });

  test("recovers Codex built-in models from a Claude cache when no Codex cache exists", async () => {
    const configDir = await createAidenConfigDir(
      {},
      {
        "claudecode.json": cacheSection("claudecode", [
          {
            modelName: "Doubao-Seed-2.1-Pro",
            config: {
              visible: true,
              description: "Doubao",
              context_length: 224_000,
            },
            modelMetadata: {
              context_window: 224_000,
              default_reasoning_level: "high",
            },
            claudeCode: { series: "Doubao", alias: "opus" },
          },
          {
            modelName: "[custom]not-safe-to-infer",
            config: { visible: true },
            modelMetadata: null,
            claudeCode: { series: "Custom", alias: "sonnet" },
          },
        ]),
      },
    );

    const catalog = await readAidenLocalModelCatalog({
      logger: createTestLogger(),
      cwd: os.tmpdir(),
      configDir,
      target: "codex",
    });

    expect(catalog.models.map((model) => model.id)).toEqual(["Doubao-Seed-2.1-Pro"]);
  });
});
