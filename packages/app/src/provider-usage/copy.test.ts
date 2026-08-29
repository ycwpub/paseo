import { describe, expect, it } from "vitest";
import {
  formatProviderUsageError,
  isProviderUsageTemporarilyUnavailable,
  providerUsageCopy,
} from "./copy";

describe("provider usage copy", () => {
  it("uses Chinese copy for the usage page", () => {
    expect(providerUsageCopy.title).toBe("使用情况");
    expect(providerUsageCopy.refresh).toBe("刷新");
  });

  it("does not expose the internal Aiden command when the model list is empty", () => {
    const raw =
      "Command failed: aiden x models --json --claude --no-cache --timeout 15000 - Aiden aiproxy models API returned an empty model list for claudecode.";

    expect(formatProviderUsageError(raw)).toBe(
      "Aiden 当前未返回可用模型，暂无用量数据，请稍后重试。",
    );
    expect(formatProviderUsageError(raw)).not.toContain("aiden x models");
    expect(isProviderUsageTemporarilyUnavailable(raw)).toBe(true);
  });

  it("provides an actionable login message without exposing authentication internals", () => {
    const raw =
      "Interactive ByteCloud Auth login is required but no TTY is available. device_code failed.";

    expect(formatProviderUsageError(raw)).toBe(
      "Aiden 登录状态不可用，请先在终端完成 Aiden 登录后重试。",
    );
  });
});
