import { describe, expect, it } from "vitest";
import { parseLegacyWorkflowAgentOutput, parseWorkflowProcessOutput } from "./run-output";

describe("parseLegacyWorkflowAgentOutput", () => {
  it("separates the user prompt and removes a duplicated final Agent response", () => {
    expect(
      parseLegacyWorkflowAgentOutput(
        [
          "[User] 执行下面的指令",
          "你好，1+1等于几",
          '{"control":"","error":"","answer":"2"}',
          "",
          '{"control":"","error":"","answer":"2"}',
        ].join("\n"),
      ),
    ).toEqual({
      prompt: "执行下面的指令\n你好，1+1等于几",
      response: '{"control":"","error":"","answer":"2"}',
      fallback: null,
    });
  });

  it("keeps legacy output unchanged when the final response is not duplicated", () => {
    expect(parseLegacyWorkflowAgentOutput("[User] hello\n\nworld")).toEqual({
      prompt: null,
      response: null,
      fallback: "[User] hello\n\nworld",
    });
  });
});

describe("parseWorkflowProcessOutput", () => {
  it("separates stdout and stderr without truncating multiline content", () => {
    expect(
      parseWorkflowProcessOutput(
        'stdout:\n{"control":"","error":"","prompt":"你好"}\nline 2\n\nstderr:\nwarning\nline 2',
      ),
    ).toEqual([
      {
        stream: "stdout",
        value: '{"control":"","error":"","prompt":"你好"}\nline 2',
      },
      {
        stream: "stderr",
        value: "warning\nline 2",
      },
    ]);
  });

  it("keeps stdout-only and legacy output readable", () => {
    expect(parseWorkflowProcessOutput("stdout:\ncomplete")).toEqual([
      { stream: "stdout", value: "complete" },
    ]);
    expect(parseWorkflowProcessOutput("legacy output")).toEqual([
      { stream: "stdout", value: "legacy output" },
    ]);
  });
});
