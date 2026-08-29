/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import HostMemoryDetailRoute from "./hosts/[serverId]/memories/[memoryId]";
import HostMemoryListRoute from "./hosts/[serverId]/memories";
import HostMemorySettingsPageRoute from "./hosts/[serverId]/memory/[memoryPage]";
import ProjectMemoryDetailRoute from "./hosts/[serverId]/projects/[projectId]/memories/[memoryId]";
import ProjectMemoryListRoute from "./hosts/[serverId]/projects/[projectId]/memories";

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

describe("memory settings routes", () => {
  test("renders the host memory list inside the settings shell", () => {
    routeParams = { serverId: "host-1" };
    render(<HostMemoryListRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "memory", serverId: "host-1" }),
    );
  });

  test("renders the host memory detail inside the settings shell", () => {
    routeParams = { serverId: "host-1", memoryId: "memory-1" };
    render(<HostMemoryDetailRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "memory", serverId: "host-1", memoryId: "memory-1" }),
    );
  });

  test("renders a host memory settings page inside the settings shell", () => {
    routeParams = { serverId: "host-1", memoryPage: "summary" };
    render(<HostMemorySettingsPageRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "memory-page", serverId: "host-1", page: "summary" }),
    );
  });

  test("renders the project memory list inside the settings shell", () => {
    routeParams = { serverId: "host-1", projectId: "project-1" };
    render(<ProjectMemoryListRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "memory",
        serverId: "host-1",
        projectId: "project-1",
      }),
    );
  });

  test("renders the project memory detail inside the settings shell", () => {
    routeParams = {
      serverId: "host-1",
      projectId: "project-1",
      memoryId: "memory-1",
    };
    render(<ProjectMemoryDetailRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({
        kind: "memory",
        serverId: "host-1",
        projectId: "project-1",
        memoryId: "memory-1",
      }),
    );
  });
});
