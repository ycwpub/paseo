import { describe, expect, it, vi } from "vitest";
import type pino from "pino";
import {
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  BambooTroubleshooterConfigSchema,
  type PluginAppState,
} from "@getpaseo/protocol/messages";
import { BambooDedicatedBotListener } from "./bamboo-dedicated-bot-listener.js";

function projectState(config: unknown): PluginAppState {
  return {
    pluginId: "bamboo-reconciliation-troubleshooter",
    appId: "bamboo-troubleshooter-console",
    projectId: "project-1",
    data: { [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: config },
    defaultAgent: { provider: "codex", model: "gpt-5" },
    createdAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
  };
}

function customConfig() {
  return BambooTroubleshooterConfigSchema.parse({
    bot: {
      kind: "custom",
      credentialId: "project-1",
      appId: "cli_custom",
      hasAppSecret: true,
    },
    chats: [{ chatId: "oc_alerts" }],
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/root",
  });
}

describe("Bamboo dedicated bot listener", () => {
  it("subscribes custom credentials without registering a general Lark channel", async () => {
    const close = vi.fn();
    const onMessage = vi.fn(async () => undefined);
    let handler: ((event: { messageId: string }) => Promise<void>) | null = null;
    const startEvents = vi.fn(async (_config, nextHandler) => {
      handler = nextHandler;
      return { close };
    });
    const listener = new BambooDedicatedBotListener({
      listProjects: () => [projectState(customConfig())],
      credentialResolver: {
        resolve: () => ({
          identity: "custom:project-1:cli_custom",
          config: {
            enabled: true,
            appId: "cli_custom",
            appSecret: "secret",
            encryptKey: null,
            verificationToken: null,
            domain: "feishu",
            target: {
              kind: "workspace",
              provider: null,
              model: null,
              cwd: null,
              workspaceId: null,
            },
            substitute: { enabled: false, openId: null, name: null },
          },
        }),
      },
      startEvents,
      onMessage,
      logger: {
        child: () => ({ warn: vi.fn() }),
      } as unknown as pino.Logger,
    });

    listener.start();
    await vi.waitFor(() => expect(startEvents).toHaveBeenCalledOnce());
    await handler?.({ messageId: "om_1" });
    expect(onMessage).toHaveBeenCalledWith("cli_custom", { messageId: "om_1" });

    await listener.stop();
    expect(close).toHaveBeenCalledOnce();
  });

  it("does not subscribe existing channel bots", async () => {
    const existing = BambooTroubleshooterConfigSchema.parse({
      bot: { kind: "existing", botId: "bot-1" },
      chats: [{ chatId: "oc_alerts" }],
      troubleshootingSopDoc: "https://example.com/wiki/sop",
      attributionRecordRoot: "https://example.com/wiki/root",
    });
    const startEvents = vi.fn();
    const listener = new BambooDedicatedBotListener({
      listProjects: () => [projectState(existing)],
      credentialResolver: { resolve: vi.fn() },
      startEvents,
      onMessage: vi.fn(),
      logger: {
        child: () => ({ warn: vi.fn() }),
      } as unknown as pino.Logger,
    });

    listener.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(startEvents).not.toHaveBeenCalled();
    await listener.stop();
  });
});
