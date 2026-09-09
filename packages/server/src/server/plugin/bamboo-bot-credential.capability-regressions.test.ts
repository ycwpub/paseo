import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BAMBOO_TROUBLESHOOTER_APP_ID,
  BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY,
  BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
  BambooTroubleshooterConfigSchema,
} from "@getpaseo/protocol/messages";
import { BambooBotCredentialResolver } from "./bamboo-bot-credential-resolver.js";
import {
  BAMBOO_BOT_APP_SECRET_CREDENTIAL_KEY,
  BambooBotCredentialService,
} from "./bamboo-bot-credential-service.js";
import { BambooBotCredentialStore } from "./bamboo-bot-credential-store.js";

const temporaryDirectories: string[] = [];

function tempHome(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "paseo-bamboo-credentials-"));
  temporaryDirectories.push(directory);
  return directory;
}

function customConfig(projectId: string, appId = "cli_custom") {
  return BambooTroubleshooterConfigSchema.parse({
    bot: {
      kind: "custom",
      credentialId: projectId,
      appId,
      hasAppSecret: false,
    },
    chats: [{ chatId: "oc_alerts" }],
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/root",
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Bamboo dedicated bot credentials", () => {
  it("stores the custom secret privately and never returns it in Plugin App data", () => {
    const home = tempHome();
    const store = new BambooBotCredentialStore(home);
    const service = new BambooBotCredentialService(store);
    const data = service.configure({
      pluginId: BAMBOO_TROUBLESHOOTER_PLUGIN_ID,
      appId: BAMBOO_TROUBLESHOOTER_APP_ID,
      projectId: "project-1",
      data: { [BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]: customConfig("project-1") },
      credentials: { [BAMBOO_BOT_APP_SECRET_CREDENTIAL_KEY]: "custom-secret" },
    });

    expect(JSON.stringify(data)).not.toContain("custom-secret");
    expect(data?.[BAMBOO_TROUBLESHOOTER_CONFIG_DATA_KEY]).toMatchObject({
      bot: { kind: "custom", appId: "cli_custom", hasAppSecret: true },
    });
    const credentialFile = path.join(home, "plugins", "bamboo-troubleshooter-credentials.json");
    expect(readFileSync(credentialFile, "utf8")).toContain("custom-secret");
  });

  it("resolves existing and custom robots without adding the custom robot to channels", () => {
    const home = tempHome();
    const store = new BambooBotCredentialStore(home);
    store.configure({
      credentialId: "project-1",
      appId: "cli_custom",
      appSecret: "custom-secret",
    });
    const getBot = vi.fn((botId: string) =>
      botId === "bot-1"
        ? {
            config: {
              enabled: true,
              appId: "cli_existing",
              appSecret: "existing-secret",
              encryptKey: null,
              verificationToken: null,
              domain: "feishu" as const,
              target: {
                kind: "workspace" as const,
                provider: null,
                model: null,
                cwd: null,
                workspaceId: null,
              },
              substitute: { enabled: false, openId: null, name: null },
            },
          }
        : null,
    );
    const resolver = new BambooBotCredentialResolver({ getBot }, store);

    expect(resolver.resolve(customConfig("project-1")).config).toMatchObject({
      appId: "cli_custom",
      appSecret: "custom-secret",
    });
    expect(getBot).not.toHaveBeenCalled();

    const existing = BambooTroubleshooterConfigSchema.parse({
      botId: "bot-1",
      chats: [{ chatId: "oc_alerts" }],
      troubleshootingSopDoc: "https://example.com/wiki/sop",
      attributionRecordRoot: "https://example.com/wiki/root",
    });
    expect(resolver.resolve(existing).config.appId).toBe("cli_existing");
    expect(getBot).toHaveBeenCalledWith("bot-1");
  });

  it("overrides inherited Feishu credentials only for the Bamboo child process", () => {
    const home = tempHome();
    const store = new BambooBotCredentialStore(home);
    store.configure({
      credentialId: "project-1",
      appId: "cli_selected",
      appSecret: "selected-secret",
    });
    const resolver = new BambooBotCredentialResolver({ getBot: () => null }, store);
    const inherited = {
      FEISHU_BOT_APP_ID: "cli_environment",
      FEISHU_BOT_APP_SECRET: "environment-secret",
      BYTEDCLI_PROFILE: "global-profile",
      PASEO_BAMBOO_BYTEDCLI_PROFILE: "stale-bamboo-profile",
      LARKSUITE_CLI_APP_ID: "legacy-id",
      LARKSUITE_CLI_APP_SECRET: "legacy-secret",
      LARKSUITE_CLI_BRAND: "legacy-brand",
      LARKSUITE_CLI_USER_ACCESS_TOKEN: "legacy-user-token",
      LARKSUITE_CLI_TENANT_ACCESS_TOKEN: "legacy-tenant-token",
    };

    const env = resolver.commandEnvironment(customConfig("project-1", "cli_selected"), inherited);

    expect(env).toMatchObject({
      FEISHU_BOT_APP_ID: "cli_selected",
      FEISHU_BOT_APP_SECRET: "selected-secret",
      FEISHU_APP_ID: "cli_selected",
      FEISHU_APP_SECRET: "selected-secret",
      LARK_CLI_APP_ID: "cli_selected",
      LARK_CLI_APP_SECRET: "selected-secret",
      LARKSUITE_CLI_STRICT_MODE: "off",
      BYTEDCLI_PROFILE: expect.stringMatching(/^paseo-bamboo-[a-f0-9]{16}$/),
      PASEO_BAMBOO_BYTEDCLI_PROFILE: expect.stringMatching(/^paseo-bamboo-[a-f0-9]{16}$/),
    });
    expect(env.BYTEDCLI_PROFILE).toBe(env.PASEO_BAMBOO_BYTEDCLI_PROFILE);
    expect(env.BYTEDCLI_PROFILE).not.toContain("selected-secret");
    expect(env).not.toHaveProperty("LARKSUITE_CLI_APP_ID");
    expect(env).not.toHaveProperty("LARKSUITE_CLI_APP_SECRET");
    expect(env).not.toHaveProperty("LARKSUITE_CLI_BRAND");
    expect(env).not.toHaveProperty("LARKSUITE_CLI_USER_ACCESS_TOKEN");
    expect(env).not.toHaveProperty("LARKSUITE_CLI_TENANT_ACCESS_TOKEN");
    expect(inherited.FEISHU_BOT_APP_ID).toBe("cli_environment");
    expect(inherited.BYTEDCLI_PROFILE).toBe("global-profile");
  });

  it("uses a stable isolated bytedcli profile for each configured robot", () => {
    const home = tempHome();
    const store = new BambooBotCredentialStore(home);
    store.configure({
      credentialId: "project-1",
      appId: "cli_first",
      appSecret: "first-secret",
    });
    store.configure({
      credentialId: "project-2",
      appId: "cli_second",
      appSecret: "second-secret",
    });
    const resolver = new BambooBotCredentialResolver({ getBot: () => null }, store);

    const first = resolver.commandEnvironment(customConfig("project-1", "cli_first"), {});
    const firstAgain = resolver.commandEnvironment(customConfig("project-1", "cli_first"), {});
    const second = resolver.commandEnvironment(customConfig("project-2", "cli_second"), {});

    expect(first.BYTEDCLI_PROFILE).toBe(firstAgain.BYTEDCLI_PROFILE);
    expect(first.BYTEDCLI_PROFILE).not.toBe(second.BYTEDCLI_PROFILE);
    expect(first.BYTEDCLI_PROFILE).not.toContain("project-1");
    expect(first.BYTEDCLI_PROFILE).not.toContain("cli_first");
    expect(first.BYTEDCLI_PROFILE).not.toContain("first-secret");
  });
});
