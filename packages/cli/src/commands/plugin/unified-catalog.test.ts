import { beforeEach, describe, expect, it, vi } from "vitest";

const listUnifiedPluginsFromClient = vi.fn(async () => ({
  plugins: [
    {
      id: "runtime:example",
      pluginId: "example",
      name: "example",
      displayName: "Example",
      version: "1.0.0",
      description: "Example plugin",
      keywords: [],
      sourceType: "local" as const,
      sourcePath: "/tmp/example",
      installed: true,
      enabled: true,
      installable: false,
      updateAvailable: false,
      skills: ["review"],
      mcpServers: [],
      httpServices: [],
      apps: [],
      runtime: {
        path: "/tmp/example",
        enabled: true,
        status: "running" as const,
        source: "directory" as const,
      },
      unsupportedComponents: [],
      warnings: [],
    },
  ],
  marketplaces: [],
  error: null,
}));

const client = { listUnifiedPlugins: listUnifiedPluginsFromClient };

vi.mock("./shared.js", () => ({
  withPluginManagementClient: vi.fn(
    async (_host: string | undefined, run: (value: typeof client) => Promise<unknown>) =>
      run(client),
  ),
  withPluginSourceClient: vi.fn(
    async (_host: string | undefined, run: (value: typeof client) => Promise<unknown>) =>
      run(client),
  ),
}));

import { listUnifiedPlugins, unifiedPluginSchema } from "./unified-catalog.js";

describe("unified plugin CLI catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists runtime and declarative resources as one plugin", async () => {
    const plugins = await listUnifiedPlugins(undefined);

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      pluginId: "example",
      skills: ["review"],
      runtime: { status: "running" },
    });
    expect(unifiedPluginSchema.idField(plugins[0]!)).toBe("example");
  });
});
