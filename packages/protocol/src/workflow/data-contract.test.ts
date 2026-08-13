import { describe, expect, it } from "vitest";
import { WorkflowNodeResultEnvelopeSchema } from "./data-contract.js";

describe("WorkflowNodeResultEnvelopeSchema", () => {
  it("separates business outputs, artifacts, and flow control", () => {
    expect(
      WorkflowNodeResultEnvelopeSchema.parse({
        outputs: { approved: true },
        artifacts: [
          {
            name: "report",
            uri: "file:///tmp/report.json",
            mediaType: "application/json",
            size: 42,
          },
        ],
        flow: { action: "branch", value: "approved" },
      }),
    ).toEqual({
      outputs: { approved: true },
      artifacts: [
        {
          name: "report",
          uri: "file:///tmp/report.json",
          mediaType: "application/json",
          size: 42,
        },
      ],
      flow: { action: "branch", value: "approved" },
    });
  });

  it("defaults optional framework fields without adding them to outputs", () => {
    expect(WorkflowNodeResultEnvelopeSchema.parse({ outputs: { answer: "ok" } })).toEqual({
      outputs: { answer: "ok" },
      artifacts: [],
      flow: { action: "next" },
    });
  });
});
