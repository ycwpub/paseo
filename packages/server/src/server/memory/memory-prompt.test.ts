import { describe, expect, test } from "vitest";
import { stripMemoryFromPromptText } from "./memory-prompt.js";

describe("stripMemoryFromPromptText", () => {
  test("removes legacy memory envelopes from persisted user messages", () => {
    expect(
      stripMemoryFromPromptText(
        "<paseo-memory>\nlegacy memory content\n</paseo-memory>\n\noriginal user input",
      ),
    ).toBe("original user input");
  });

  test("keeps ordinary user input unchanged", () => {
    expect(stripMemoryFromPromptText("original user input")).toBe("original user input");
  });
});
