import { describe, expect, it } from "vitest";
import { parseScheduledWorkflowCommand } from "./workflow-command.js";

describe("scheduled workflow node commands", () => {
  it("parses a target node ID with foreground or background execution", () => {
    expect(
      parseScheduledWorkflowCommand(
        `paseo workflow run "/tmp/flow.json" '{"control":""}' --node worker`,
      ),
    ).toEqual({
      scriptPath: "/tmp/flow.json",
      inputPayload: '{"control":""}',
      targetNodeId: "worker",
      background: false,
    });

    expect(
      parseScheduledWorkflowCommand(
        `paseo workflow run --node worker --input-type node-input "/tmp/flow.json" '{}' --background`,
      ),
    ).toEqual({
      scriptPath: "/tmp/flow.json",
      inputPayload: "{}",
      targetNodeId: "worker",
      targetInputMode: "node_input",
      background: true,
    });
  });

  it("rejects --node without a node ID", () => {
    expect(parseScheduledWorkflowCommand(`paseo workflow run "/tmp/flow.json" '{}' --node`)).toBe(
      null,
    );
  });

  it("rejects input types without a node or with an unknown value", () => {
    expect(
      parseScheduledWorkflowCommand(
        `paseo workflow run "/tmp/flow.json" '{}' --input-type node-input`,
      ),
    ).toBeNull();
    expect(
      parseScheduledWorkflowCommand(
        `paseo workflow run "/tmp/flow.json" '{}' --node worker --input-type direct`,
      ),
    ).toBeNull();
  });
});
