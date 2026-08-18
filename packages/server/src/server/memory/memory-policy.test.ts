import { describe, expect, test } from "vitest";
import {
  isExplicitMemoryRequest,
  parseMemoryCommand,
  resolveMemoryMode,
  selectMemoryScope,
} from "./memory-policy.js";

describe("memory policy", () => {
  test("parses temporary mode and forget controls in English and Chinese", () => {
    expect(parseMemoryCommand("/memory read-only")).toEqual({
      type: "set-mode",
      mode: "read-only",
    });
    expect(parseMemoryCommand("/记忆 忘记 构建流程")).toEqual({
      type: "forget",
      query: "构建流程",
      all: false,
    });
    expect(parseMemoryCommand("删除所有记忆")).toEqual({
      type: "forget",
      query: "",
      all: true,
    });
  });

  test("keeps explicit remember requests separate from forget requests", () => {
    expect(isExplicitMemoryRequest("Please remember that I prefer Chinese.")).toBe(true);
    expect(isExplicitMemoryRequest("请忘记旧的构建流程")).toBe(false);
  });

  test("defaults project procedures to project scope and user preferences to global scope", () => {
    const scopes = [{ type: "global" as const }, { type: "project" as const, id: "project-1" }];
    expect(selectMemoryScope(undefined, scopes, "procedure")).toEqual({
      type: "project",
      id: "project-1",
    });
    expect(selectMemoryScope(undefined, scopes, "preference")).toEqual({ type: "global" });
  });

  test("resolves invalid or absent labels to enabled mode", () => {
    expect(resolveMemoryMode({})).toBe("on");
    expect(resolveMemoryMode({ "paseo.memory-mode": "read-only" })).toBe("read-only");
    expect(resolveMemoryMode({ "paseo.memory-mode": "unexpected" })).toBe("on");
  });
});
