import { describe, expect, test } from "vitest";
import type { TFunction } from "i18next";
import type { Assistant, PaseoMemoryState } from "@getpaseo/protocol/messages";
import type { ProjectSummary } from "@/utils/projects";
import {
  buildMemorySyncSelectionOptions,
  memorySyncSelectionKey,
} from "./memory-sync-selection-options";

describe("memory sync selection options", () => {
  test("offers one Global option plus Projects on the selected Host and its Assistants", () => {
    const options = buildMemorySyncSelectionOptions({
      serverId: "host-1",
      memory: {
        activeUserId: "user-1",
        users: [{ id: "user-1", name: "张三" }],
      } as PaseoMemoryState,
      projects: [
        {
          projectName: "共享项目",
          hosts: [
            {
              serverId: "host-1",
              projectId: "project-1",
              projectName: "项目一",
              projectCustomName: null,
            },
            {
              serverId: "host-2",
              projectId: "project-2",
              projectName: "项目二",
              projectCustomName: null,
            },
          ],
        },
      ] as ProjectSummary[],
      assistants: [{ id: "assistant-1", name: "研发助手" }] as Assistant[],
      t: ((key: string, values?: { name?: string }) =>
        values?.name ? `${key}:${values.name}` : key) as TFunction,
    });

    expect(options.map(memorySyncSelectionKey)).toEqual([
      "global:",
      "project:project-1",
      "assistant:assistant-1",
    ]);
    expect(options[0]).toMatchObject({
      selection: { type: "global" },
      description: "张三",
    });
  });
});
