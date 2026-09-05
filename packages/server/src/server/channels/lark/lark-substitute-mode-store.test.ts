import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { StoredLarkChannelBot } from "./lark-channel-store.js";
import { LarkSubstituteModeStore } from "./lark-substitute-mode-store.js";

const tempDirs: string[] = [];

function createTempDir(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "paseo-lark-substitute-"));
  tempDirs.push(directory);
  return directory;
}

function legacyBot(): StoredLarkChannelBot {
  return {
    id: "bot-1",
    name: "研发机器人",
    config: {
      enabled: true,
      appId: "cli_test",
      appSecret: "secret",
      encryptKey: null,
      verificationToken: null,
      domain: "feishu",
      target: {
        kind: "assistant",
        assistantId: "assistant-1",
        provider: "aiden_codex",
        model: "gpt-5.5",
        cwd: "/repo",
        workspaceId: null,
      },
      substitute: {
        enabled: true,
        openId: "ou_user",
        name: "张三",
      },
    },
    authorizedUsers: [],
    pendingPairings: [],
    conversations: [],
    processedEvents: [],
  };
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("LarkSubstituteModeStore", () => {
  test("migrates each legacy bot configuration exactly once", () => {
    const paseoHome = createTempDir();
    const store = new LarkSubstituteModeStore(paseoHome);
    store.migrateLegacyBots([legacyBot()], "2026-09-04T00:00:00.000Z");
    store.migrateLegacyBots([legacyBot()], "2026-09-04T01:00:00.000Z");

    expect(store.list()).toEqual([
      expect.objectContaining({
        id: "legacy-bot-1",
        name: "研发机器人 的替身模式",
        enabled: true,
        botId: "bot-1",
        substituteUser: {
          openId: "ou_user",
          name: "张三",
          email: null,
        },
        privateReplyIdentity: "user",
        groupReplyIdentity: "bot",
      }),
    ]);
    expect(
      JSON.parse(
        readFileSync(path.join(paseoHome, "channels", "lark-substitute-modes.json"), "utf8"),
      ),
    ).toMatchObject({ version: 2, migratedLegacyBotIds: ["bot-1"] });
  });

  test("creates, updates, toggles and deletes an independent mode", () => {
    const store = new LarkSubstituteModeStore(createTempDir());
    const created = store.create(
      {
        name: "工作替身",
        enabled: true,
        botId: "bot-1",
        substituteUser: { openId: "ou_user", name: "张三", email: "a@example.com" },
        privateReplyIdentity: "user",
        groupReplyIdentity: "user",
        disclosure: { enabled: true, prompt: "【AI 协助回答】" },
        customPrompt: "只回答研发问题",
        delaySeconds: 15,
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
      },
      "2026-09-04T00:00:00.000Z",
    );

    const disabled = store.setEnabled(created.id, false, "2026-09-04T01:00:00.000Z");
    expect(disabled?.enabled).toBe(false);
    expect(store.delete(created.id)).toBe(true);
    expect(store.list()).toEqual([]);
  });

  test("migrates stored Sunday weekday 0 to weekday 7", () => {
    const paseoHome = createTempDir();
    const channelsDirectory = path.join(paseoHome, "channels");
    mkdirSync(channelsDirectory, { recursive: true });
    writeFileSync(
      path.join(channelsDirectory, "lark-substitute-modes.json"),
      JSON.stringify({
        version: 1,
        migratedLegacyBotIds: [],
        modes: [
          {
            id: "mode-1",
            name: "周日替身",
            enabled: true,
            botId: "bot-1",
            substituteUser: { openId: "ou_user", name: "张三", email: null },
            privateReplyIdentity: "user",
            groupReplyIdentity: "bot",
            disclosure: { enabled: true, prompt: "【机器人代答】" },
            customPrompt: "",
            delaySeconds: 10,
            activeTimeRanges: [
              {
                id: "sunday",
                weekdays: [0, 1],
                startTime: "09:00",
                endTime: "18:00",
                timezone: "Asia/Shanghai",
              },
            ],
            allowlist: [],
            denylist: [],
            target: {
              kind: "workspace",
              provider: "aiden_codex",
              model: "gpt-5.5",
              cwd: "/repo",
              workspaceId: null,
            },
            createdAt: "2026-09-04T00:00:00.000Z",
            updatedAt: "2026-09-04T00:00:00.000Z",
          },
        ],
      }),
      { mode: 0o600 },
    );

    const store = new LarkSubstituteModeStore(paseoHome);
    expect(store.list()[0]?.activeTimeRanges[0]?.weekdays).toEqual([1, 7]);
    expect(
      JSON.parse(readFileSync(path.join(channelsDirectory, "lark-substitute-modes.json"), "utf8")),
    ).toMatchObject({ version: 2 });
  });
});
