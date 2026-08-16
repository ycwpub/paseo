import { describe, expect, it } from "vitest";
import { createWorkflowCommand } from "./commands/workflow/index.js";

describe("workflow node run CLI", () => {
  it("documents the node ID option on workflow run", () => {
    const run = createWorkflowCommand().commands.find((command) => command.name() === "run");

    expect(run?.helpInformation()).toContain("--node <node-id>");
    expect(run?.helpInformation()).toContain("--input-type <type>");
    expect(run?.helpInformation()).toContain("upstream-output or node-input");
  });

  it("supports reusable input presets without requiring inline JSON", () => {
    const run = createWorkflowCommand().commands.find((command) => command.name() === "run");
    const help = run?.helpInformation() ?? "";

    expect(help).toContain("[input-json]");
    expect(help).toContain("--preset <preset-id>");
  });

  it("publishes the command-node protocol through help and a discovery command", () => {
    const workflow = createWorkflowCommand();
    const run = workflow.commands.find((command) => command.name() === "run");
    let workflowHelp = "";
    let runHelp = "";

    expect(workflow.commands.map((command) => command.name())).toContain("protocol");
    workflow.configureOutput({
      writeOut(value) {
        workflowHelp += value;
      },
    });
    workflow.outputHelp();
    run?.configureOutput({
      writeOut(value) {
        runHelp += value;
      },
    });
    run?.outputHelp();
    expect(workflowHelp).toContain("paseo workflow protocol --json");
    expect(runHelp).toContain("file descriptor 3");
    expect(runHelp).toContain("stdout is never parsed as a result");
  });
});
