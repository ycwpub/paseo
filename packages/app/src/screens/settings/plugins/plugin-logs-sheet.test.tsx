/**
 * @vitest-environment jsdom
 */
/* oxlint-disable react-perf/jsx-no-new-function-as-prop, react-perf/jsx-no-new-object-as-prop -- Test fixtures intentionally create isolated clients and callbacks. */
import { i18n as testI18n } from "@/i18n/i18next";
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PluginLogEntry } from "@getpaseo/protocol/messages";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginLogsSheet } from "./plugin-logs-sheet";

void testI18n;

vi.mock("@/components/adaptive-modal-sheet", async () => {
  const ReactModule = await vi.importActual<typeof import("react")>("react");
  return {
    AdaptiveModalSheet: ({
      header,
      children,
    }: {
      header: { title: string; actions?: React.ReactNode };
      children: React.ReactNode;
    }) =>
      ReactModule.createElement(
        "div",
        { role: "dialog" },
        ReactModule.createElement("h2", null, header.title),
        header.actions,
        children,
      ),
  };
});

function renderSheet(logs: PluginLogEntry[]) {
  const client = {
    getPluginLogs: vi.fn(async () => logs),
  } as unknown as DaemonClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <PluginLogsSheet
        client={client}
        pluginId="demo-plugin"
        serverId="host-a"
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  );
  return client;
}

describe("PluginLogsSheet", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows runtime logs in the unified plugin experience", async () => {
    const client = renderSheet([
      {
        sequence: 1,
        timestamp: "2026-08-29T00:00:00.000Z",
        stream: "stdout",
        message: "plugin ready",
      },
    ]);

    await waitFor(() => expect(client.getPluginLogs).toHaveBeenCalledWith("demo-plugin"));
    expect(await screen.findByText("plugin ready")).toBeDefined();
  });
});
