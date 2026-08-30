import { describe, expect, it } from "vitest";
import {
  getHostSectionAfterHostSwitch,
  getSettingsViewServerId,
} from "./settings-feature-route-model";

describe("settings feature routes", () => {
  it("keeps global and project memory under the correct host section", () => {
    expect(
      getHostSectionAfterHostSwitch({
        kind: "memory",
        serverId: "host",
      }),
    ).toBe("memory");
    expect(
      getHostSectionAfterHostSwitch({
        kind: "memory",
        serverId: "host",
        projectId: "project",
      }),
    ).toBe("projects");
    expect(
      getHostSectionAfterHostSwitch({
        kind: "resource-sync",
        serverId: "host",
        page: "memory",
      }),
    ).toBe("connections");
  });

  it("resolves the host for nested feature routes", () => {
    expect(
      getSettingsViewServerId({
        kind: "assistant",
        serverId: "host",
        assistantId: "assistant",
      }),
    ).toBe("host");
    expect(
      getSettingsViewServerId({
        kind: "resource-sync",
        serverId: "host",
        page: "knowledge",
      }),
    ).toBe("host");
    expect(
      getSettingsViewServerId({
        kind: "assistant-memory",
        serverId: "host",
        assistantId: "assistant",
      }),
    ).toBe("host");
    expect(getSettingsViewServerId({ kind: "section", section: "general" })).toBeNull();
  });

  it("keeps Assistant memory under the Assistant host section", () => {
    expect(
      getHostSectionAfterHostSwitch({
        kind: "assistant-memory",
        serverId: "host",
        assistantId: "assistant",
      }),
    ).toBe("assistants");
  });
});
