import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type {
  LarkSubstituteMode,
  LarkSubstituteModeCreateInput,
} from "@getpaseo/protocol/messages";
import type { LarkChannelService } from "./lark-channel-service.js";
import { LarkChannelSession } from "./lark-channel-session.js";

const modeInput: LarkSubstituteModeCreateInput = {
  name: "工作替身",
  enabled: true,
  botId: "bot-1",
  substituteUser: { openId: "ou_target", name: "张三", email: "a@example.com" },
  privateReplyIdentity: "user",
  groupReplyIdentity: "bot",
  disclosure: { enabled: true, prompt: "【机器人代答】" },
  customPrompt: "",
  delaySeconds: 10,
  activeTimeRanges: [],
  allowlist: [],
  denylist: [],
  target: {
    kind: "workspace",
    provider: "aiden_codex",
    model: "gpt-5.5",
    cwd: "/repo",
    workspaceId: null,
  },
};

function createMode(input: LarkSubstituteModeCreateInput): LarkSubstituteMode {
  return {
    id: "mode-1",
    ...input,
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

describe("LarkChannelSession substitute mode RPC", () => {
  test("lists, creates, updates, toggles and deletes modes", async () => {
    let modes: LarkSubstituteMode[] = [];
    const service = {
      listSubstituteModes: vi.fn(() => modes),
      createSubstituteMode: vi.fn((input: LarkSubstituteModeCreateInput) => {
        const created = createMode(input);
        modes = [created];
        return created;
      }),
      updateSubstituteMode: vi.fn((modeId: string, input: LarkSubstituteModeCreateInput) => {
        const updated = {
          ...createMode(input),
          id: modeId,
          updatedAt: "2026-09-04T01:00:00.000Z",
        };
        modes = [updated];
        return updated;
      }),
      setSubstituteModeEnabled: vi.fn((modeId: string, enabled: boolean) => {
        const updated = { ...modes[0]!, id: modeId, enabled };
        modes = [updated];
        return updated;
      }),
      deleteSubstituteMode: vi.fn((modeId: string) => {
        const found = modes[0]?.id === modeId;
        modes = found ? [] : modes;
        return found;
      }),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.substitute.create.request",
      requestId: "create",
      mode: modeInput,
    });
    await session.handleRequest({
      type: "channel.lark.substitute.update.request",
      requestId: "update",
      modeId: "mode-1",
      mode: { ...modeInput, name: "更新后的替身" },
    });
    await session.handleRequest({
      type: "channel.lark.substitute.set_enabled.request",
      requestId: "toggle",
      modeId: "mode-1",
      enabled: false,
    });
    await session.handleRequest({
      type: "channel.lark.substitute.list.request",
      requestId: "list",
    });
    await session.handleRequest({
      type: "channel.lark.substitute.delete.request",
      requestId: "delete",
      modeId: "mode-1",
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "channel.lark.substitute.create.response",
        payload: expect.objectContaining({
          requestId: "create",
          mode: expect.objectContaining({ id: "mode-1" }),
        }),
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "channel.lark.substitute.update.response",
        payload: expect.objectContaining({
          requestId: "update",
          mode: expect.objectContaining({ name: "更新后的替身" }),
        }),
      }),
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "channel.lark.substitute.set_enabled.response",
        payload: expect.objectContaining({
          requestId: "toggle",
          mode: expect.objectContaining({ enabled: false }),
        }),
      }),
    );
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.substitute.delete.response",
      payload: {
        requestId: "delete",
        modeId: "mode-1",
        ok: true,
        modes: [],
        error: null,
      },
    });
  });
});
