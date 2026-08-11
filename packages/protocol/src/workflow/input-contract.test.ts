import { describe, expect, it } from "vitest";
import {
  applyWorkflowInputContract,
  validateWorkflowInputContractDefinition,
  type WorkflowInputContract,
} from "./input-contract.js";

const contract: WorkflowInputContract = {
  properties: {
    scan_dir_url: { type: "string" },
    group_ids: { type: "array", default: [] },
    max_work_items: { type: "integer", default: 0 },
  },
  required: ["scan_dir_url", "group_ids"],
  additionalProperties: false,
};

describe("workflow input contract", () => {
  it("applies defaults and reports missing required fields before execution", () => {
    expect(applyWorkflowInputContract(contract, { control: "" })).toEqual({
      payload: {
        control: "",
        group_ids: [],
        max_work_items: 0,
      },
      issues: [
        {
          path: "scan_dir_url",
          code: "required",
          message: 'Workflow input field "scan_dir_url" is required',
        },
      ],
    });
  });

  it("validates types, allowed values, and additional properties", () => {
    const validation = applyWorkflowInputContract(
      {
        properties: {
          mode: { type: "string", enum: ["scan_only", "full"] },
          count: { type: "integer" },
        },
        additionalProperties: false,
      },
      { control: "", mode: "prepare_only", count: 1.5, extra: true },
    );

    expect(validation.issues.map((issue) => issue.code)).toEqual([
      "enum",
      "type",
      "additional_property",
    ]);
  });

  it("rejects required names and defaults that do not match the contract", () => {
    expect(
      validateWorkflowInputContractDefinition({
        properties: {
          count: { type: "integer", default: "ten" },
        },
        required: ["missing"],
      }).map((issue) => issue.path),
    ).toEqual(["missing", "count"]);
  });
});
