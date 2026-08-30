import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  adaptAidenClaudeSpawnArgs,
  applyAidenLauncherModel,
  createAidenRuntimeEnvOverlay,
  ensureAidenCodexHomeConfig,
  materializeAidenModelFallbackPreload,
  mergeNodeRequireOption,
  patchAidenCodexConfigToml,
} from "./runtime-compat.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function runPreloadFetchScenario(options: {
  settings: Record<string, unknown>;
  target?: "codex" | "claudecode";
  url?: string;
}): Record<string, unknown> {
  const configDir = temporaryDirectory("paseo-aiden-settings-");
  fs.writeFileSync(path.join(configDir, "settings.json"), JSON.stringify(options.settings));
  const preloadPath = materializeAidenModelFallbackPreload(
    temporaryDirectory("paseo-aiden-preload-"),
  );
  const script = `
globalThis.fetch = async () =>
  new Response(JSON.stringify({ object: "list", data: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
require(process.argv[1]);
globalThis.fetch(process.argv[2])
  .then((response) => response.json())
  .then((payload) => process.stdout.write(JSON.stringify(payload)));
`;
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["-e", script, preloadPath, options.url ?? "https://aiden-aiproxy.bytedance.net/v2/models"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: configDir,
          PASEO_AIDEN_CONFIG_DIR: configDir,
          PASEO_AIDEN_RUNTIME_TARGET: options.target ?? "codex",
        },
      },
    ),
  ) as Record<string, unknown>;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Aiden runtime compatibility", () => {
  test("moves Claude's selected model to the Aiden launcher and filters conflicting flags", () => {
    expect(
      adaptAidenClaudeSpawnArgs([
        "--output-format",
        "stream-json",
        "--model",
        "[custom]gpt-5.6",
        "--settings",
        '{"fastMode":true}',
        "--setting-sources=user,project",
        "--fallback-model",
        "haiku",
        "--mcp-config",
        '{"mcpServers":{"paseo":{"type":"http"}}}',
        "--strict-mcp-config",
        "--verbose",
      ]),
    ).toEqual({
      launcherArgs: ["--model", "[custom]gpt-5.6"],
      passthroughArgs: ["--output-format", "stream-json", "--verbose"],
    });
  });

  test("keeps Claude MCP flags for non-custom Aiden models", () => {
    expect(
      adaptAidenClaudeSpawnArgs([
        "--model=sonnet",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--strict-mcp-config",
      ]),
    ).toEqual({
      launcherArgs: ["--model", "sonnet"],
      passthroughArgs: ["--mcp-config", '{"mcpServers":{}}', "--strict-mcp-config"],
    });
  });

  test("replaces an existing Aiden launcher model without disturbing other arguments", () => {
    expect(
      applyAidenLauncherModel(
        ["x", "codex", "--gateway-mode", "direct", "--model=old-model"],
        "[custom]gpt-5.6",
      ),
    ).toEqual(["x", "codex", "--gateway-mode", "direct", "--model", "[custom]gpt-5.6"]);
  });

  test("preserves existing NODE_OPTIONS and injects the versioned preload only for Aiden", () => {
    const codexHome = temporaryDirectory("paseo-aiden-codex-home-");
    const env = createAidenRuntimeEnvOverlay({
      providerId: "aiden-codex",
      target: "codex",
      baseEnv: { NODE_OPTIONS: "--trace-warnings", CODEX_HOME: codexHome },
    });
    expect(env.NODE_OPTIONS).toContain("--trace-warnings");
    expect(env.NODE_OPTIONS).toContain("paseo-aiden-model-fallback-v2.cjs");
    expect(env.PASEO_AIDEN_RUNTIME_TARGET).toBe("codex");
    expect(env.CODEX_HOME).toBe(codexHome);
    expect(fs.readFileSync(path.join(codexHome, "config.toml"), "utf8")).toContain(
      "requires_openai_auth = false",
    );
    expect(
      createAidenRuntimeEnvOverlay({
        providerId: "codex",
        target: "codex",
      }),
    ).toEqual({});
  });

  test("does not duplicate an existing preload option", () => {
    expect(
      mergeNodeRequireOption('--trace-warnings --require="/tmp/fallback.cjs"', "/tmp/fallback.cjs"),
    ).toBe('--trace-warnings --require="/tmp/fallback.cjs"');
  });

  test("patches only the Aiden Codex provider auth setting", () => {
    const source = `model = "[custom]gpt-5.6"

[model_providers.aiden_aiproxy]
env_key = "AIDEN_X_LOCAL_GATEWAY_API_KEY"
wire_api = "responses"

[model_providers.aiden_aiproxy.auth]
command = "aiden"
`;
    expect(patchAidenCodexConfigToml(source)).toBe(`model = "[custom]gpt-5.6"

[model_providers.aiden_aiproxy]
requires_openai_auth = false
wire_api = "responses"

[model_providers.aiden_aiproxy.auth]
command = "aiden"
`);
    expect(
      patchAidenCodexConfigToml(
        source.replace('wire_api = "responses"', "requires_openai_auth = true"),
      ),
    ).toContain("requires_openai_auth = false");
  });

  test("removes dotted Aiden env_key when command auth is configured", () => {
    const source = [
      'model_providers.aiden_aiproxy.env_key = "AIDEN_X_LOCAL_GATEWAY_API_KEY"',
      "",
      "[model_providers.aiden_aiproxy.auth]",
      'command = "aiden"',
      'args = ["auth", "get-bytecloud-jwt-token"]',
      "",
    ].join("\r\n");
    const patched = patchAidenCodexConfigToml(source);
    expect(patched).not.toContain("env_key");
    expect(patched).toContain(
      "[model_providers.aiden_aiproxy]\r\nrequires_openai_auth = false\r\n",
    );
    expect(patched).toContain('[model_providers.aiden_aiproxy.auth]\r\ncommand = "aiden"\r\n');
  });

  test("creates an isolated Aiden Codex config without exposing unrelated settings", () => {
    const codexHome = temporaryDirectory("paseo-aiden-codex-home-");
    const configPath = path.join(codexHome, "config.toml");
    fs.writeFileSync(configPath, 'model = "existing-model"\n');
    ensureAidenCodexHomeConfig(codexHome);
    const config = fs.readFileSync(configPath, "utf8");
    expect(config).toContain('model = "existing-model"');
    expect(config).toContain("[model_providers.aiden_aiproxy]");
    expect(config).toContain("requires_openai_auth = false");
  });

  test("supplies an invisible placeholder when Aiden returns an empty model list", () => {
    const payload = runPreloadFetchScenario({
      settings: {
        xCustomModels: {
          "gpt-5.6": {
            api_key: "must-not-be-exposed",
            visible: { codex: true },
          },
        },
      },
    });
    expect(payload).toEqual({
      object: "list",
      data: [
        {
          id: "paseo-local-model-fallback",
          display_name: "Paseo local model fallback",
          visible: false,
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("must-not-be-exposed");
  });

  test("does not intercept non-Aiden requests or installations without compatible custom models", () => {
    expect(
      runPreloadFetchScenario({
        settings: {
          xCustomModels: {
            hidden: { visible: { codex: false } },
          },
        },
      }),
    ).toEqual({ object: "list", data: [] });
    expect(
      runPreloadFetchScenario({
        settings: {
          xCustomModels: {
            "gpt-5.6": { visible: { codex: true } },
          },
        },
        url: "https://example.com/v2/models",
      }),
    ).toEqual({ object: "list", data: [] });
  });

  test("adds the Codex provider-auth compatibility override without command auth", () => {
    const codexHome = temporaryDirectory("paseo-aiden-codex-home-");
    const preloadPath = materializeAidenModelFallbackPreload(
      temporaryDirectory("paseo-aiden-preload-"),
    );
    const script = `
const childProcess = require("node:child_process");
childProcess.spawn = (_command, args) => {
  process.stdout.write(JSON.stringify(args));
  return {};
};
require(process.argv[1]);
childProcess.spawn("/usr/local/bin/codex", [
  "-c",
  "model_providers.aiden_aiproxy.env_key=\\"AIDEN_X_LOCAL_GATEWAY_API_KEY\\"",
  "app-server",
]);
`;
    const args = JSON.parse(
      execFileSync(process.execPath, ["-e", script, preloadPath], {
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
        },
      }),
    ) as string[];
    expect(args).toEqual([
      "-c",
      'model_providers.aiden_aiproxy.env_key="AIDEN_X_LOCAL_GATEWAY_API_KEY"',
      "-c",
      "model_providers.aiden_aiproxy.requires_openai_auth=false",
      "app-server",
    ]);
  });

  test("removes Aiden env_key overrides when command auth is configured", () => {
    const codexHome = temporaryDirectory("paseo-aiden-codex-home-");
    fs.writeFileSync(
      path.join(codexHome, "config.toml"),
      `[model_providers.aiden_aiproxy]
requires_openai_auth = false

[model_providers.aiden_aiproxy.auth]
command = "aiden"
args = ["auth", "get-bytecloud-jwt-token"]
`,
    );
    const preloadPath = materializeAidenModelFallbackPreload(
      temporaryDirectory("paseo-aiden-preload-"),
    );
    const script = `
const childProcess = require("node:child_process");
childProcess.spawn = (_command, args) => {
  process.stdout.write(JSON.stringify(args));
  return {};
};
require(process.argv[1]);
childProcess.spawn("/usr/local/bin/codex", [
  "--config=model_providers.aiden_aiproxy.env_key=\\"FIRST_KEY\\"",
  "-c",
  "model_providers.aiden_aiproxy.env_key=\\"SECOND_KEY\\"",
  "-c",
  "features.goals=true",
  "resume",
  "thread-id",
]);
`;
    const args = JSON.parse(
      execFileSync(process.execPath, ["-e", script, preloadPath], {
        encoding: "utf8",
        env: {
          ...process.env,
          CODEX_HOME: codexHome,
        },
      }),
    ) as string[];
    expect(args).toEqual(["-c", "features.goals=true", "resume", "thread-id"]);
  });
});
