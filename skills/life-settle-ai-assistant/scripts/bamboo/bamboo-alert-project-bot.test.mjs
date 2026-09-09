import { describe, expect, it, vi } from "vitest";
import { createBambooAlertRunner } from "./bamboo-alert-runner.mjs";

describe("Bamboo project bot isolation", () => {
  it("initializes the isolated bytedcli profile before the first Lark bot command", async () => {
    const calls = [];
    const execFile = vi.fn(async (command, args, options) => {
      calls.push({ command, args, options });
      if (command === "bash") {
        return { stdout: "", stderr: "" };
      }
      return { stdout: JSON.stringify({ code: 0, data: {} }), stderr: "" };
    });
    const env = {
      PATH: process.env.PATH,
      FEISHU_BOT_APP_ID: "cli_project",
      FEISHU_BOT_APP_SECRET: "project-secret",
      PASEO_BAMBOO_BYTEDCLI_PROFILE: "paseo-bamboo-1234567890abcdef",
      BYTEDCLI_PROFILE: "wrong-profile",
    };
    const runner = createBambooAlertRunner({ execFile, env });

    await runner.replyMessage({ messageId: "om_test", markdown: "测试" });

    expect(calls).toHaveLength(2);
    expect(calls[0].command).toBe("bash");
    expect(calls[0].args[1]).toContain("bytedcli lark config init");
    expect(calls[0].args[1]).not.toContain("project-secret");
    expect(calls[0].options.env.BYTEDCLI_PROFILE).toBe("paseo-bamboo-1234567890abcdef");
    expect(calls[1].command).toBe("bytedcli");
    expect(calls[1].options.env.BYTEDCLI_PROFILE).toBe("paseo-bamboo-1234567890abcdef");
  });

  it("does not initialize the default profile for standalone environment credentials", async () => {
    const calls = [];
    const execFile = vi.fn(async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: JSON.stringify({ code: 0, data: {} }), stderr: "" };
    });
    const runner = createBambooAlertRunner({
      execFile,
      env: {
        PATH: process.env.PATH,
        FEISHU_BOT_APP_ID: "cli_environment",
        FEISHU_BOT_APP_SECRET: "environment-secret",
      },
    });

    await runner.replyMessage({ messageId: "om_test", markdown: "测试" });

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("bytedcli");
  });

  it("fails closed instead of falling back to another cached robot", async () => {
    const calls = [];
    const execFile = vi.fn(async (command, args, options) => {
      calls.push({ command, args, options });
      throw new Error("login failed");
    });
    const runner = createBambooAlertRunner({
      execFile,
      env: {
        PATH: process.env.PATH,
        FEISHU_BOT_APP_ID: "cli_project",
        FEISHU_BOT_APP_SECRET: "project-secret",
        PASEO_BAMBOO_BYTEDCLI_PROFILE: "paseo-bamboo-1234567890abcdef",
      },
    });

    await expect(runner.replyMessage({ messageId: "om_test", markdown: "测试" })).rejects.toThrow(
      "项目配置的飞书机器人初始化失败：login failed",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe("bash");
  });
});
