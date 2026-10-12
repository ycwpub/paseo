import { describe, expect, test } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";
import { TraeACPAgentClient } from "./trae-acp-agent.js";
import { TraeACPModeFallbackAgentClient } from "./trae-acp-mode-fallback-agent.js";

class TestTraeACPAgentClient extends TraeACPAgentClient {
  getLaunchCommand() {
    return this.resolveLaunchCommand();
  }
}

class TestTraeACPModeFallbackAgentClient extends TraeACPModeFallbackAgentClient {
  getDefaultModes() {
    return this.defaultModes;
  }
}

describe("TraeACPAgentClient", () => {
  test("passes reasoning summary config without shell-only quotes", async () => {
    const client = new TestTraeACPAgentClient({
      logger: createTestLogger(),
      command: ["traecli", "acp", "serve"],
      providerId: "traecli",
      label: "TRAE CLI",
    });

    await expect(client.getLaunchCommand()).resolves.toEqual({
      command: "traecli",
      args: [
        "acp",
        "serve",
        "-c",
        "hide_agent_reasoning=false",
        "-c",
        "model_reasoning_summary=auto",
      ],
    });
  });
});

describe("TraeACPModeFallbackAgentClient", () => {
  test("provides Trae permission modes when ACP discovery omits them", () => {
    const client = new TestTraeACPModeFallbackAgentClient({
      logger: createTestLogger(),
      command: ["traecli", "acp", "serve"],
      providerId: "traecli",
      label: "TRAE CLI",
    });

    expect(client.getDefaultModes()).toEqual([
      expect.objectContaining({ id: "default" }),
      expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
      expect.objectContaining({ id: "plan" }),
    ]);
  });
});
