import { describe, expect, it } from "vitest";
import { createWorkflowCommand } from "./commands/workflow/index.js";

describe("workflow node run CLI", () => {
  it("documents the node ID option on workflow run", () => {
    const run = createWorkflowCommand().commands.find((command) => command.name() === "run");

    expect(run?.helpInformation()).toContain("--node <node-id>");
  });

  it("supports reusable input presets without requiring inline JSON", () => {
    const run = createWorkflowCommand().commands.find((command) => command.name() === "run");
    const help = run?.helpInformation() ?? "";

    expect(help).toContain("[input-json]");
    expect(help).toContain("--preset <preset-id>");
  });
});
