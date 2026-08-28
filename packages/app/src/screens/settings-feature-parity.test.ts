import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("feature_paseo settings integration parity", () => {
  test("keeps restored host, project, plugin, and memory surfaces reachable", () => {
    const source = readFileSync(new URL("./settings-screen.tsx", import.meta.url), "utf8");

    expect(source).toContain("<HostConnectionsPage");
    expect(source).toContain("<HostPluginsPage");
    expect(source).toContain("<ProjectSettingsScreen");
    expect(source).toContain("<MemoryManagementScreen");
    expect(source).toContain('view.kind === "memory"');
  });
});
