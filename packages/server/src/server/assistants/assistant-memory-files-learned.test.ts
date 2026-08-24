import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  materializeAssistantMemoryFiles,
  removeAssistantMemoryFiles,
  removeAssistantMemorySourceFiles,
} from "./assistant-memory-files.js";

describe("Assistant memory file ownership", () => {
  let paseoHome: string;
  const assistantId = "assistant-1";

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-assistant-memory-"));
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("rewriting configured memory preserves learned memory projections", async () => {
    const learnedPath = path.join(
      paseoHome,
      "assistants",
      assistantId,
      "memory",
      "learned",
      "summary.md",
    );
    await mkdir(path.dirname(learnedPath), { recursive: true });
    await writeFile(learnedPath, "learned memory");

    materializeAssistantMemoryFiles({
      paseoHome,
      assistantId,
      memoryEnabled: true,
      memory: "# Preferences\n\nPrefer concise answers.",
    });
    expect(existsSync(learnedPath)).toBe(true);

    removeAssistantMemorySourceFiles(paseoHome, assistantId);
    expect(existsSync(learnedPath)).toBe(true);

    removeAssistantMemoryFiles(paseoHome, assistantId);
    expect(existsSync(learnedPath)).toBe(false);
  });
});
