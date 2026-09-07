import { describe, expect, test } from "vitest";
import {
  DaemonGetStatusResponseSchema,
  FileExplorerResponseSchema,
  MutableDaemonConfigPatchSchema,
  MutableDaemonConfigSchema,
  parseServerInfoStatusPayload,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";
describe("global instruction template configuration", () => {
  test("parses daemon-global templates and template patches", () => {
    const instructionTemplates = [
      {
        id: "review",
        name: "Review changes",
        content: "Review {{serviceName}}.",
      },
    ];
    expect(
      MutableDaemonConfigSchema.parse({
        mcp: { injectIntoAgents: false },
        instructionTemplates,
      }).instructionTemplates,
    ).toEqual(instructionTemplates);
    expect(
      MutableDaemonConfigPatchSchema.parse({ instructionTemplates }).instructionTemplates,
    ).toEqual(instructionTemplates);
  });
});
describe("Host knowledge configuration", () => {
  test("parses Host knowledge and patches with Project-compatible resources", () => {
    const knowledge = {
      general: [
        { type: "local-directory" as const, source: "shared" },
        { type: "cloud-document" as const, source: "https://example.com/background" },
      ],
      standards: [
        { type: "local-document" as const, source: "standards/review.md" },
        { type: "cloud-document" as const, source: "https://example.com/standards" },
      ],
    };
    expect(
      MutableDaemonConfigSchema.parse({
        mcp: { injectIntoAgents: false },
        knowledge,
      }).knowledge,
    ).toEqual(knowledge);
    expect(MutableDaemonConfigPatchSchema.parse({ knowledge }).knowledge).toEqual(knowledge);
  });
  test("rejects Project-only knowledge from Host standards", () => {
    expect(
      MutableDaemonConfigPatchSchema.safeParse({
        knowledge: {
          standards: [{ type: "local-directory", source: "standards" }],
        },
      }).success,
    ).toBe(false);
  });
});
describe("Relay configuration", () => {
  test("parses independent Relay and pairing frontend lists", () => {
    const relay = MutableDaemonConfigSchema.parse({
      mcp: { injectIntoAgents: false },
      relay: {
        endpoints: [
          { endpoint: "relay.paseo.sh:443", useTls: true },
          { endpoint: "10.71.95.148:6769", useTls: false },
        ],
        pairingBaseUrls: ["https://app.paseo.sh", "http://10.71.95.148:6769"],
        local: { enabled: false, listen: "0.0.0.0:6769" },
      },
    }).relay;
    expect(relay.pairingBaseUrls).toEqual(["https://app.paseo.sh", "http://10.71.95.148:6769"]);
  });
});
describe("Daemon Relay status messages", () => {
  test("parses the daemon Relay device type from server info", () => {
    expect(
      parseServerInfoStatusPayload({
        status: "server_info",
        serverId: "srv_mac",
        relayDeviceType: "mac",
      })?.relayDeviceType,
    ).toBe("mac");
    expect(
      parseServerInfoStatusPayload({
        status: "server_info",
        serverId: "srv_legacy",
      })?.relayDeviceType,
    ).toBeUndefined();
  });
  test("parses Relay device types and defaults legacy records to unknown", () => {
    const response = DaemonGetStatusResponseSchema.parse({
      type: "daemon.get_status.response",
      payload: {
        requestId: "req-relay-status",
        serverId: "srv_test",
        pid: 123,
        nodePath: "/usr/bin/node",
        listen: "127.0.0.1:6767",
        providers: [],
        relay: {
          enabled: true,
          endpoints: [],
          local: {
            enabled: true,
            listen: "127.0.0.1:6769",
            runtime: {
              listen: "127.0.0.1:6769",
              publicEndpoint: "127.0.0.1:6769",
              pairingBaseUrl: "http://127.0.0.1:6769/app",
              connections: [
                {
                  serverId: "srv_test",
                  role: "client",
                  connectionId: "connection-1",
                  remoteAddress: "127.0.0.1",
                  connectedAt: "2026-07-31T00:00:00.000Z",
                  deviceType: "android",
                },
              ],
              history: [
                {
                  id: "history-1",
                  serverId: "srv_test",
                  role: "server_control",
                  connectionId: null,
                  remoteAddress: "127.0.0.1",
                  connectedAt: "2026-07-31T00:00:00.000Z",
                  disconnectedAt: "2026-07-31T00:01:00.000Z",
                },
              ],
            },
          },
        },
      },
    });
    expect(response.payload.relay?.local?.runtime?.connections[0]?.deviceType).toBe("android");
    expect(response.payload.relay?.local?.runtime?.history?.[0]?.deviceType).toBeNull();
  });
});
describe("Assistant messages", () => {
  test("parses assistant CRUD request and response messages", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "assistant.create.request",
        requestId: "req-assistant-create",
        assistant: {
          name: "Reviewer",
          description: "Reviews code",
          provider: "claude",
          model: "sonnet",
          prompt: "Review carefully.",
          memoryEnabled: true,
          memory: "Prefer concise feedback.",
          resourceSelection: {
            mode: "custom",
            selectedMcpServerIds: ["mcp-db"],
            selectedSkillIds: ["skill-review"],
          },
        },
      }).type,
    ).toBe("assistant.create.request");
    expect(
      SessionInboundMessageSchema.parse({
        type: "assistant.update.request",
        requestId: "req-assistant-update",
        assistant: {
          id: "assistant-1",
          memoryEnabled: true,
          memoryAppend: "Remember to keep review comments actionable.",
          memorySummary: "# Edited memory summary",
          resourceSelection: {
            mode: "all-enabled",
          },
          memoryDetailFileEdits: [
            {
              id: "detail-001",
              content: "# Edited details\n\nPrefer actionable comments.",
            },
          ],
        },
      }).type,
    ).toBe("assistant.update.request");
    expect(
      SessionOutboundMessageSchema.parse({
        type: "assistant.list.response",
        payload: {
          requestId: "req-assistant-list",
          error: null,
          assistants: [
            {
              id: "assistant-1",
              name: "Reviewer",
              description: "Reviews code",
              provider: "claude",
              model: "sonnet",
              prompt: "Review carefully.",
              memoryEnabled: true,
              memory: "Prefer concise feedback.",
              memorySummary: "# Assistant memory summary",
              memoryFiles: {
                summaryPath: "/tmp/assistant-memory/summary.md",
                detailFiles: [
                  {
                    id: "detail-001",
                    title: "Preferences",
                    path: "/tmp/assistant-memory/details/detail-001.md",
                    charCount: 24,
                    content: "# Preferences\n\nPrefer concise feedback.",
                  },
                ],
              },
              createdAt: "2026-01-01T00:00:00.000Z",
              resourceSelection: {
                mode: "custom",
                selectedMcpServerIds: ["mcp-db"],
                selectedSkillIds: ["skill-review"],
              },
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      }).type,
    ).toBe("assistant.list.response");
  });
});
describe("Lark channel messages", () => {
  test("parses Lark channel request and response messages", () => {
    expect(
      SessionInboundMessageSchema.parse({
        type: "channel.lark.configure.request",
        requestId: "req-lark-configure",
        createNew: true,
        name: "Settlement bot",
        appId: "cli_test",
        appSecret: "secret",
        substitute: {
          enabled: true,
          openId: "ou_alice",
          name: "Alice",
        },
        target: {
          kind: "workspace",
          provider: "claude",
          model: "sonnet",
          modeId: "accept-edits",
          thinkingOptionId: "high",
          cwd: "/repo/app",
          workspaceId: "ws-1",
        },
      }).type,
    ).toBe("channel.lark.configure.request");
    expect(
      SessionInboundMessageSchema.parse({
        type: "channel.lark.configure.request",
        requestId: "req-lark-team",
        target: {
          kind: "team",
          teamId: "team-delivery",
          provider: "claude",
          model: "sonnet",
          modeId: "accept-edits",
          thinkingOptionId: "high",
          cwd: "/repo/app",
          workspaceId: "ws-1",
        },
      }).type,
    ).toBe("channel.lark.configure.request");
    expect(
      SessionOutboundMessageSchema.parse({
        type: "channel.lark.get_status.response",
        payload: {
          requestId: "req-lark-status",
          error: null,
          status: {
            activeBotId: "bot-1",
            enabled: false,
            connectionStatus: "disabled",
            error: null,
            appId: "cli_test",
            hasAppSecret: true,
            hasEncryptKey: false,
            hasVerificationToken: false,
            domain: "feishu",
            target: {
              kind: "workspace",
              provider: null,
              model: null,
              cwd: null,
              workspaceId: null,
            },
            bot: null,
            pendingPairings: [],
            authorizedUsers: [],
            bots: [
              {
                id: "bot-1",
                name: "Settlement bot",
                enabled: false,
                connectionStatus: "disabled",
                error: null,
                appId: "cli_test",
                hasAppSecret: true,
                hasEncryptKey: false,
                hasVerificationToken: false,
                domain: "feishu",
                target: {
                  kind: "workspace",
                  provider: null,
                  model: null,
                  cwd: null,
                  workspaceId: null,
                },
                bot: null,
                pendingPairings: [],
                authorizedUsers: [],
              },
            ],
          },
        },
      }).type,
    ).toBe("channel.lark.get_status.response");
    expect(
      SessionInboundMessageSchema.parse({
        type: "channel.lark.delete_bot.request",
        requestId: "req-lark-delete",
        botId: "bot-1",
      }).type,
    ).toBe("channel.lark.delete_bot.request");
  });
  test("parses Lark channel feature flag", () => {
    const parsed = parseServerInfoStatusPayload({
      status: "server_info",
      serverId: "srv_1",
      features: { larkChannel: true },
    });
    expect(parsed.features?.larkChannel).toBe(true);
  });
});
describe("file explorer request compatibility", () => {
  test("errorCode is optional for old daemons and accepted from new daemons", () => {
    const payload = {
      cwd: "/repo/app",
      path: ".",
      mode: "list" as const,
      directory: null,
      file: null,
      error: "Directory does not exist",
      requestId: "req-missing",
    };
    expect(
      FileExplorerResponseSchema.parse({
        type: "file_explorer_response",
        payload,
      }).payload.errorCode,
    ).toBeUndefined();
    expect(
      FileExplorerResponseSchema.parse({
        type: "file_explorer_response",
        payload: { ...payload, errorCode: "not_found" },
      }).payload.errorCode,
    ).toBe("not_found");
  });
});
