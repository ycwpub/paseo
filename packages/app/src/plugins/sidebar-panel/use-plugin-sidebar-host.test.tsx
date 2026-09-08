/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginState, PluginSummary } from "@getpaseo/protocol/messages";
import { pluginsQueryKey } from "@/data/plugin";
import { usePluginSidebarHost } from "./use-plugin-sidebar-host";

const listUnifiedPlugins = vi.fn();
let advertisedPlugins: boolean | undefined = true;

vi.mock("@/hooks/use-is-local-daemon", () => ({
  useLocalDaemonServerId: () => "local",
}));

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({
    getSnapshot: () => ({
      client: {
        getLastServerInfoMessage: () =>
          advertisedPlugins === undefined
            ? null
            : {
                features: { plugins: advertisedPlugins },
              },
        listUnifiedPlugins,
      },
    }),
  }),
  useHostRuntimeConnectionStatuses: () => new Map([["local", "online"]]),
  useHosts: () => [{ serverId: "local" }],
}));

const plugin: PluginSummary = {
  id: "installed:bamboo",
  pluginId: "bamboo",
  name: "bamboo",
  displayName: "Bamboo 对账自动排查",
  version: "1.0.0",
  description: "",
  keywords: [],
  sourceType: "local",
  installed: true,
  enabled: true,
  installable: false,
  updateAvailable: false,
  skills: [],
  mcpServers: [],
  httpServices: [],
  apps: [],
  unsupportedComponents: [],
  warnings: [],
};

function Harness() {
  const host = usePluginSidebarHost("local");
  return <div>{host?.plugins.map((entry) => entry.displayName).join(",") ?? "无插件"}</div>;
}

function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("plugin sidebar catalog refresh", () => {
  afterEach(() => {
    listUnifiedPlugins.mockReset();
    advertisedPlugins = true;
  });

  it("loads plugins after a cold start before server feature metadata is available", async () => {
    advertisedPlugins = undefined;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const cachedEmptyState: PluginState = { plugins: [], marketplaces: [] };
    queryClient.setQueryData(pluginsQueryKey("local"), cachedEmptyState);
    listUnifiedPlugins.mockResolvedValue({
      plugins: [plugin],
      marketplaces: [],
      error: null,
    });

    render(
      <Providers client={queryClient}>
        <Harness />
      </Providers>,
    );

    expect(screen.getByText("无插件")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Bamboo 对账自动排查")).toBeTruthy());
    expect(listUnifiedPlugins).toHaveBeenCalledTimes(1);
  });

  it("does not request plugins from a daemon that does not advertise plugin support", async () => {
    advertisedPlugins = false;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <Providers client={queryClient}>
        <Harness />
      </Providers>,
    );

    expect(screen.getByText("无插件")).toBeTruthy();
    await waitFor(() => expect(listUnifiedPlugins).not.toHaveBeenCalled());
  });
});
