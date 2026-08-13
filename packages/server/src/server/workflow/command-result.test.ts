import { describe, expect, it } from "vitest";
import {
  MAX_WORKFLOW_RESULT_CHARS,
  parseCommandNodeResult,
  WorkflowNodeBusinessError,
} from "./command-result.js";

describe("parseCommandNodeResult", () => {
  it("parses the version 1 result envelope and applies framework defaults", () => {
    expect(
      parseCommandNodeResult({
        resultJson: JSON.stringify({
          data: {
            customer: { name: "Alice" },
          },
        }),
        resultExceededLimit: false,
        commandType: "Bash",
      }),
    ).toEqual({
      data: {
        customer: { name: "Alice" },
      },
      modify: {
        workflow: { var: {} },
        node: { var: {} },
      },
      base_resp: {
        status_code: 0,
        status_msg: "",
        forbid_retry: 0,
      },
      artifacts: [],
    });
  });

  it("rejects multiple JSON documents", () => {
    expect(() =>
      parseCommandNodeResult({
        resultJson: '{"data":{"value":"first"}}\n{"data":{"value":"second"}}',
        resultExceededLimit: false,
        commandType: "Bash",
      }),
    ).toThrow("Workflow node result is not valid JSON");
  });

  it("rejects removed flow control", () => {
    expect(() =>
      parseCommandNodeResult({
        resultJson: '{"data":{},"flow":{"action":"next"}}',
        resultExceededLimit: false,
        commandType: "Python",
      }),
    ).toThrow("must use the envelope");
  });

  it("reports base_resp failures with retry policy", () => {
    let thrown: unknown;
    try {
      parseCommandNodeResult({
        resultJson: JSON.stringify({
          data: {},
          base_resp: {
            status_code: 7,
            status_msg: "do not retry",
            forbid_retry: 1,
          },
        }),
        resultExceededLimit: false,
        commandType: "Bash",
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkflowNodeBusinessError);
    expect(thrown).toMatchObject({
      message: "do not retry",
      forbidRetry: true,
    });
  });

  it("fails explicit result overflow instead of parsing truncated JSON", () => {
    expect(() =>
      parseCommandNodeResult({
        resultJson: "x".repeat(MAX_WORKFLOW_RESULT_CHARS),
        resultExceededLimit: true,
        commandType: "Bash",
      }),
    ).toThrow(`Bash workflow node result exceeded ${MAX_WORKFLOW_RESULT_CHARS} characters`);
  });
});
