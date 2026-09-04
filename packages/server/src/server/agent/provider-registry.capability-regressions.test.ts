import { beforeEach, expect, test, vi } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import type {
  AgentFeature,
  AgentModelDefinition,
  AgentSessionConfig,
  ProviderCatalog,
} from "./agent-sdk-types.js";
const mockState = vi.hoisted(() => {
  interface ConstructorEntry {
    runtimeSettings?: unknown;
    providerParams?: unknown;
    commandsRpcType?: unknown;
    customProvider?: unknown;
  }
  return {
    constructorArgs: {
      claude: [] as ConstructorEntry[],
      codex: [] as ConstructorEntry[],
      copilot: [] as ConstructorEntry[],
      cursor: [] as Array<{
        command: string[];
        env?: Record<string, string>;
        providerParams?: unknown;
      }>,
      trae: [] as Array<{
        command: string[];
        env?: Record<string, string>;
        providerParams?: unknown;
      }>,
      kimi: [] as Array<{
        command: string[];
        env?: Record<string, string>;
        providerParams?: unknown;
      }>,
      pi: [] as ConstructorEntry[],
      genericAcp: [] as Array<{
        command: string[];
        env?: Record<string, string>;
        providerId?: string;
        label?: string;
        providerParams?: unknown;
      }>,
    },
    isCommandAvailable: vi.fn(async (_command: string) => false),
    runtimeModels: new Map<string, AgentModelDefinition[]>(),
    cursorListFeaturesConfigs: [] as AgentSessionConfig[],
    reset() {
      this.constructorArgs.claude = [];
      this.constructorArgs.codex = [];
      this.constructorArgs.copilot = [];
      this.constructorArgs.cursor = [];
      this.constructorArgs.trae = [];
      this.constructorArgs.kimi = [];
      this.constructorArgs.pi = [];
      this.constructorArgs.genericAcp = [];
      this.isCommandAvailable.mockReset();
      this.isCommandAvailable.mockImplementation(async (_command: string) => false);
      this.runtimeModels.clear();
      this.cursorListFeaturesConfigs = [];
    },
  };
});
vi.mock("../../executable-resolution/executable-resolution.js", () => ({
  isCommandAvailable: mockState.isCommandAvailable,
}));
vi.mock("./providers/claude/agent.js", async () => {
  const { resolveConfiguredClaudeModel } = await import("./providers/claude/models.js");
  return {
    ClaudeAgentClient: class ClaudeAgentClient {
      readonly capabilities = {
        supportsStreaming: true,
        supportsSessionPersistence: true,
        supportsDynamicModes: true,
        supportsMcpServers: true,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
      };
      readonly provider = "claude";
      readonly runtimeSettings?: unknown;
      constructor(options: { runtimeSettings?: unknown; customProvider?: unknown }) {
        this.runtimeSettings = options.runtimeSettings;
        mockState.constructorArgs.claude.push({
          runtimeSettings: options.runtimeSettings,
          ...(options.customProvider ? { customProvider: options.customProvider } : {}),
        });
      }
      async createSession(): Promise<never> {
        throw new Error("not implemented");
      }
      async resumeSession(): Promise<never> {
        throw new Error("not implemented");
      }
      async fetchCatalog(): Promise<ProviderCatalog> {
        return {
          models: mockState.runtimeModels.get(this.provider) ?? [],
          modes: [],
        };
      }
      resolveConfiguredModel(model: AgentModelDefinition): AgentModelDefinition {
        return resolveConfiguredClaudeModel(model);
      }
      async isAvailable(): Promise<boolean> {
        const command:
          | {
              mode?: string;
              argv?: string[];
            }
          | undefined =
          typeof this.runtimeSettings === "object" && this.runtimeSettings !== null
            ? Reflect.get(this.runtimeSettings, "command")
            : undefined;
        if (command?.mode === "replace") {
          const { isCommandAvailable } =
            await import("../../executable-resolution/executable-resolution.js");
          return await isCommandAvailable(command.argv?.[0] ?? "");
        }
        return true;
      }
    },
  };
});
vi.mock("./providers/codex-app-server-agent.js", () => ({
  CodexAppServerAgentClient: class CodexAppServerAgentClient {
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "codex";
    readonly runtimeSettings?: unknown;
    constructor(_logger: unknown, runtimeSettings?: unknown) {
      this.runtimeSettings = runtimeSettings;
      mockState.constructorArgs.codex.push({ runtimeSettings });
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      const command:
        | {
            mode?: string;
            argv?: string[];
          }
        | undefined =
        typeof this.runtimeSettings === "object" && this.runtimeSettings !== null
          ? Reflect.get(this.runtimeSettings, "command")
          : undefined;
      if (command?.mode === "replace") {
        const { isCommandAvailable } =
          await import("../../executable-resolution/executable-resolution.js");
        return await isCommandAvailable(command.argv?.[0] ?? "");
      }
      return true;
    }
  },
}));
vi.mock("./providers/copilot-acp-agent.js", () => ({
  CopilotACPAgentClient: class CopilotACPAgentClient {
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "copilot";
    readonly runtimeSettings?: unknown;
    constructor(options: { runtimeSettings?: unknown }) {
      this.runtimeSettings = options.runtimeSettings;
      mockState.constructorArgs.copilot.push({
        runtimeSettings: options.runtimeSettings,
      });
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      const command:
        | {
            mode?: string;
            argv?: string[];
          }
        | undefined =
        typeof this.runtimeSettings === "object" && this.runtimeSettings !== null
          ? Reflect.get(this.runtimeSettings, "command")
          : undefined;
      if (command?.mode === "replace") {
        const { isCommandAvailable } =
          await import("../../executable-resolution/executable-resolution.js");
        return await isCommandAvailable(command.argv?.[0] ?? "");
      }
      return true;
    }
  },
}));
vi.mock("./providers/pi/agent.js", () => ({
  PiRpcAgentClient: class PiRpcAgentClient {
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "pi";
    readonly runtimeSettings?: unknown;
    constructor(options: {
      runtimeSettings?: unknown;
      providerParams?: unknown;
      commandsRpcType?: unknown;
    }) {
      this.runtimeSettings = options.runtimeSettings;
      const entry: ConstructorEntry = {
        runtimeSettings: options.runtimeSettings,
        providerParams: options.providerParams,
      };
      if (options.commandsRpcType !== undefined) {
        entry.commandsRpcType = options.commandsRpcType;
      }
      mockState.constructorArgs.pi.push(entry);
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      return true;
    }
  },
}));
vi.mock("./providers/generic-acp-agent.js", () => ({
  GenericACPAgentClient: class GenericACPAgentClient {
    capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "acp";
    readonly runtimeSettings?: unknown;
    constructor(options: {
      command: string[];
      env?: Record<string, string>;
      providerId?: string;
      label?: string;
      providerParams?: unknown;
    }) {
      const providerParams =
        options.providerParams &&
        typeof options.providerParams === "object" &&
        !Array.isArray(options.providerParams)
          ? (options.providerParams as Record<string, unknown>)
          : {};
      this.capabilities = {
        ...this.capabilities,
        supportsMcpServers:
          typeof providerParams.supportsMcpServers === "boolean"
            ? providerParams.supportsMcpServers
            : this.capabilities.supportsMcpServers,
      };
      this.runtimeSettings = {
        command: {
          mode: "replace",
          argv: options.command,
        },
        env: options.env,
      };
      mockState.constructorArgs.genericAcp.push({
        command: options.command,
        env: options.env,
        providerId: options.providerId,
        label: options.label,
        providerParams: options.providerParams,
      });
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      return true;
    }
  },
}));
vi.mock("./providers/cursor-acp-agent.js", () => ({
  CursorACPAgentClient: class CursorACPAgentClient {
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "acp";
    readonly runtimeSettings?: unknown;
    constructor(options: {
      command: string[];
      env?: Record<string, string>;
      providerParams?: unknown;
    }) {
      this.runtimeSettings = {
        command: {
          mode: "replace",
          argv: options.command,
        },
        env: options.env,
      };
      mockState.constructorArgs.cursor.push({
        command: options.command,
        env: options.env,
        providerParams: options.providerParams,
      });
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      return true;
    }
    async listFeatures(config: AgentSessionConfig): Promise<AgentFeature[]> {
      mockState.cursorListFeaturesConfigs.push(config);
      return [
        {
          type: "select",
          id: "fast",
          label: "Fast",
          value: "false",
          options: [{ id: "false", label: "Off" }],
        },
      ];
    }
  },
}));
vi.mock("./providers/trae-acp-agent.js", () => ({
  TraeACPAgentClient: class TraeACPAgentClient {
    protected readonly defaultModes: unknown[] = [];
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "acp";
    readonly runtimeSettings?: unknown;
    constructor(options: {
      command: string[];
      env?: Record<string, string>;
      providerParams?: unknown;
    }) {
      this.runtimeSettings = {
        command: {
          mode: "replace",
          argv: options.command,
        },
        env: options.env,
      };
      mockState.constructorArgs.trae.push({
        command: options.command,
        env: options.env,
        providerParams: options.providerParams,
      });
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      return true;
    }
  },
}));
vi.mock("./providers/kimi-acp-agent.js", () => ({
  KimiACPAgentClient: class KimiACPAgentClient {
    readonly capabilities = {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    };
    readonly provider = "acp";
    readonly runtimeSettings?: unknown;
    constructor(options: {
      command: string[];
      env?: Record<string, string>;
      providerParams?: unknown;
    }) {
      this.runtimeSettings = {
        command: {
          mode: "replace",
          argv: options.command,
        },
        env: options.env,
      };
      mockState.constructorArgs.kimi.push({
        command: options.command,
        env: options.env,
        providerParams: options.providerParams,
      });
    }
    async createSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async resumeSession(): Promise<never> {
      throw new Error("not implemented");
    }
    async fetchCatalog(): Promise<ProviderCatalog> {
      return {
        models: mockState.runtimeModels.get(this.provider) ?? [],
        modes: [],
      };
    }
    async isAvailable(): Promise<boolean> {
      return true;
    }
  },
}));
import { buildProviderRegistry } from "./provider-registry.js";
const logger = createTestLogger();
beforeEach(() => {
  mockState.reset();
});
test("new provider extending claude appears in registry", () => {
  const registry = buildProviderRegistry(logger, {
    providerOverrides: {
      zai: {
        extends: "claude",
        label: "ZAI",
        description: "Claude with ZAI defaults",
      },
    },
  });
  expect(registry.zai).toBeDefined();
  expect(registry.zai.label).toBe("ZAI");
  expect(registry.zai.description).toBe("Claude with ZAI defaults");
  expect(registry.zai.createClient(logger).provider).toBe("zai");
  expect(mockState.constructorArgs.claude).toContainEqual({
    runtimeSettings: undefined,
    customProvider: {
      id: "zai",
      label: "ZAI",
      extends: "claude",
    },
  });
});
test("legacy Aiden provider definitions receive their built-in launcher commands", () => {
  const registry = buildProviderRegistry(logger, {
    providerOverrides: {
      "aiden-claude": {
        extends: "claude",
        label: "Aiden Claude",
      },
      "aiden-codex": {
        extends: "codex",
        label: "Aiden Codex",
      },
    },
  });
  registry["aiden-claude"].createClient(logger);
  registry["aiden-codex"].createClient(logger);
  expect(mockState.constructorArgs.claude).toContainEqual({
    runtimeSettings: {
      command: {
        mode: "replace",
        argv: ["aiden", "x", "claude"],
      },
    },
    customProvider: {
      id: "aiden-claude",
      label: "Aiden Claude",
      extends: "claude",
    },
  });
  expect(mockState.constructorArgs.codex).toContainEqual({
    runtimeSettings: {
      command: {
        mode: "replace",
        argv: ["aiden", "x", "codex"],
      },
    },
  });
});
test("legacy Aiden Claude wrapper configurations use the direct Aiden launcher", () => {
  const registry = buildProviderRegistry(logger, {
    providerOverrides: {
      "aiden-claude": {
        extends: "claude",
        label: "Aiden Claude",
        command: ["/home/user/paseo/bin/aiden-x-claude-paseo"],
      },
    },
  });

  registry["aiden-claude"].createClient(logger);

  expect(mockState.constructorArgs.claude).toContainEqual({
    runtimeSettings: {
      command: {
        mode: "replace",
        argv: ["aiden", "x", "claude"],
      },
    },
    customProvider: {
      id: "aiden-claude",
      label: "Aiden Claude",
      extends: "claude",
    },
  });
});
test("traecli provider extending acp uses TraeACPAgentClient", () => {
  const registry = buildProviderRegistry(logger, {
    providerOverrides: {
      traecli: {
        extends: "acp",
        label: "TRAE CLI",
        command: ["traecli", "acp", "serve"],
      },
    },
  });
  expect(registry.traecli.createClient(logger).provider).toBe("traecli");
  expect(registry.traecli.defaultModeId).toBe("default");
  expect(registry.traecli.modes).toEqual([
    expect.objectContaining({ id: "default" }),
    expect.objectContaining({ id: "bypass_permissions", isUnattended: true }),
    expect.objectContaining({ id: "plan" }),
  ]);
  expect(mockState.constructorArgs.trae).toEqual([
    {
      command: ["traecli", "acp", "serve"],
      env: undefined,
      providerParams: undefined,
    },
    {
      command: ["traecli", "acp", "serve"],
      env: undefined,
      providerParams: undefined,
    },
  ]);
  expect(mockState.constructorArgs.genericAcp).toEqual([]);
});
