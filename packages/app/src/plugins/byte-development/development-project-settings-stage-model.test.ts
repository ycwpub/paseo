import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_FLOW_NAVIGATION_STAGES,
  resolveDevelopmentProjectSettingsRoute,
} from "./development-project-settings-stage-model";

describe("development project settings stage", () => {
  it("places Project settings before the PRD workflow stage", () => {
    expect(DEVELOPMENT_FLOW_NAVIGATION_STAGES.slice(0, 2)).toMatchObject([
      { id: "project_settings", kind: "project_settings", label: "Project 设置" },
      { id: "prd", kind: "workflow", label: "PRD" },
    ]);
  });

  it("builds the associated Project settings route", () => {
    expect(
      resolveDevelopmentProjectSettingsRoute({
        serverId: "host a",
        projectId: "project/1",
      }),
    ).toBe("/settings/hosts/host%20a/projects/project%2F1");
  });

  it("disables navigation when the flow has no associated Project", () => {
    expect(
      resolveDevelopmentProjectSettingsRoute({
        serverId: "local",
        projectId: null,
      }),
    ).toBeNull();
  });
});
