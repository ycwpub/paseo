import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type { LarkChannelService } from "./lark-channel-service.js";
import {
  LarkBotApplicationService,
  type LarkAppRegistrar,
} from "./lark-bot-application-service.js";
import {
  buildLarkBotApplicationAddons,
  buildLarkBotApplicationRequirements,
} from "./lark-bot-capability-requirements.js";

async function waitForTerminalState(service: LarkBotApplicationService, id: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const application = service.get(id);
    if (application?.status === "completed" || application?.status === "failed") {
      return application;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("application did not finish");
}

describe("LarkBotApplicationService", () => {
  test("registers, persists, and starts a Feishu bot without exposing its secret", async () => {
    const configure = vi.fn().mockResolvedValue({
      activeBotId: "bot-1",
      bots: [{ id: "bot-1", connectionStatus: "connected", error: null }],
    });
    const testConnection = vi.fn();
    const registrar: LarkAppRegistrar = {
      register: vi.fn(async ({ onQRCodeReady }) => {
        onQRCodeReady({ url: "https://accounts.feishu.cn/device", expireIn: 600 });
        return {
          client_id: "cli_test",
          client_secret: "very-secret-value-that-must-not-leak",
          user_info: { tenant_brand: "feishu" },
        };
      }),
    };
    const service = new LarkBotApplicationService({
      channelService: { configure, testConnection } as unknown as LarkChannelService,
      registrar,
      logger: pino({ enabled: false }),
    });

    const started = service.start("My Paseo Bot");
    const completed = await waitForTerminalState(service, started.id);

    expect(completed).toMatchObject({
      status: "completed",
      appId: "cli_test",
      botId: "bot-1",
      domain: "feishu",
    });
    expect(JSON.stringify(completed)).not.toContain("very-secret");
    expect(registrar.register).toHaveBeenCalledWith(
      expect.objectContaining({
        addons: buildLarkBotApplicationAddons(),
        createOnly: true,
      }),
    );
    expect(configure).toHaveBeenCalledWith({
      createNew: true,
      name: "My Paseo Bot",
      appId: "cli_test",
      appSecret: "very-secret-value-that-must-not-leak",
      domain: "feishu",
    });
    expect(testConnection).not.toHaveBeenCalled();
    expect(completed.requirements).toEqual(buildLarkBotApplicationRequirements());
  });

  test("uses the actual Feishu bot name when no custom name is provided", async () => {
    const configure = vi
      .fn()
      .mockResolvedValueOnce({
        activeBotId: "bot-1",
        bots: [{ id: "bot-1", connectionStatus: "disabled", error: null, bot: null }],
      })
      .mockResolvedValueOnce({
        activeBotId: "bot-1",
        bots: [
          {
            id: "bot-1",
            name: "飞书中的机器人名称",
            connectionStatus: "disabled",
            error: null,
            bot: { name: "飞书中的机器人名称" },
          },
        ],
      });
    const testConnection = vi.fn().mockResolvedValue({
      activeBotId: "bot-1",
      bots: [
        {
          id: "bot-1",
          connectionStatus: "disabled",
          error: null,
          bot: { name: "飞书中的机器人名称" },
        },
      ],
    });
    const registrar: LarkAppRegistrar = {
      register: vi.fn(async () => ({
        client_id: "cli_test",
        client_secret: "secret",
        user_info: { tenant_brand: "feishu" },
      })),
    };
    const service = new LarkBotApplicationService({
      channelService: { configure, testConnection } as unknown as LarkChannelService,
      registrar,
      logger: pino({ enabled: false }),
    });

    const started = service.start();
    const completed = await waitForTerminalState(service, started.id);

    expect(completed).toMatchObject({
      status: "completed",
      botId: "bot-1",
    });
    expect(configure).toHaveBeenNthCalledWith(1, {
      createNew: true,
      appId: "cli_test",
      appSecret: "secret",
      domain: "feishu",
    });
    expect(testConnection).toHaveBeenCalledWith("bot-1");
    expect(configure).toHaveBeenNthCalledWith(2, {
      botId: "bot-1",
      name: "飞书中的机器人名称",
    });
  });

  test("updates an existing bot application without replacing its stored credentials", async () => {
    const configure = vi.fn();
    const registrar: LarkAppRegistrar = {
      register: vi.fn(async ({ onQRCodeReady }) => {
        onQRCodeReady({ url: "https://accounts.feishu.cn/device/update", expireIn: 600 });
        return {
          client_id: "cli_existing",
          user_info: { tenant_brand: "feishu" },
        };
      }),
    };
    const service = new LarkBotApplicationService({
      channelService: { configure } as unknown as LarkChannelService,
      registrar,
      logger: pino({ enabled: false }),
    });

    const started = service.start({ appId: "cli_existing", botId: "bot-existing" });
    const completed = await waitForTerminalState(service, started.id);

    expect(completed).toMatchObject({
      status: "completed",
      appId: "cli_existing",
      botId: "bot-existing",
      message: "机器人权限配置已提交，群消息长连接已重启",
    });
    expect(registrar.register).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: "cli_existing",
        addons: buildLarkBotApplicationAddons(),
        createOnly: false,
      }),
    );
    expect(configure).toHaveBeenCalledWith({ botId: "bot-existing" });
  });

  test("reports a sanitized registration failure", async () => {
    const registrar: LarkAppRegistrar = {
      register: vi.fn(async () => {
        throw new Error("request failed token_abcdefghijklmnopqrstuvwxyz123456");
      }),
    };
    const service = new LarkBotApplicationService({
      channelService: {} as LarkChannelService,
      registrar,
      logger: pino({ enabled: false }),
    });

    const started = service.start();
    const failed = await waitForTerminalState(service, started.id);

    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("***");
    expect(failed.error).not.toContain("abcdefghijklmnopqrstuvwxyz");
  });
});
