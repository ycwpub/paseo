import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { getCompactionProgressLabel } from "./message-compaction-progress-label";

describe("getCompactionProgressLabel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("distinguishes automatic and manual compaction while loading", () => {
    expect(getCompactionProgressLabel({ status: "loading", trigger: "auto" })).toBe(
      "Automatically compacting context",
    );
    expect(getCompactionProgressLabel({ status: "loading", trigger: "manual" })).toBe(
      "Manually compacting context",
    );
  });

  it("retains the standard completed labels", () => {
    expect(getCompactionProgressLabel({ status: "completed", trigger: "auto" })).toBe(
      "Context automatically compacted",
    );
    expect(getCompactionProgressLabel({ status: "completed", trigger: "manual" })).toBe(
      "Context manually compacted",
    );
    expect(getCompactionProgressLabel({ status: "completed", preTokens: 12345 })).toBe(
      "Context compacted (12K tokens)",
    );
  });

  it("renders labels in the active app language", async () => {
    await i18n.changeLanguage("zh-CN");
    try {
      expect(getCompactionProgressLabel({ status: "loading", trigger: "auto" })).toBe(
        "正在自动压缩上下文",
      );
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
