import { describe, expect, test } from "vitest";
import type { McpServer, Skill } from "@getpaseo/protocol/messages";
import {
  listSharedSkillCommands,
  resolveSharedSkillInvocation,
  withSharedMcpServers,
} from "./shared-agent-resources.js";

function makeMcpServer(id: string, name: string): McpServer {
  const timestamp = Date.now();
  return {
    id,
    name,
    enabled: true,
    transport: { type: "http", url: `http://127.0.0.1/${id}` },
    createdAt: timestamp,
    updatedAt: timestamp,
    originalJson: "{}",
  };
}

function makeSkill(id: string, name: string): Skill {
  const timestamp = Date.now();
  return {
    id,
    name,
    description: `${name} description`,
    source: "user",
    enabled: true,
    content: `${name} body`,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("shared agent resources", () => {
  test("filters shared MCP servers by session selection", () => {
    const config = withSharedMcpServers(
      { provider: "codex", cwd: "/tmp/repo" },
      [makeMcpServer("mcp-db", "db"), makeMcpServer("mcp-files", "files")],
      ["mcp-db"],
    );

    expect(config.mcpServers).toEqual({
      db: { type: "http", url: "http://127.0.0.1/mcp-db" },
    });
  });

  test("filters shared skill commands and fallback expansion by session selection", () => {
    const review = makeSkill("skill-review", "review");
    const deploy = makeSkill("skill-deploy", "deploy");

    expect(
      listSharedSkillCommands([review, deploy], ["skill-review"]).map((cmd) => cmd.name),
    ).toEqual(["review"]);
    expect(
      resolveSharedSkillInvocation("/review auth", [review, deploy], [], ["skill-review"]),
    ).toEqual(expect.stringContaining("review body"));
    expect(
      resolveSharedSkillInvocation("/deploy prod", [review, deploy], [], ["skill-review"]),
    ).toBe("/deploy prod");
  });
});
