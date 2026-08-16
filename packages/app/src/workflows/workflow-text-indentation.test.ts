import { describe, expect, it } from "vitest";
import { applyWorkflowTextIndentation } from "./workflow-text-indentation";

describe("applyWorkflowTextIndentation", () => {
  it("inserts four spaces at the cursor", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "[]",
        selectionStart: 1,
        selectionEnd: 1,
      }),
    ).toEqual({
      value: "[    ]",
      selectionStart: 5,
      selectionEnd: 5,
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
      value: "    one\n    two\nthree",
      selectionStart: 4,
      selectionEnd: 15,
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
      value: "    one\ntwo",
      selectionStart: 4,
      selectionEnd: 8,
    });
  });

  it("outdents selected lines with Shift+Tab", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "    one\n\ttwo\nthree",
        selectionStart: 0,
        selectionEnd: 13,
        outdent: true,
      }),
    ).toEqual({
      value: "one\ntwo\nthree",
      selectionStart: 0,
      selectionEnd: 8,
    });
  });

  it("removes up to four leading spaces when outdenting", () => {
    expect(
      applyWorkflowTextIndentation({
        value: "  one\n        two",
        selectionStart: 0,
        selectionEnd: 17,
        outdent: true,
      }),
    ).toEqual({
      value: "one\n    two",
      selectionStart: 0,
      selectionEnd: 11,
    });
  });
});
