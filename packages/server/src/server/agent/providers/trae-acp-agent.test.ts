import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";

const mockState = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
}));

vi.mock("./generic-acp-agent.js", () => ({
  GenericACPAgentClient: function GenericACPAgentClient(options: unknown) {
    mockState.constructorOptions.push(options);
  },
}));

import { TraeACPAgentClient } from "./trae-acp-agent.js";

describe("TraeACPAgentClient", () => {
  test("provides Trae permission modes when ACP discovery omits them", () => {
    const _client = new TraeACPAgentClient({
      logger: createTestLogger(),
      command: ["traecli", "acp", "serve"],
      providerId: "traecli",
      label: "TRAE CLI",
    });
    void _client;

    expect(mockState.constructorOptions).toEqual([
      expect.objectContaining({
        defaultModes: [
          expect.objectContaining({ id: "default" }),
          expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
          expect.objectContaining({ id: "plan" }),
        ],
        waitForInitialCommands: true,
      }),
    ]);
  });
});
