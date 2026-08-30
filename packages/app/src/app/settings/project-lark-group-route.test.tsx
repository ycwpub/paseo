/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import ProjectLarkGroupRoute from "./hosts/[serverId]/projects/[projectId]/lark-groups/[groupId]";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

let routeParams: Record<string, string> = {};

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => routeParams,
}));

vi.mock("@/components/host-route-bootstrap-boundary", () => ({
  HostRouteBootstrapBoundary: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/screens/settings-screen", () => ({
  default: ({ view }: { view: unknown }) => (
    <div data-testid="settings-screen">{JSON.stringify(view)}</div>
  ),
}));

afterEach(() => {
  cleanup();
  routeParams = {};
});

describe("Project 飞书群创建和编辑 route", () => {
  test("maps new to a create view", () => {
    routeParams = { serverId: "host-1", projectId: "project-1", groupId: "new" };
    render(<ProjectLarkGroupRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "project-lark-group",
        serverId: "host-1",
        projectId: "project-1",
      }),
    );
  });

  test("passes an existing group id to the edit view", () => {
    routeParams = {
      serverId: "host-1",
      projectId: "project-1",
      groupId: "group-1",
    };
    render(<ProjectLarkGroupRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "project-lark-group",
        serverId: "host-1",
        projectId: "project-1",
        groupId: "group-1",
      }),
    );
  });
});
