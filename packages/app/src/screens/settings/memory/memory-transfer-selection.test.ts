import { describe, expect, test } from "vitest";
import type { Assistant, PaseoMemoryState } from "@getpaseo/protocol/messages";
import {
  buildMemoryTransferSelectionOptions,
  memoryTransferSelectionKey,
  memoryTransferSelectionLabel,
} from "./memory-transfer-selection";

const memory = {
  users: [
    {
      id: "default",
      name: "默认用户",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    },
  ],
  activeUserId: "default",
} as PaseoMemoryState;

const assistants = [
  { id: "assistant-1", name: "研发助手" },
  { id: "assistant-2", name: "测试助手" },
] as Assistant[];

describe("memory transfer selections", () => {
  test("lists all, Global, and each Assistant memory scope", () => {
    const options = buildMemoryTransferSelectionOptions({ memory, assistants });

    expect(options.map((option) => option.label)).toEqual([
      "全部记忆",
      "全局记忆",
      "助手记忆 · 研发助手",
      "助手记忆 · 测试助手",
    ]);
    expect(options[1]?.description).toBe("默认用户");
    expect(options[2]?.value).toEqual({ type: "assistant", id: "assistant-1" });
  });

  test("uses stable keys and readable replacement labels", () => {
    expect(memoryTransferSelectionKey({ type: "all" })).toBe("all:");
    expect(memoryTransferSelectionKey({ type: "global" })).toBe("global:");
    expect(memoryTransferSelectionKey({ type: "assistant", id: "assistant-1" })).toBe(
      "assistant:assistant-1",
    );
    expect(memoryTransferSelectionLabel({ type: "assistant", id: "assistant-1" }, assistants)).toBe(
      "研发助手的助手记忆",
    );
  });
});
