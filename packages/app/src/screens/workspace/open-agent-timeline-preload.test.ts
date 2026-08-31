import { expect, test } from "vitest";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { selectOpenAgentTabIds } from "./open-agent-timeline-preload";

test("selects every open chat tab for cache preloading", () => {
  const tabs: WorkspaceTab[] = [
    {
      tabId: "active",
      target: { kind: "agent", agentId: "agent-b" },
      createdAt: 1,
    },
    {
      tabId: "hidden",
      target: { kind: "agent", agentId: "agent-a" },
      createdAt: 2,
    },
    {
      tabId: "duplicate",
      target: { kind: "agent", agentId: "agent-a" },
      createdAt: 3,
    },
    { tabId: "files", target: { kind: "files" }, createdAt: 4 },
  ];

  expect(selectOpenAgentTabIds(tabs)).toEqual(["agent-a", "agent-b"]);
});
