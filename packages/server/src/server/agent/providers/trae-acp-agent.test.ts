import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";

const mockState = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
}));

vi.mock("./generic-acp-agent.js", () => ({
  GenericACPAgentClient: class GenericACPAgentClient {
    protected readonly defaultModes: unknown[] = [];

    constructor(options: unknown) {
      mockState.constructorOptions.push(options);
    }
  },
}));

import { TraeACPModeFallbackAgentClient } from "./trae-acp-mode-fallback-agent.js";

describe("TraeACPModeFallbackAgentClient", () => {
  test("provides Trae permission modes when ACP discovery omits them", () => {
    const client = new TraeACPModeFallbackAgentClient({
      logger: createTestLogger(),
      command: ["traecli", "acp", "serve"],
      providerId: "traecli",
      label: "TRAE CLI",
    });

    expect(mockState.constructorOptions).toEqual([
      expect.objectContaining({
        waitForInitialCommands: true,
      }),
    ]);
    expect(mockState.constructorOptions[0]).not.toHaveProperty("defaultModes");
    expect((client as unknown as { defaultModes: unknown[] }).defaultModes).toEqual([
      expect.objectContaining({ id: "default" }),
      expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
      expect.objectContaining({ id: "plan" }),
    ]);
  });
});
