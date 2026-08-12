import { describe, expect, it } from "vitest";
import { MAX_WORKFLOW_RESULT_CHARS, parseCommandNodeResult } from "./command-result.js";

describe("parseCommandNodeResult", () => {
  it("parses one complete JSON document and adds framework-owned defaults", () => {
    expect(
      parseCommandNodeResult({
        resultJson: JSON.stringify({
          control: "next",
          customer: { name: "Alice" },
        }),
        resultExceededLimit: false,
        commandType: "Bash",
      }),
    ).toEqual({
      control: "next",
      error: "",
      customer: { name: "Alice" },
    });
  });

  it("does not treat stdout-shaped text or multiple JSON documents as a result", () => {
    const result = parseCommandNodeResult({
      resultJson: '{"control":"first"}\n{"control":"second"}',
      resultExceededLimit: false,
      commandType: "Bash",
    });

    expect(result).toEqual({
      control: "",
      error: expect.stringContaining("Workflow node result is not valid JSON"),
    });
  });

  it("reserves error reporting for the workflow framework", () => {
    const result = parseCommandNodeResult({
      resultJson: '{"control":"","error":"failed"}',
      resultExceededLimit: false,
      commandType: "Python",
    });

    expect(result).toEqual({
      control: "",
      error:
        'Workflow node result must not contain reserved field "error"; use a non-zero exit code and stderr to report failure',
    });
  });

  it("fails explicit result overflow instead of parsing truncated JSON", () => {
    expect(
      parseCommandNodeResult({
        resultJson: "x".repeat(MAX_WORKFLOW_RESULT_CHARS),
        resultExceededLimit: true,
        commandType: "Bash",
      }),
    ).toEqual({
      control: "",
      error: `Bash workflow node result exceeded ${MAX_WORKFLOW_RESULT_CHARS} characters`,
    });
  });
});
