import { describe, expect, it } from "vitest";
import { parseScheduledWorkflowCommand } from "./workflow-command.js";

describe("parseScheduledWorkflowCommand", () => {
  it("parses the workflow CLI command copied from the usage guide", () => {
    expect(
      parseScheduledWorkflowCommand(
        `paseo workflow run '/Users/test/.paseo/workflows/flow1.json' '{"control":"","name":"Alice"}'`,
      ),
    ).toEqual({
      scriptPath: "/Users/test/.paseo/workflows/flow1.json",
      inputPayload: '{"control":"","name":"Alice"}',
      background: false,
    });
  });

  it("accepts an absolute executable and background mode", () => {
    expect(
      parseScheduledWorkflowCommand(
        `'/Applications/Paseo.app/Contents/Resources/bin/paseo' workflow run "/tmp/flow.json" "{}" --background`,
      ),
    ).toEqual({
      scriptPath: "/tmp/flow.json",
      inputPayload: "{}",
      background: true,
    });
  });

  it("does not intercept general bash commands or commands with shell operators", () => {
    expect(parseScheduledWorkflowCommand("echo paseo workflow run /tmp/a.json '{}'")).toBeNull();
    expect(
      parseScheduledWorkflowCommand("paseo workflow run /tmp/a.json '{}' && echo unsafe"),
    ).toBeNull();
  });
});
