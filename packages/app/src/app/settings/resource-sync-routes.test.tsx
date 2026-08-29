/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import HostResourceSyncRoute from "./hosts/[serverId]/connections/sync/[syncResource]";

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

describe("host resource sync routes", () => {
  test("renders the selected resource sync page inside the settings shell", () => {
    routeParams = { serverId: "host-1", syncResource: "knowledge" };
    render(<HostResourceSyncRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "resource-sync", serverId: "host-1", page: "knowledge" }),
    );
  });

  test("falls back to memory sync for an unknown resource", () => {
    routeParams = { serverId: "host-1", syncResource: "unknown" };
    render(<HostResourceSyncRoute />);

    expect(screen.getByTestId("settings-screen").textContent).toBe(
      JSON.stringify({ kind: "resource-sync", serverId: "host-1", page: "memory" }),
    );
  });
});
