/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import ProjectKnowledgeRoute from "./hosts/[serverId]/projects/[projectId]/knowledge";

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

describe("Project 知识 route", () => {
  test("renders the second-level settings view", () => {
    routeParams = { serverId: "host-1", projectId: "project-1" };
    render(<ProjectKnowledgeRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "project-knowledge",
        serverId: "host-1",
        projectId: "project-1",
      }),
    );
  });
});
