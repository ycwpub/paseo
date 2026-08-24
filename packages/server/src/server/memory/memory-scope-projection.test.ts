import { describe, expect, test } from "vitest";
import { projectMemoryScopes, shouldPromoteMemoryToGlobal } from "./memory-scope-projection.js";

const scopes = [
  { type: "global", id: "default" },
  { type: "project", id: "project-1" },
  { type: "assistant", id: "assistant-1" },
  { type: "workspace", id: "workspace-1" },
] as const;

describe("memory scope projection", () => {
  test("uses Project as the finest scope and projects it to the used Assistant", () => {
    expect(
      projectMemoryScopes({
        requestedScopeType: "workspace",
        availableScopes: scopes,
        category: "project",
        title: "Local branch state",
        content: "The current branch is feature-a.",
        keywords: ["branch"],
      }),
    ).toEqual([
      { type: "project", id: "project-1" },
      { type: "assistant", id: "assistant-1" },
    ]);
  });

  test("promotes reusable CLI, Skill, repository, and terminology knowledge globally", () => {
    expect(
      projectMemoryScopes({
        requestedScopeType: "workspace",
        availableScopes: scopes,
        category: "procedure",
        title: "常用 CLI",
        content: "使用 paseo workflow list 发现流程。",
        keywords: ["cli"],
      }),
    ).toContainEqual({ type: "global", id: "default" });
    expect(
      shouldPromoteMemoryToGlobal({
        title: "领域术语",
        content: "Ledger 表示账本。",
        keywords: [],
        category: "fact",
      }),
    ).toBe(true);
  });

  test("does not promote transient Project-only facts globally", () => {
    expect(
      projectMemoryScopes({
        requestedScopeType: "project",
        availableScopes: scopes,
        category: "project",
        title: "Current rollout",
        content: "This Project is testing branch feature-a.",
        keywords: ["branch"],
      }),
    ).toEqual([
      { type: "project", id: "project-1" },
      { type: "assistant", id: "assistant-1" },
    ]);
  });

  test("ignores legacy Workspace scopes when no Project can be resolved", () => {
    expect(
      projectMemoryScopes({
        requestedScopeType: "workspace",
        availableScopes: [
          { type: "global", id: "default" },
          { type: "assistant", id: "assistant-1" },
          { type: "workspace", id: "workspace-1" },
        ],
        category: "project",
        title: "Assistant convention",
        content: "Reuse this convention.",
        keywords: [],
      }),
    ).toEqual([
      { type: "assistant", id: "assistant-1" },
      { type: "global", id: "default" },
    ]);
  });
});
