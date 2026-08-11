import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import { McpStore } from "./mcp/mcp-store.js";
import { SkillStore } from "./skill/skill-store.js";
import { importProviderResourcesOnStartup } from "./shared-resource-importer.js";

function writeSkill(dir: string, name: string, description: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
    "utf8",
  );
}

describe("importProviderResourcesOnStartup", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot && existsSync(tempRoot)) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
    tempRoot = null;
  });

  test("imports provider skills and MCP servers while skipping Paseo-managed skill symlinks", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-resource-importer-"));
    const homeDir = path.join(tempRoot, "home");
    const codexHome = path.join(homeDir, ".codex");
    const paseoHome = path.join(tempRoot, "paseo-home");
    const logger = createTestLogger();
    mkdirSync(homeDir, { recursive: true });

    writeSkill(path.join(homeDir, ".agents", "skills", "alpha"), "alpha", "Alpha skill");
    writeSkill(path.join(homeDir, ".claude", "skills", "bravo"), "bravo", "Bravo skill");
    writeSkill(path.join(homeDir, ".trae", "skills", "charlie"), "charlie", "Charlie skill");

    const materializedSkillDir = path.join(paseoHome, "skills-materialized", "skip-skill-1");
    writeSkill(materializedSkillDir, "skip", "Paseo materialized skill");
    const codexSkillLink = path.join(codexHome, "skills", "skip");
    mkdirSync(path.dirname(codexSkillLink), { recursive: true });
    symlinkSync(materializedSkillDir, codexSkillLink, "dir");

    writeFileSync(
      path.join(codexHome, "config.toml"),
      [
        "[mcp_servers.node_repl]",
        'command = "node"',
        'args = ["server.js"]',
        "[mcp_servers.node_repl.env]",
        'FOO = "bar"',
      ].join("\n"),
      "utf8",
    );
    const claudeConfigDir = path.join(homeDir, "Library", "Application Support", "Claude");
    mkdirSync(claudeConfigDir, { recursive: true });
    writeFileSync(
      path.join(claudeConfigDir, "claude_desktop_config.json"),
      JSON.stringify({ mcpServers: { cloud: { type: "http", url: "https://example.test/mcp" } } }),
      "utf8",
    );
    mkdirSync(path.join(homeDir, ".trae"), { recursive: true });
    writeFileSync(
      path.join(homeDir, ".trae", "traecli.yaml"),
      [
        "mcpServers:",
        "  trae-tool:",
        "    command: uv",
        "    args:",
        "      - run",
        "      - tool.py",
      ].join("\n"),
      "utf8",
    );

    const mcpStore = new McpStore({ paseoHome, logger });
    const skillStore = new SkillStore({ paseoHome, logger });

    const result = importProviderResourcesOnStartup({
      paseoHome,
      mcpStore,
      skillStore,
      logger,
      homeDir,
      codexHome,
    });

    expect(result.skillsImported).toBe(3);
    expect(result.mcpServersImported).toBe(3);
    expect(
      skillStore
        .list()
        .map((skill) => skill.name)
        .sort(),
    ).toEqual(["alpha", "bravo", "charlie"]);
    for (const skill of skillStore.list()) {
      expect(skill.source).toBe("builtin");
      expect(skill.enabled).toBe(true);
      expect(skill.tags).toContain("imported");
      expect(skill.path).toMatch(/SKILL\.md$/u);
    }

    const serversByName = new Map(mcpStore.list().map((server) => [server.name, server]));
    expect(serversByName.get("node_repl")?.transport).toEqual({
      type: "stdio",
      command: "node",
      args: ["server.js"],
      env: { FOO: "bar" },
    });
    expect(serversByName.get("cloud")?.transport).toEqual({
      type: "http",
      url: "https://example.test/mcp",
    });
    expect(serversByName.get("trae-tool")?.transport).toEqual({
      type: "stdio",
      command: "uv",
      args: ["run", "tool.py"],
    });
    for (const server of mcpStore.list()) {
      expect(server.enabled).toBe(true);
      expect(JSON.parse(server.originalJson).__paseoImported).toBe(true);
    }
  });

  test("preserves disabled imported resources on later startup imports", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-resource-importer-preserve-"));
    const homeDir = path.join(tempRoot, "home");
    const codexHome = path.join(homeDir, ".codex");
    const paseoHome = path.join(tempRoot, "paseo-home");
    const logger = createTestLogger();

    writeSkill(path.join(homeDir, ".agents", "skills", "alpha"), "alpha", "Alpha skill");
    mkdirSync(codexHome, { recursive: true });
    writeFileSync(
      path.join(codexHome, "config.toml"),
      ["[mcp_servers.node_repl]", 'command = "node"'].join("\n"),
      "utf8",
    );

    const mcpStore = new McpStore({ paseoHome, logger });
    const skillStore = new SkillStore({ paseoHome, logger });
    importProviderResourcesOnStartup({
      paseoHome,
      mcpStore,
      skillStore,
      logger,
      homeDir,
      codexHome,
    });

    const skill = skillStore.list()[0]!;
    const server = mcpStore.list()[0]!;
    skillStore.update({ id: skill.id, enabled: false });
    mcpStore.update({ id: server.id, enabled: false });

    importProviderResourcesOnStartup({
      paseoHome,
      mcpStore,
      skillStore,
      logger,
      homeDir,
      codexHome,
    });

    expect(skillStore.list()).toHaveLength(1);
    expect(skillStore.list()[0]?.enabled).toBe(false);
    expect(mcpStore.list()).toHaveLength(1);
    expect(mcpStore.list()[0]?.enabled).toBe(false);
  });
});
