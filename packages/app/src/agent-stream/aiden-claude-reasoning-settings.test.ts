import { describe, expect, it } from "vitest";
import { parseAidenClaudeReasoningSettings } from "./aiden-claude-reasoning-settings";

describe("parseAidenClaudeReasoningSettings", () => {
  it("defaults to disabled and accepts a persisted preference", () => {
    expect(parseAidenClaudeReasoningSettings(null)).toEqual({ translateToChinese: false });
    expect(parseAidenClaudeReasoningSettings(JSON.stringify({ translateToChinese: true }))).toEqual(
      { translateToChinese: true },
    );
  });
});
