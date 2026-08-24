import { beforeEach, describe, expect, it } from "vitest";

import { i18n } from "@/i18n/i18next";
import { getCompactionMarkerLabel } from "./message-compaction-label";

describe("getCompactionMarkerLabel", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("renders loading, automatic, manual, tokenized, and fallback labels", () => {
    expect(getCompactionMarkerLabel({ status: "loading" })).toBe("Compacting context");
    expect(getCompactionMarkerLabel({ status: "loading", trigger: "auto" })).toBe(
      "Automatically compacting context",
    );
    expect(getCompactionMarkerLabel({ status: "loading", trigger: "manual" })).toBe(
      "Manually compacting context",
    );
    expect(getCompactionMarkerLabel({ status: "completed", trigger: "auto" })).toBe(
      "Context automatically compacted",
    );
    expect(getCompactionMarkerLabel({ status: "completed", trigger: "manual" })).toBe(
      "Context manually compacted",
    );
    expect(getCompactionMarkerLabel({ status: "completed", preTokens: 12_345 })).toBe(
      "Context compacted (12K tokens)",
    );
    expect(getCompactionMarkerLabel({ status: "completed" })).toBe("Context compacted");
  });

  it("renders labels in the active app language", async () => {
    await i18n.changeLanguage("zh-CN");
    try {
      expect(getCompactionMarkerLabel({ status: "loading", trigger: "auto" })).toBe(
        "正在自动压缩上下文",
      );
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});
