import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createAidenRuntimeEnvOverlay } from "./runtime-compat.js";
import {
  prepareAidenCodexHome,
  resolveAidenCodexHome,
  type AidenCodexHomeFallback,
} from "./codex-home.js";

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Aiden Codex home selection", () => {
  test("preserves an explicitly configured writable home", () => {
    const root = temporaryDirectory("paseo-aiden-home-explicit-");
    const configuredHome = path.join(root, "configured");

    expect(
      prepareAidenCodexHome({
        baseEnv: { CODEX_HOME: configuredHome },
        homeDir: path.join(root, "home"),
      }),
    ).toBe(configuredHome);
    expect(fs.readFileSync(path.join(configuredHome, "config.toml"), "utf8")).toContain(
      "requires_openai_auth = false",
    );
  });

  test("falls back to the standard user home when configured CODEX_HOME is unusable", () => {
    const root = temporaryDirectory("paseo-aiden-home-fallback-");
    const homeDir = path.join(root, "home");
    const blockingFile = path.join(root, "not-a-directory");
    fs.writeFileSync(blockingFile, "blocked");
    const configuredHome = path.join(blockingFile, "aiden-app-home");
    const onFallback = vi.fn<(fallback: AidenCodexHomeFallback) => void>();

    const resolvedHome = prepareAidenCodexHome({
      baseEnv: { CODEX_HOME: configuredHome },
      homeDir,
      onFallback,
    });

    expect(resolvedHome).toBe(path.join(homeDir, ".codex", "aiden-app-home"));
    expect(onFallback).toHaveBeenCalledWith({
      configuredHome,
      resolvedHome,
      errorCode: "ENOTDIR",
    });
  });

  test("falls back instead of failing when configured CODEX_HOME raises EACCES", () => {
    const root = temporaryDirectory("paseo-aiden-home-eacces-");
    const homeDir = path.join(root, "home");
    const configuredHome = path.join(root, "configured");
    fs.mkdirSync(configuredHome);
    const configPath = path.join(configuredHome, "config.toml");
    fs.writeFileSync(configPath, 'model = "existing"\n', { mode: 0o400 });
    const onFallback = vi.fn<(fallback: AidenCodexHomeFallback) => void>();

    const resolvedHome = prepareAidenCodexHome({
      baseEnv: { CODEX_HOME: configuredHome },
      homeDir,
      onFallback,
    });

    expect(resolvedHome).toBe(path.join(homeDir, ".codex", "aiden-app-home"));
    expect(onFallback).toHaveBeenCalledWith({
      configuredHome,
      resolvedHome,
      errorCode: "EACCES",
    });
  });

  test("falls back to PASEO_HOME when the standard user home is unusable", () => {
    const root = temporaryDirectory("paseo-aiden-home-paseo-");
    const homeDir = path.join(root, "home");
    const paseoHome = path.join(root, "paseo-home");
    fs.mkdirSync(homeDir);
    fs.writeFileSync(path.join(homeDir, ".codex"), "blocked");

    expect(
      prepareAidenCodexHome({
        baseEnv: { PASEO_HOME: paseoHome },
        homeDir,
      }),
    ).toBe(path.join(paseoHome, "provider-homes", "aiden-codex"));
  });

  test("normalizes tilde paths against the daemon user's home", () => {
    const root = temporaryDirectory("paseo-aiden-home-tilde-");
    const homeDir = path.join(root, "home");

    expect(resolveAidenCodexHome({ CODEX_HOME: "~/codex/aiden-app-home" }, homeDir)).toBe(
      path.join(homeDir, "codex", "aiden-app-home"),
    );
  });

  test("runtime overlay replaces a stale persisted home instead of throwing EACCES-like errors", () => {
    const root = temporaryDirectory("paseo-aiden-home-overlay-");
    const homeDir = path.join(root, "home");
    const blockingFile = path.join(root, "not-a-directory");
    fs.writeFileSync(blockingFile, "blocked");
    const configuredHome = path.join(blockingFile, "aiden-app-home");
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(homeDir);
    const onCodexHomeFallback = vi.fn<(fallback: AidenCodexHomeFallback) => void>();

    const overlay = createAidenRuntimeEnvOverlay({
      providerId: "aiden-codex",
      target: "codex",
      baseEnv: {
        CODEX_HOME: configuredHome,
        PASEO_HOME: path.join(root, "paseo-home"),
      },
      onCodexHomeFallback,
    });

    expect(homedirSpy).toHaveBeenCalled();
    expect(overlay.CODEX_HOME).toBe(path.join(homeDir, ".codex", "aiden-app-home"));
    expect(onCodexHomeFallback).toHaveBeenCalledOnce();
  });
});
