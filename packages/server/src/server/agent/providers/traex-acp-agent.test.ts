import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../../test-utils/test-logger.js";

const mockState = vi.hoisted(() => ({
  constructorOptions: [] as unknown[],
}));

vi.mock("./trae-acp-agent.js", () => ({
  TraeACPAgentClient: class TraeACPAgentClient {
    protected readonly defaultModes: unknown[] = [];

    constructor(options: unknown) {
      mockState.constructorOptions.push(options);
    }
  },
}));

import {
  TRAEX_DEFAULT_COMMAND,
  TraexACPAgentClient,
  resolveTraexACPCommand,
} from "./traex-acp-agent.js";

describe("TraexACPAgentClient", () => {
  test("uses traex acp serve and the current TraeX permission fallback by default", () => {
    const client = new TraexACPAgentClient({
      logger: createTestLogger(),
    });

    expect(mockState.constructorOptions).toEqual([
      {
        logger: expect.anything(),
        command: TRAEX_DEFAULT_COMMAND,
        env: undefined,
        providerId: "traex",
        label: "TraeX",
        providerParams: undefined,
      },
    ]);
    expect((client as unknown as { defaultModes: unknown[] }).defaultModes).toEqual([
      expect.objectContaining({ id: "default" }),
      expect.objectContaining({ id: "auto" }),
      expect.objectContaining({ id: "plan" }),
      expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
    ]);
  });

  test("supports replacement command and environment overrides", () => {
    const client = new TraexACPAgentClient({
      logger: createTestLogger(),
      runtimeSettings: {
        command: {
          mode: "replace",
          argv: ["/opt/traex", "acp", "serve", "--enable", "example"],
        },
        env: {
          TRAE_HOME: "/tmp/traex-home",
        },
      },
      providerParams: {
        supportsMcpServers: true,
      },
    });

    expect(client).toBeInstanceOf(TraexACPAgentClient);
    expect(mockState.constructorOptions.at(-1)).toEqual(
      expect.objectContaining({
        command: ["/opt/traex", "acp", "serve", "--enable", "example"],
        env: {
          TRAE_HOME: "/tmp/traex-home",
        },
        providerParams: {
          supportsMcpServers: true,
        },
      }),
    );
  });

  test("appends provider arguments after the default ACP command", () => {
    expect(
      resolveTraexACPCommand({
        command: {
          mode: "append",
          args: ["--disable", "example"],
        },
      }),
    ).toEqual(["traex", "acp", "serve", "--disable", "example"]);
  });
});
