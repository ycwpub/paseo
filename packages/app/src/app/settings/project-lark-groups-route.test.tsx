/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import ProjectLarkGroupsRoute from "./hosts/[serverId]/projects/[projectId]/lark-groups";

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

describe("Project 飞书群上下文 route", () => {
  test("renders the second-level settings view", () => {
    routeParams = { serverId: "host-1", projectId: "project-1" };
    render(<ProjectLarkGroupsRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "project-lark-groups",
        serverId: "host-1",
        projectId: "project-1",
      }),
    );
  });
});
