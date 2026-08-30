import { describe, expect, test } from "vitest";
import { buildProjectLarkGroupSettingsRoute } from "./host-feature-routes";

describe("Project 飞书群配置 routes", () => {
  test("builds create and edit routes", () => {
    expect(buildProjectLarkGroupSettingsRoute("host a", "project/1")).toBe(
      "/settings/hosts/host%20a/projects/project%2F1/lark-groups/new",
    );
    expect(buildProjectLarkGroupSettingsRoute("host a", "project/1", "group/1")).toBe(
      "/settings/hosts/host%20a/projects/project%2F1/lark-groups/group%2F1",
    );
  });
});
