import { describe, expect, test, vi } from "vitest";
import {
  ReasoningTranslationService,
  splitTranslationSource,
} from "./reasoning-translation-service.js";

describe("ReasoningTranslationService", () => {
  test("translates chunks and caches the complete result", async () => {
    const translateChunk = vi.fn(async (_context, text: string) => `中文：${text}`);
    const service = new ReasoningTranslationService({
      resolveAgent: vi.fn(async () => ({ cwd: "/repo", model: "gpt-5.6" })),
      translateChunk,
    });

    await expect(service.translate("agent-1", "Inspect the repository.")).resolves.toBe(
      "中文：Inspect the repository.",
    );
    await expect(service.translate("agent-1", "Inspect the repository.")).resolves.toBe(
      "中文：Inspect the repository.",
    );
    expect(translateChunk).toHaveBeenCalledTimes(1);
  });

  test("rejects requests that cannot resolve to an Aiden Codex agent", async () => {
    const service = new ReasoningTranslationService({
      resolveAgent: vi.fn(async () => null),
      translateChunk: vi.fn(),
    });

    await expect(service.translate("agent-1", "Inspect the repository.")).rejects.toThrow(
      "Aiden Codex agent not found",
    );
  });

  test("splits long reasoning at readable boundaries", () => {
    const source = `${"a".repeat(3_500)}\n\n${"b".repeat(3_500)}`;
    const chunks = splitTranslationSource(source);

    expect(chunks).toHaveLength(2);
    expect(chunks.join("\n\n")).toBe(source);
  });
});
