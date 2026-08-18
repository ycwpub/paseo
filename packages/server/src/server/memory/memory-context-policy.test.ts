import { describe, expect, test } from "vitest";
import {
  canStoreExtractedMemory,
  resolveMemoryContextPolicy,
  upsertMemoryPolicies,
} from "./memory-context-policy.js";

describe("memory context policy", () => {
  test("disables a conversation unless an explicit session mode overrides it", () => {
    const policies = [
      {
        target: { type: "conversation" as const, id: "agent-1" },
        enabled: false,
        extractionInstructions: "Remember confirmed outcomes.",
      },
    ];

    expect(
      resolveMemoryContextPolicy({
        policies,
        agentId: "agent-1",
        projectId: null,
        configuredMode: "on",
      }).mode,
    ).toBe("off");
    expect(
      resolveMemoryContextPolicy({
        policies,
        agentId: "agent-1",
        projectId: null,
        configuredMode: "on",
        sessionMode: "read-only",
      }).mode,
    ).toBe("read-only");
  });

  test("combines enabled project and conversation extraction instructions", () => {
    const context = resolveMemoryContextPolicy({
      policies: [
        {
          target: { type: "project", id: "project-1" },
          enabled: true,
          extractionInstructions: " Architecture decisions ",
        },
        {
          target: { type: "conversation", id: "agent-1" },
          enabled: true,
          extractionInstructions: "Confirmed debugging conclusions",
        },
      ],
      agentId: "agent-1",
      projectId: "project-1",
      configuredMode: "on",
    });

    expect(context).toEqual({
      mode: "on",
      projectMemoryEnabled: true,
      extractionInstructions: ["Architecture decisions", "Confirmed debugging conclusions"],
    });
  });

  test("excludes project scope and project candidates when project memory is disabled", () => {
    const context = resolveMemoryContextPolicy({
      policies: [
        {
          target: { type: "project", id: "project-1" },
          enabled: false,
          extractionInstructions: "Do not use this",
        },
      ],
      agentId: "agent-1",
      projectId: "project-1",
      configuredMode: "on",
    });

    expect(context.projectMemoryEnabled).toBe(false);
    expect(context.extractionInstructions).toEqual([]);
    expect(
      canStoreExtractedMemory({
        category: "project",
        requestedScope: undefined,
        scopes: [{ type: "global" }],
      }),
    ).toBe(false);
    expect(
      canStoreExtractedMemory({
        category: "preference",
        requestedScope: undefined,
        scopes: [{ type: "global" }],
      }),
    ).toBe(true);
  });

  test("rejects extracted memory when every scope is disabled", () => {
    expect(
      canStoreExtractedMemory({
        category: "preference",
        requestedScope: undefined,
        scopes: [],
      }),
    ).toBe(false);
  });

  test("upserts policies by stable target identity", () => {
    expect(
      upsertMemoryPolicies(
        [
          {
            target: { type: "project", id: "project-1" },
            enabled: true,
            extractionInstructions: "Old",
          },
        ],
        [
          {
            target: { type: "project", id: "project-1" },
            enabled: false,
            extractionInstructions: " New ",
          },
        ],
      ),
    ).toEqual([
      {
        target: { type: "project", id: "project-1" },
        enabled: false,
        extractionInstructions: "New",
      },
    ]);
  });
});
