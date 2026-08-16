import { describe, expect, it } from "vitest";
import { applyWorkflowTextIndentation } from "./workflow-text-indentation";

describe("applyWorkflowTextIndentation", () => {
  it("inserts two spaces at the cursor", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "[]",
        selectionStart: 1,
        selectionEnd: 1,
      }),
    ).toEqual({
      value: "[  ]",
      selectionStart: 3,
      selectionEnd: 3,
    });
  });

  it("indents every selected line", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "one\ntwo\nthree",
        selectionStart: 0,
        selectionEnd: 7,
      }),
    ).toEqual({
      value: "  one\n  two\nthree",
      selectionStart: 2,
      selectionEnd: 11,
    });
  });

  it("does not indent the next line when the selection ends after a newline", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "one\ntwo",
        selectionStart: 0,
        selectionEnd: 4,
      }),
    ).toEqual({
      value: "  one\ntwo",
      selectionStart: 2,
      selectionEnd: 6,
    });
  });

  it("outdents selected lines with Shift+Tab", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "  one\n\ttwo\nthree",
        selectionStart: 0,
        selectionEnd: 11,
        outdent: true,
      }),
    ).toEqual({
      value: "one\ntwo\nthree",
      selectionStart: 0,
      selectionEnd: 8,
    });
  });
});
