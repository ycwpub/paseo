import { describe, expect, it } from "vitest";
import {
  createProjectLarkGroupDraft,
  projectLarkGroupDraftError,
  projectLarkGroupDraftsToConfig,
  projectLarkGroupsToDraft,
} from "./project-lark-context-model";

describe("Project Lark context form model", () => {
  it("round-trips configured group bindings", () => {
    const draft = projectLarkGroupsToDraft([
      {
        id: "alerts",
        botId: "bot-1",
        chatId: "oc_alerts",
        enabled: false,
        messageLimit: 80,
        futureField: "kept",
      },
    ]);

    expect(draft[0]).toMatchObject({
      id: "alerts",
      botId: "bot-1",
      chatId: "oc_alerts",
      enabled: false,
      messageLimitText: "80",
    });
    expect(projectLarkGroupDraftsToConfig(draft)).toEqual([
      {
        id: "alerts",
        botId: "bot-1",
        chatId: "oc_alerts",
        enabled: false,
        messageLimit: 80,
        futureField: "kept",
      },
    ]);
  });

  it("validates required selections and message limits", () => {
    const draft = createProjectLarkGroupDraft();
    expect(projectLarkGroupDraftError([draft])).toContain("未选择飞书机器人");
    draft.botId = "bot-1";
    expect(projectLarkGroupDraftError([draft])).toContain("未选择飞书群");
    draft.chatId = "oc_group";
    draft.messageLimitText = "201";
    expect(projectLarkGroupDraftError([draft])).toContain("1 到 200");
    draft.messageLimitText = "50";
    expect(projectLarkGroupDraftError([draft])).toBeNull();
  });
});
