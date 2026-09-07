import { describe, expect, it } from "vitest";
import { createCli } from "./cli.js";
describe("canonical CLI surface", () => {
  it("exposes workflow cancellation as an operational control", () => {
    const workflow = createCli().commands.find((command) => command.name() === "workflow");
    expect(workflow?.commands.map((command) => command.name())).toContain("cancel");
  });
});
