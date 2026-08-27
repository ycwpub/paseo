/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop -- Test adapters map native callbacks to HTML controls. */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginHttpJob } from "@getpaseo/protocol/messages";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

vi.mock("react-native", () => ({
  View: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Pressable: ({
    children,
    onPress,
    accessibilityRole,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityRole?: string;
  }) => (
    <button type="button" role={accessibilityRole} onClick={onPress}>
      {children}
    </button>
  ),
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
  },
  withUnistyles: (component: React.ComponentType<Record<string, unknown>>) => component,
}));

vi.mock("lucide-react-native", () => ({
  CheckSquare2: () => null,
  RefreshCw: () => null,
  RotateCcw: () => null,
  Square: () => null,
  Trash2: () => null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));

import { HttpServiceRequestList } from "./http-service-request-list";

function createJob(id: string): PluginHttpJob {
  return {
    id,
    pluginId: "workflow-http-service",
    serviceName: "project-1:listener-1:default",
    projectId: "project-1",
    listenerId: "listener-1",
    routeId: "default",
    status: "succeeded",
    input: { name: "test" },
    result: { status: "done" },
    workflowRunId: "workflow-run-1",
    error: null,
    errorCode: null,
    createdAt: "2026-08-27T00:58:43.000Z",
    startedAt: "2026-08-27T00:58:43.000Z",
    endedAt: "2026-08-27T00:58:44.000Z",
  };
}

describe("HttpServiceRequestList", () => {
  afterEach(cleanup);

  it("replays an expanded request with its persisted input", async () => {
    const original = createJob("request-original");
    const replayed = createJob("request-replayed");
    const onReplay = vi.fn(async () => replayed);

    render(
      <HttpServiceRequestList
        jobs={[original]}
        loading={false}
        onRefresh={vi.fn()}
        onReplay={onReplay}
        onDeleteMany={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByText("request-original"));
    fireEvent.click(screen.getByText("回放请求"));

    await waitFor(() => expect(onReplay).toHaveBeenCalledWith(original));
  });
});
