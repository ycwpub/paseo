import { describe, expect, it } from "vitest";
import type { LarkSubstituteMode, LarkSubstituteTask } from "@getpaseo/protocol/messages";
import {
  buildLarkSubstituteProjectAgentContext,
  listLarkSubstituteProjectBindings,
  listLarkSubstituteProjectTaskBindings,
} from "./lark-substitute-project-binding.js";

function mode(input: {
  id: string;
  name: string;
  projectId?: string;
  cwd?: string;
  enabled?: boolean;
}): LarkSubstituteMode {
  return {
    id: input.id,
    name: input.name,
    enabled: input.enabled ?? true,
    botId: `bot-${input.id}`,
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    },
    disclosure: { enabled: true, prompt: "【代答】" },
    customPrompt: "仅回答工作问题",
    delaySeconds: 600,
    autoArchiveAgent: false,
    activeTimeRanges: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "codex",
      cwd: input.cwd ?? "/projects/support",
      workspaceId: `workspace-${input.id}`,
      ...(input.projectId ? { projectId: input.projectId } : {}),
    },
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
  };
}

function task(input: {
  id: string;
  modeId: string;
  status?: LarkSubstituteTask["status"];
  updatedAt?: string;
}): LarkSubstituteTask {
  return {
    id: input.id,
    modeId: input.modeId,
    modeName: "工作替身",
    botId: "bot-1",
    source: "private_scan",
    chatId: "oc-private",
    chatName: "私聊",
    messageId: `message-${input.id}`,
    senderOpenId: "ou-user",
    senderName: "用户",
    content: "请确认方案",
    status: input.status ?? "completed",
    scheduledAt: null,
    startedAt: "2026-09-10T08:01:00.000Z",
    completedAt: "2026-09-10T08:02:00.000Z",
    agentId: `agent-${input.id}`,
    error: null,
    failureStage: null,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: input.updatedAt ?? "2026-09-10T08:02:00.000Z",
  };
}

describe("Lark substitute Project binding", () => {
  it("binds every substitute mode that targets the Project", () => {
    const bindings = listLarkSubstituteProjectBindings({
      projectId: "prj_support",
      paseoHome: "/paseo-home",
      modes: [
        mode({ id: "mode-2", name: "值班替身", projectId: "prj_support", enabled: false }),
        mode({ id: "mode-1", name: "工作替身", projectId: "prj_support" }),
        mode({ id: "mode-other", name: "其他替身", projectId: "prj_other" }),
      ],
    });

    expect(bindings).toEqual([
      {
        modeId: "mode-1",
        modeName: "工作替身",
        botId: "bot-mode-1",
        enabled: true,
      },
      {
        modeId: "mode-2",
        modeName: "值班替身",
        botId: "bot-mode-2",
        enabled: false,
      },
    ]);
  });

  it("binds task records through their substitute mode", () => {
    expect(
      listLarkSubstituteProjectTaskBindings({
        modeIds: new Set(["mode-1"]),
        tasks: [
          task({ id: "task-old", modeId: "mode-1", updatedAt: "2026-09-10T08:00:00.000Z" }),
          task({ id: "task-other", modeId: "mode-other" }),
          task({ id: "task-new", modeId: "mode-1", updatedAt: "2026-09-10T09:00:00.000Z" }),
        ],
      }),
    ).toEqual([
      {
        taskId: "task-new",
        modeId: "mode-1",
        status: "completed",
        source: "private_scan",
        agentId: "agent-task-new",
      },
      {
        taskId: "task-old",
        modeId: "mode-1",
        status: "completed",
        source: "private_scan",
        agentId: "agent-task-old",
      },
    ]);
  });

  it("recovers a legacy managed Project binding from its cwd", () => {
    expect(
      listLarkSubstituteProjectBindings({
        projectId: "prj_0123456789abcdef",
        paseoHome: "/paseo-home",
        modes: [
          mode({
            id: "legacy-mode",
            name: "旧替身",
            cwd: "/paseo-home/projects/prj_0123456789abcdef",
          }),
        ],
      }),
    ).toHaveLength(1);
  });

  it("exposes the bound modes and guarded reply capability to Project Agents", () => {
    const context = buildLarkSubstituteProjectAgentContext({
      projectId: "prj_support",
      paseoHome: "/paseo-home",
      modes: [mode({ id: "mode-1", name: "工作替身", projectId: "prj_support" })],
      tasks: [task({ id: "task-1", modeId: "mode-1", status: "running" })],
    });

    expect(context).toContain("<paseo_lark_substitute_project>");
    expect(context).toContain("工作替身");
    expect(context).toContain("mode_id=mode-1");
    expect(context).toContain("task_id=task-1");
    expect(context).toContain("status=running");
    expect(context).toContain("lark-substitute-reply");
    expect(context).toContain("paseo substitute reply");
    expect(context).toContain("PASEO_AGENT_ID");
  });

  it("does not add substitute capability context to an unbound Project", () => {
    expect(
      buildLarkSubstituteProjectAgentContext({
        projectId: "prj_other",
        paseoHome: "/paseo-home",
        modes: [mode({ id: "mode-1", name: "工作替身", projectId: "prj_support" })],
        tasks: [task({ id: "task-1", modeId: "mode-1" })],
      }),
    ).toBeNull();
  });
});
