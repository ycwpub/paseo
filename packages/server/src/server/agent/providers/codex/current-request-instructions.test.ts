import { describe, expect, test } from "vitest";
import {
  composeCodexDeveloperInstructions,
  PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS,
} from "./current-request-instructions.js";

describe("Codex current request instructions", () => {
  test("keeps the newest user input as the active request", () => {
    expect(PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS).toContain(
      "newest user input supplied with this turn",
    );
    expect(PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS).toContain("gather fresh evidence");
    expect(PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS).toContain(
      "at least one concise commentary progress update",
    );
    expect(PASEO_CODEX_CURRENT_REQUEST_INSTRUCTIONS).toContain(
      "directly answers the newest user input",
    );
  });

  test("combines collaboration, project, daemon, request, and progress instructions", () => {
    const instructions = composeCodexDeveloperInstructions(
      "Built-in plan mode instructions.",
      "Project-specific instructions.",
      "Daemon-specific instructions.",
    );

    expect(instructions).toContain("Built-in plan mode instructions.");
    expect(instructions).toContain("Project-specific instructions.");
    expect(instructions).toContain("Daemon-specific instructions.");
    expect(instructions).toContain("newest user input supplied with this turn");
    expect(instructions).toContain("brief progress updates sent as commentary messages");
    expect(instructions).toContain("Never expose hidden chain-of-thought");
  });
});
