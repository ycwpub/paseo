import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { describe, expect, it } from "vitest";

import { buildToolCallPresentation, type ToolCallPresentationIcon } from "./presentation";

const fakeIcons = {
  brain: (() => null) as ToolCallPresentationIcon,
  eye: (() => null) as ToolCallPresentationIcon,
  wrench: (() => null) as ToolCallPresentationIcon,
};

function fakeResolveIcon(
  toolName: string,
  detail: ToolCallDetail | undefined,
): ToolCallPresentationIcon {
  if (detail?.type === "plan") {
    return fakeIcons.brain;
  }
  if (detail?.type === "read") {
    return fakeIcons.eye;
  }
  if (toolName === "exec_command") {
    return fakeIcons.wrench;
  }
  return fakeIcons.wrench;
}

describe("tool-call presentation", () => {
  it("builds badge, detail, icon, and file-open policy in one model", () => {
    const presentation = buildToolCallPresentation({
      toolName: "read_file",
      status: "completed",
      error: null,
      cwd: "/tmp/repo",
      detail: {
        type: "read",
        filePath: "/tmp/repo/src/index.ts",
        content: "console.log('hi');",
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Read",
      summary: "src/index.ts",
      icon: fakeIcons.eye,
      isLoadingDetails: false,
      hasDetails: true,
      canOpenDetails: true,
      openFilePath: "/tmp/repo/src/index.ts",
      isPlan: false,
    });
  });

  it("marks running calls without meaningful detail as loading details", () => {
    const presentation = buildToolCallPresentation({
      toolName: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "unknown",
        input: {},
        output: null,
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation).toMatchObject({
      displayName: "Exec Command",
      icon: fakeIcons.wrench,
      isLoadingDetails: true,
      hasDetails: false,
      canOpenDetails: true,
      openFilePath: null,
      isPlan: false,
    });
  });

  it("keeps plan calls out of the expandable badge path", () => {
    const presentation = buildToolCallPresentation({
      toolName: "ExitPlanMode",
      status: "completed",
      error: null,
      detail: {
        type: "plan",
        text: "1. Do the thing",
      },
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation.isPlan).toBe(true);
    expect(presentation.icon).toBe(fakeIcons.brain);
  });

  it("includes the command start and end times in the badge metadata", () => {
    const presentation = buildToolCallPresentation({
      toolName: "exec_command",
      status: "completed",
      error: null,
      detail: {
        type: "shell",
        command: "npm test",
        output: "ok",
        exitCode: 0,
      },
      startedAt: new Date(2026, 8, 15, 12, 1, 3),
      completedAt: new Date(2026, 8, 15, 12, 1, 9),
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation.metadataLabel).toMatch(/12:01:03.*→.*12:01:09/);
  });

  it("keeps the command end time open while it is running", () => {
    const presentation = buildToolCallPresentation({
      toolName: "exec_command",
      status: "running",
      error: null,
      detail: {
        type: "shell",
        command: "npm test",
      },
      startedAt: new Date(2026, 8, 15, 12, 1, 3),
      resolveIcon: fakeResolveIcon,
    });

    expect(presentation.metadataLabel).toMatch(/12:01:03.*→.*…/);
  });
});
