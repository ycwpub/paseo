import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ProjectCallAuditStore } from "./project-call-audit-store.js";

describe("ProjectCallAuditStore", () => {
  it("persists bounded metadata without query secrets, headers, or bodies", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "paseo-project-audit-"));
    const store = new ProjectCallAuditStore({ directory, maxEntries: 2 });

    await store.append({
      projectId: "project-a",
      workspaceId: "workspace-a",
      source: "workflow",
      request: {
        kind: "http",
        url: "https://api.example.com/jobs?token=secret&request_id=123",
        method: "POST",
      },
      decision: {
        allowed: false,
        reason: "default_deny",
        matchedRuleId: null,
        enforcement: "managed",
      },
      durationMs: 3,
    });
    await store.append({
      projectId: "project-a",
      workspaceId: "workspace-a",
      source: "agent_mcp",
      request: { kind: "rpc", target: "mcp:paseo/read_agent" },
      decision: {
        allowed: true,
        reason: "matched_allow",
        matchedRuleId: "allow-read",
        enforcement: "managed",
      },
      durationMs: 1,
    });
    await store.append({
      projectId: "project-a",
      workspaceId: "workspace-a",
      source: "agent_mcp",
      request: { kind: "rpc", target: "mcp:paseo/list_agents" },
      decision: {
        allowed: true,
        reason: "matched_allow",
        matchedRuleId: "allow-list",
        enforcement: "managed",
      },
      durationMs: 1,
    });

    const records = store.list({ projectId: "project-a" });
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.target)).toEqual([
      "mcp:paseo/read_agent",
      "mcp:paseo/list_agents",
    ]);
    expect(readFileSync(store.filePath, "utf8")).not.toContain("secret");
  });
});
