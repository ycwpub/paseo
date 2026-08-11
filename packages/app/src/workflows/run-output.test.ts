import { describe, expect, it } from "vitest";
import { parseWorkflowProcessOutput } from "./run-output";

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
