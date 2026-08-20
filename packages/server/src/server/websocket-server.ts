import { WebSocket, WebSocketServer } from "ws";
import { createServer as createHttpServer } from "node:http";
import type { IncomingMessage, Server as HTTPServer } from "http";
import { join } from "path";
import { hostname as getHostname, networkInterfaces } from "node:os";
import { randomUUID } from "node:crypto";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { KeyPair } from "@getpaseo/relay/e2ee";
import type { AgentManager, AgentMetricsSnapshot } from "./agent/agent-manager.js";
import type { AgentStorage } from "./agent/agent-storage.js";
import type { DownloadTokenStore } from "./file-download/token-store.js";
import type { TerminalManager } from "../terminal/terminal-manager.js";
import type pino from "pino";
import type { ProjectRegistry, WorkspaceRegistry } from "./workspace-registry.js";
import type { ProjectUpdate } from "./workspace-reconciliation-service.js";
import type { ScheduleService } from "./schedule/service.js";
import type { WorkflowService } from "./workflow/service.js";
import type { LoopService } from "./loop-service.js";
import type { CheckoutDiffManager, CheckoutDiffMetrics } from "./checkout-diff-manager.js";
import type { DaemonConfigStore, MutableDaemonConfig } from "./daemon-config-store.js";
import {
  type ServerInfoStatusPayload,
  type DaemonClientAccessEntry,
  type SessionOutboundMessage,
  type WorkspaceSetupSnapshot,
  type WSHelloMessage,
  type WSInboundMessage,
  WSInboundMessageSchema,
  type ServerCapabilityState,
  type ServerCapabilities,
  type WSOutboundMessage,
  wrapSessionMessage,
} from "./messages.js";
import { asUint8Array, decodeBinaryFrame } from "@getpaseo/protocol/binary-frames/index";
import type { TerminalActivity } from "@getpaseo/protocol/terminal-activity";
import type { HostnamesConfig } from "./hostnames.js";
import { isHostnameAllowed } from "./hostnames.js";
import { Session, type SessionLifecycleIntent, type SessionRuntimeMetrics } from "./session.js";
import type { HubRelationshipManagement } from "./hub/relationship-controller.js";
import { WorkspaceSetupRuntime } from "./workspace-setup-runtime.js";
import type { HubExecutionAgents } from "./hub/daemon-executions.js";
import type { AgentProvider } from "./agent/agent-sdk-types.js";
import { ProviderSnapshotManager } from "./agent/provider-snapshot-manager.js";
import type {
  WorkspaceGitRuntimeSnapshot,
  WorkspaceGitService,
  WorkspaceGitServiceMetrics,
} from "./workspace-git-service.js";
import type { GitCommandRuntimeMetricsSnapshot } from "../utils/git-command-runtime-metrics.js";
import { snapshotGitCommandRuntimeMetrics } from "../utils/run-git-command.js";
import type { WorkspaceAutoName } from "./workspace-auto-name.js";
import { deriveProjectSlug } from "./workspace-git-metadata.js";
import {
  createPushNotifications,
  type PushNotifications,
  type PushNotificationSender,
} from "./push/index.js";
import type { ScriptHealthState } from "./script-health-monitor.js";
import type { ServiceProxySubsystem } from "./service-proxy.js";
import type { WorkspaceScriptRuntimeStore } from "./workspace-script-runtime-store.js";
import type { SpeechReadinessSnapshot, SpeechService } from "./speech/speech-runtime.js";
import type { VoiceCallerContext, VoiceSpeakHandler } from "./voice-types.js";
import {
  computeNotificationPlan,
  isPushEligibleAttentionReason,
  type ClientPresenceState,
} from "./agent-attention-policy.js";
import {
  buildAgentAttentionNotificationPayload,
  findLatestPermissionRequest,
} from "@getpaseo/protocol/agent-attention-notification";
import { createGitHubService } from "../services/github-service.js";
import type { ForgeService } from "../services/forge-service.js";
import {
  extractWsBearerProtocol,
  extractWsBearerToken,
  isBearerTokenValid,
  type DaemonAuthConfig,
} from "./auth.js";
import {
  WebSocketRuntimeMetricsWindow,
  type WebSocketRuntimeCounters,
  type WebSocketRuntimeDiagnosticSnapshot,
} from "./websocket/runtime-metrics.js";
import { ProviderUsageService } from "../services/quota-fetcher/service.js";
import { getProcessMemoryDiagnostics, getProcessUptimeSeconds } from "./process-diagnostics.js";
import {
  CLIENT_SHUTDOWN_RPC_REASON,
  normalizeClientRestartRpcReason,
} from "./lifecycle-reasons.js";
import { CLIENT_CAPS } from "@getpaseo/protocol/client-capabilities";
import type { BrowserAutomationExecuteResponse } from "@getpaseo/protocol/browser-automation/rpc-schemas";
import {
  WORKFLOW_PROTOCOL_REVISION,
  WORKFLOW_PROTOCOL_VERSION,
} from "@getpaseo/protocol/workflow/protocol-version";
import {
  BrowserAutomationHostCapabilitySchema,
  type BrowserAutomationHostCapability,
} from "@getpaseo/protocol/browser-automation/capabilities";
import type { BrowserToolsBroker } from "./browser-tools/broker.js";
import type { DaemonRuntimeConfig } from "./session/daemon/daemon-session.js";
import type { LarkChannelService } from "./channels/lark/lark-channel-service.js";
import type { AssistantStore } from "./assistants/assistant-store.js";
import type { PaseoMemoryService } from "./memory/memory-service.js";
import type { TeamStore } from "./team/team-store.js";
import type { McpStore } from "./mcp/mcp-store.js";
import type { SkillStore } from "./skill/skill-store.js";
import type { PluginService } from "./plugin/plugin-service.js";
import {
  CLIENT_ACCESS_HISTORY_RETENTION_DAYS,
  ClientAccessStore,
  type ApprovedClientAccessRecord,
} from "./client-access-store.js";
import { wrapDaemonEncryptedWebSocket } from "./encrypted-websocket.js";
import {
  APPLICATION_SOCKET_LEASE_CHECK_INTERVAL_MS,
  ApplicationSocketLease,
  MAX_PHYSICAL_SOCKET_BUFFERED_BYTES,
  outboundFrameByteLength,
  physicalSocketHasCapacity,
  sendBoundedPhysicalFrame,
  sendBoundedPhysicalFrameAndWait,
} from "./websocket/physical-socket.js";

const WS_CLOSE_DAEMON_AUTH_FAILED = 4401;
const WS_CLOSE_DIRECT_UPGRADE_DENIED = 4403;
const WS_CLOSE_CLIENT_ACCESS_REVOKED = 4404;
const CLIENT_ACCESS_DENIED_MESSAGE = "无权限，联系服务端通过连接申请";
const DIRECT_UPGRADE_TOKEN_TTL_MS = 30_000;

export interface ExternalSocketMetadata {
  transport: "relay" | "direct_e2ee";
  externalSessionKey?: string;
  relayConnectionId?: string;
  directUpgradeClientId?: string;
  remoteAddress?: string;
  remotePort?: number;
  userAgent?: string;
}

interface PendingConnection {
  connectionLogger: pino.Logger;
  helloTimeout: ReturnType<typeof setTimeout> | null;
  identity: WebSocketConnectionIdentity;
}

interface PendingClientAdmission {
  connectionLogger: pino.Logger;
  identity: WebSocketConnectionIdentity;
  hello: WSHelloMessage;
  requestedAt: string;
}

type ImplicitlyAllowedClientAccessEntry = Omit<DaemonClientAccessEntry, "connected" | "status">;

interface WebSocketConnectionIdentity {
  connectionId: string;
  transport: "direct" | "relay";
  peer: "loopback" | "local_ipc" | "external";
  browserOrigin: boolean;
  host?: string;
  origin?: string;
  userAgent?: string;
  remoteAddress?: string;
  remotePort?: number;
  relayConnectionId?: string;
  directUpgradeClientId?: string;
  clientId?: string;
  sessionId?: string;
  appVersion?: string;
}

interface WebSocketServerConfig {
  allowedOrigins: Set<string>;
  hostnames?: HostnamesConfig;
  daemonStatusRpc?: boolean;
  relayConfig?: boolean;
}

type WebSocketRuntimeMetrics = SessionRuntimeMetrics & CheckoutDiffMetrics;
interface GitRuntimeMetrics {
  commands: GitCommandRuntimeMetricsSnapshot;
  workspaceService: WorkspaceGitServiceMetrics;
}
type WebSocketRuntimeDiagnosticPayload = WebSocketRuntimeDiagnosticSnapshot<
  WebSocketRuntimeMetrics,
  AgentMetricsSnapshot,
  GitRuntimeMetrics
>;
type WebSocketRuntimeMetricsLogPayload = Omit<WebSocketRuntimeDiagnosticPayload, "collectedAt">;

type TerminalAttentionReason = "finished" | "needs_input";

function resolveTerminalAttentionReason(input: {
  attentionReason?: TerminalActivity["attentionReason"];
  previousState: "working" | "idle" | "attention" | null;
  state: "working" | "idle" | "attention" | null;
}): TerminalAttentionReason | null {
  if (input.attentionReason === "finished") return "finished";
  if (input.attentionReason === "needs_input") return "needs_input";
  if (input.state === "attention") return "needs_input";
  if (input.previousState === "working" && input.state === "idle") return "finished";
  return null;
}

function terminalAttentionTitle(reason: TerminalAttentionReason): string {
  return reason === "needs_input" ? "Terminal needs input" : "Terminal finished";
}

function createFallbackWorkspaceGitSnapshot(cwd: string): WorkspaceGitRuntimeSnapshot {
  return {
    cwd,
    git: {
      isGit: false,
      repoRoot: null,
      mainRepoRoot: null,
      currentBranch: null,
      remoteUrl: null,
      isPaseoOwnedWorktree: false,
      isDirty: null,
      baseRef: null,
      aheadBehind: null,
      upstreamRef: null,
      aheadOfOrigin: null,
      behindOfOrigin: null,
      hasRemote: false,
      diffStat: null,
    },
    forge: {
      featuresEnabled: false,
      authState: "no_remote",
      pullRequest: null,
      error: null,
    },
  };
}

function createFallbackWorkspaceGitService(): WorkspaceGitService {
  return {
    registerWorkspace: () => ({
      unsubscribe: () => {},
    }),
    onSnapshotUpdated: () => ({
      unsubscribe: () => {},
    }),
    peekSnapshot: () => null,
    getCheckout: async (cwd: string) => ({
      cwd,
      isGit: false,
      currentBranch: null,
      remoteUrl: null,
      worktreeRoot: null,
      isPaseoOwnedWorktree: false,
      mainRepoRoot: null,
    }),
    getSnapshot: async (cwd: string) => createFallbackWorkspaceGitSnapshot(cwd),
    resolveForge: async () => null,
    getCheckoutDiff: async () => ({ diff: "" }),
    validateBranchRef: async () => ({ kind: "not-found" }),
    hasLocalBranch: async () => false,
    suggestBranchesForCwd: async () => [],
    listStashes: async () => [],
    listWorktrees: async () => [],
    getProjectSlug: async (cwd: string) => {
      const snapshot = createFallbackWorkspaceGitSnapshot(cwd);
      return deriveProjectSlug(cwd, snapshot.git.isGit ? snapshot.git.remoteUrl : null);
    },
    resolveRepoRoot: async (cwd: string) => cwd,
    resolveDefaultBranch: async () => "main",
    resolveRepoRemoteUrl: async () => null,
    refresh: async () => {},
    requestWorkingTreeWatch: async () => ({
      repoRoot: null,
      unsubscribe: () => {},
    }),
    scheduleRefreshForCwd: () => {},
    onWorkspaceStateMayHaveChanged: () => {},
    invalidateForge: () => {},
    getMetrics: () => ({
      workspaceTargetCount: 0,
      workspaceListenerCount: 0,
      repositoryTargetCount: 0,
      repositoryWorkspaceLinkCount: 0,
      workingTreeWatchTargetCount: 0,
      workingTreeWatchListenerCount: 0,
      workspaceObservationSetupInFlightCount: 0,
      workingTreeWatchSetupInFlightCount: 0,
      workspaceRefreshInFlightCount: 0,
      workspaceRefreshQueuedCount: 0,
      workspaceRefreshAdmissionActiveCount: 0,
      workspaceRefreshAdmissionPendingCount: 0,
      workspaceObservationSetupAdmissionActiveCount: 0,
      workspaceObservationSetupAdmissionPendingCount: 0,
      fetchInFlightCount: 0,
      snapshotUpdatedListenerCount: 0,
      watcherErrorCallbackCount: 0,
      fileObserver: {
        activeObservationCount: 0,
        nativeHandleCount: 0,
        nativeTrackedFileCount: 0,
        pendingEventCount: 0,
        pendingReconciliationWorkCount: 0,
        reconciliationInFlightCount: 0,
        reconciliationCount: 0,
        scopedReconciliationCount: 0,
        fullReconciliationCount: 0,
        reconciliationFailureCount: 0,
        observerFailureCount: 0,
        directoryLimitFailureCount: 0,
        nativeEventCount: 0,
        nativeChangeEventCount: 0,
        nativeRenameEventCount: 0,
        nativePathlessEventCount: 0,
        nativeClassificationCount: 0,
        nativeShallowScanCount: 0,
        lastReconciliationDurationMs: 0,
        maxReconciliationDurationMs: 0,
      },
    }),
    dispose: async () => {},
  };
}

function createNoopProjectRegistry(): ProjectRegistry {
  return {
    initialize: async () => {},
    existsOnDisk: async () => true,
    list: async () => [],
    get: async () => null,
    getOrCreateActiveByRoot: async (input) => ({
      projectId: "prj_noop",
      rootPath: input.rootPath,
      kind: input.kind,
      displayName: input.displayName,
      projectKey: input.projectKey ?? null,
      customName: null,
      customIconRevision: null,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
      archivedAt: null,
    }),
    upsert: async () => {},
    update: async () => null,
    archive: async () => {},
    remove: async () => {},
  };
}

function createNoopWorkspaceRegistry(): WorkspaceRegistry {
  return {
    initialize: async () => {},
    existsOnDisk: async () => true,
    list: async () => [],
    get: async () => null,
    update: async () => null,
    upsert: async () => {},
    archive: async () => {},
    remove: async () => {},
  };
}

function toServerCapabilityState(params: {
  state: SpeechReadinessSnapshot["dictation"];
  reason: string;
}): ServerCapabilityState {
  const { state, reason } = params;
  return {
    enabled: state.enabled,
    reason,
  };
}

function resolveCapabilityReason(params: {
  state: SpeechReadinessSnapshot["dictation"];
  readiness: SpeechReadinessSnapshot;
}): string {
  const { state, readiness } = params;
  if (state.available) {
    return "";
  }

  if (readiness.voiceFeature.reasonCode === "model_download_in_progress") {
    const baseMessage = readiness.voiceFeature.message.trim();
    if (baseMessage.includes("Try again in a few minutes")) {
      return baseMessage;
    }
    return `${baseMessage} Try again in a few minutes.`;
  }

  return state.message;
}

function buildServerCapabilities(params: {
  readiness: SpeechReadinessSnapshot | null;
}): ServerCapabilities | undefined {
  const readiness = params.readiness;
  if (!readiness) {
    return undefined;
  }
  return {
    voice: {
      dictation: toServerCapabilityState({
        state: readiness.dictation,
        reason: resolveCapabilityReason({
          state: readiness.dictation,
          readiness,
        }),
      }),
      voice: toServerCapabilityState({
        state: readiness.realtimeVoice,
        reason: resolveCapabilityReason({
          state: readiness.realtimeVoice,
          readiness,
        }),
      }),
    },
  };
}

function areServerCapabilitiesEqual(
  current: ServerCapabilities | undefined,
  next: ServerCapabilities | undefined,
): boolean {
  return JSON.stringify(current ?? null) === JSON.stringify(next ?? null);
}

function bufferFromWsData(data: Buffer | ArrayBuffer | Buffer[] | string): Buffer {
  if (typeof data === "string") return Buffer.from(data, "utf8");
  if (Array.isArray(data)) {
    return Buffer.concat(
      data.map((item) => (Buffer.isBuffer(item) ? item : Buffer.from(item as ArrayBuffer))),
    );
  }
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

function getBrowserHostCapability(
  capabilities: Record<string, unknown> | null,
): BrowserAutomationHostCapability | null {
  const parsed = BrowserAutomationHostCapabilitySchema.safeParse(
    capabilities?.[CLIENT_CAPS.browserHost],
  );
  return parsed.success ? parsed.data : null;
}

export interface WebSocketLike {
  readyState: number;
  bufferedAmount?: number;
  send: (
    data: string | Uint8Array | ArrayBuffer,
    callback?: (error?: Error) => void,
  ) => void | Promise<void>;
  close: (code?: number, reason?: string) => void;
  terminate?: () => void;
  on: (event: "message" | "close" | "error", listener: (...args: unknown[]) => void) => void;
  once: (event: "close" | "error", listener: (...args: unknown[]) => void) => void;
}

interface TrustedSessionConnection {
  kind: "trusted";
  session: Session;
  clientId: string;
  appVersion: string | null;
  clientCapabilities: Record<string, unknown> | null;
  connectionLogger: pino.Logger;
  sockets: Set<WebSocketLike>;
  externalDisconnectCleanupTimeout: ReturnType<typeof setTimeout> | null;
}

interface HubConnection {
  kind: "hub";
  session: Session;
  daemonId: string;
  connectionLogger: pino.Logger;
  socket: WebSocketLike;
}

type SessionInboundMessage = Extract<WSInboundMessage, { type: "session" }>["message"];

type SessionConnection = TrustedSessionConnection | HubConnection;

type TrustedLifecycleKey =
  | "clientId"
  | "appVersion"
  | "clientCapabilities"
  | "sockets"
  | "externalDisconnectCleanupTimeout";
type HubLifecycleOverlap = Extract<keyof HubConnection, TrustedLifecycleKey>;
const HUB_HAS_NO_TRUSTED_LIFECYCLE_STATE: HubLifecycleOverlap extends never ? true : never = true;
void HUB_HAS_NO_TRUSTED_LIFECYCLE_STATE;

interface BrowserToolsRegistration {
  capabilitySignature: string;
  unregister: () => void;
}

interface SocketSessionOptions {
  clientId: string;
  appVersion: string | null;
  clientCapabilities: Record<string, unknown> | null;
  scopes: readonly string[];
  connectionLogger: pino.Logger;
  onMessage: (message: SessionOutboundMessage) => void;
  onMessageToSource?: (source: object, message: SessionOutboundMessage) => void;
  onBinaryMessage?: (frame: Uint8Array) => void;
  onBinaryMessageToSource?: (source: object, frame: Uint8Array) => Promise<void>;
  getTransportBufferedAmount?: () => number | null;
  onLifecycleIntent?: (intent: SessionLifecycleIntent) => void;
  hubExecutionAgents?: HubExecutionAgents;
  hubRelationships?: HubRelationshipManagement;
}

interface ClosePhysicalSocketParams {
  ws: WebSocketLike;
  logMessage: string;
  logFields?: Record<string, unknown>;
}

const SLOW_REQUEST_THRESHOLD_MS = 500;
const EXTERNAL_SESSION_DISCONNECT_GRACE_MS = 90_000;
const HELLO_TIMEOUT_MS = 15_000;
const WS_CLOSE_HELLO_TIMEOUT = 4001;
const WS_CLOSE_INVALID_HELLO = 4002;
const WS_CLOSE_INCOMPATIBLE_PROTOCOL = 4003;
const WS_CLOSE_SERVER_SHUTDOWN = 1001;
const WS_PROTOCOL_VERSION = 1;
const WS_RUNTIME_METRICS_FLUSH_MS = 30_000;

export class MissingDaemonVersionError extends Error {
  constructor() {
    super("VoiceAssistantWebSocketServer requires a non-empty daemonVersion.");
    this.name = "MissingDaemonVersionError";
  }
}

interface RequiredWebSocketServices {
  scheduleService: ScheduleService;
  checkoutDiffManager: CheckoutDiffManager;
}

function requireWebSocketServices(params: {
  scheduleService?: ScheduleService;
  checkoutDiffManager?: CheckoutDiffManager;
}): RequiredWebSocketServices {
  const { scheduleService, checkoutDiffManager } = params;
  if (!scheduleService) {
    throw new Error("VoiceAssistantWebSocketServer requires a schedule service.");
  }
  if (!checkoutDiffManager) {
    throw new Error("VoiceAssistantWebSocketServer requires a checkout diff manager.");
  }
  return { scheduleService, checkoutDiffManager };
}

/**
 * WebSocket server that only accepts sockets + parses/forwards messages to the session layer.
 */
export class VoiceAssistantWebSocketServer {
  private readonly logger: pino.Logger;
  private readonly wss: WebSocketServer;
  private readonly pendingConnections: Map<WebSocketLike, PendingConnection> = new Map();
  private readonly pendingClientAdmissions = new Map<WebSocketLike, PendingClientAdmission>();
  private readonly sessions: Map<WebSocketLike, SessionConnection> = new Map();
  private readonly socketIdentities: Map<WebSocketLike, WebSocketConnectionIdentity> = new Map();
  private readonly clientAccessHistoryIds = new Map<WebSocketLike, string>();
  private readonly externalSessionsByKey: Map<string, TrustedSessionConnection> = new Map();
  private readonly implicitlyAllowedClientAccess = new Map<
    string,
    ImplicitlyAllowedClientAccessEntry
  >();
  private readonly serverId: string;
  private readonly daemonVersion: string;
  private readonly daemonRuntimeConfig: DaemonRuntimeConfig | undefined;
  private readonly agentManager: AgentManager;
  private readonly agentStorage: AgentStorage;
  private readonly projectRegistry: ProjectRegistry;
  private readonly workspaceRegistry: WorkspaceRegistry;
  private readonly scheduleService: ScheduleService;
  private readonly workflowService: WorkflowService | null;
  private readonly loopService: LoopService | null;
  private readonly checkoutDiffManager: CheckoutDiffManager;
  private readonly github: ForgeService;
  private readonly workspaceGitService: WorkspaceGitService;
  private readonly workspaceAutoName: WorkspaceAutoName;
  private readonly downloadTokenStore: DownloadTokenStore;
  private readonly paseoHome: string;
  private readonly worktreesRoot: string | undefined;
  private readonly daemonConfigStore: DaemonConfigStore;
  private readonly pushNotifications: PushNotifications;
  private readonly pushNotificationSender: PushNotificationSender;
  private readonly mcpBaseUrl: string | null;
  private speech!: SpeechService | null;
  private terminalManager!: TerminalManager | null;
  private serviceProxy!: ServiceProxySubsystem | null;
  private scriptRuntimeStore!: WorkspaceScriptRuntimeStore | null;
  private getDaemonTcpPort!: (() => number | null) | null;
  private getDaemonTcpHost!: (() => string | null) | null;
  private serviceProxyPublicBaseUrl!: string | null;
  private resolveScriptHealth!: ((hostname: string) => ScriptHealthState | null) | null;
  private dictation!: {
    finalTimeoutMs?: number;
  } | null;
  private readonly voiceSpeakHandlers = new Map<string, VoiceSpeakHandler>();
  private readonly voiceCallerContexts = new Map<string, VoiceCallerContext>();
  private readonly workspaceSetupSnapshots = new Map<string, WorkspaceSetupSnapshot>();
  private readonly workspaceSetupRuntime: WorkspaceSetupRuntime;
  private readonly providerSnapshotManager: ProviderSnapshotManager;
  private onLifecycleIntent!: ((intent: SessionLifecycleIntent) => void) | null;
  private onBranchChanged!:
    | ((workspaceId: string, oldBranch: string | null, newBranch: string | null) => void)
    | null;
  private serverCapabilities: ServerCapabilities | undefined;
  private readonly runtimeMetrics = new WebSocketRuntimeMetricsWindow();
  private lastRuntimeMetricsSnapshot: WebSocketRuntimeDiagnosticPayload | null = null;
  private runtimeMetricsInterval: ReturnType<typeof setInterval> | null = null;
  private applicationSocketLeaseInterval: ReturnType<typeof setInterval> | null = null;
  private readonly applicationSocketLease = new ApplicationSocketLease<WebSocketLike>();
  private eventLoopDelayMonitor: ReturnType<typeof monitorEventLoopDelay> | null = null;
  private unsubscribeSpeechReadiness: (() => void) | null = null;
  private unsubscribeDaemonConfigChange: (() => void) | null = null;
  private readonly providerUsageService: ProviderUsageService;
  private unsubscribeTerminalActivity: (() => void) | null = null;
  private readonly browserToolsBroker: BrowserToolsBroker | null;
  private readonly hubRelationships: HubRelationshipManagement | null;
  private readonly larkChannelService: LarkChannelService | null;
  private readonly assistantStore: AssistantStore | null;
  private readonly memoryService: PaseoMemoryService | null;
  private readonly teamStore: TeamStore | null;
  private readonly mcpStore: McpStore | null;
  private readonly skillStore: SkillStore | null;
  private readonly pluginService: PluginService | null;
  private readonly clientAccessStore: ClientAccessStore;
  private readonly daemonKeyPair: KeyPair | null;
  private readonly directUpgradeTokens = new Map<
    string,
    { clientId: string; expiresAtMs: number }
  >();
  private directHttpServer: HTTPServer | null = null;
  private directWss: WebSocketServer | null = null;
  private directCandidateBaseUrls: string[] = [];
  private readonly browserToolsRegistrations = new Map<string, BrowserToolsRegistration>();
  private acceptingConnections = true;
  private readonly advertiseDaemonStatusRpc: boolean;
  private readonly advertiseRelayConfig: boolean;

  // oxlint-disable-next-line complexity
  constructor(
    server: HTTPServer,
    logger: pino.Logger,
    serverId: string,
    agentManager: AgentManager,
    agentStorage: AgentStorage,
    downloadTokenStore: DownloadTokenStore,
    paseoHome: string,
    daemonConfigStore: DaemonConfigStore,
    mcpBaseUrl: string | null,
    wsConfig: WebSocketServerConfig,
    workspaceAutoName: WorkspaceAutoName,
    auth?: DaemonAuthConfig,
    speech?: SpeechService | null,
    terminalManager?: TerminalManager | null,
    dictation?: {
      finalTimeoutMs?: number;
    },
    daemonVersion?: string,
    onLifecycleIntent?: (intent: SessionLifecycleIntent) => void,
    projectRegistry?: ProjectRegistry,
    workspaceRegistry?: WorkspaceRegistry,
    scheduleService?: ScheduleService,
    checkoutDiffManager?: CheckoutDiffManager,
    serviceProxy?: ServiceProxySubsystem | null,
    scriptRuntimeStore?: WorkspaceScriptRuntimeStore | null,
    onBranchChanged?: (
      workspaceId: string,
      oldBranch: string | null,
      newBranch: string | null,
    ) => void,
    getDaemonTcpPort?: () => number | null,
    getDaemonTcpHost?: () => string | null,
    resolveScriptHealth?: (hostname: string) => ScriptHealthState | null,
    workspaceGitService?: WorkspaceGitService,
    github?: ForgeService,
    pushNotificationSender?: PushNotificationSender,
    providerSnapshotManager?: ProviderSnapshotManager,
    daemonRuntimeConfig?: DaemonRuntimeConfig,
    serviceProxyPublicBaseUrl?: string | null,
    browserToolsBroker?: BrowserToolsBroker | null,
    hubRelationships?: HubRelationshipManagement | null,
    larkChannelService?: LarkChannelService | null,
    assistantStore?: AssistantStore | null,
    teamStore?: TeamStore | null,
    mcpStore?: McpStore | null,
    skillStore?: SkillStore | null,
    pluginService?: PluginService | null,
    daemonKeyPair?: KeyPair,
    workflowService?: WorkflowService | null,
    loopService?: LoopService | null,
    memoryService?: PaseoMemoryService | null,
    workspaceSetupRuntime: WorkspaceSetupRuntime = new WorkspaceSetupRuntime(),
  ) {
    this.logger = logger.child({ module: "websocket-server" });
    this.workspaceSetupRuntime = workspaceSetupRuntime;
    this.advertiseDaemonStatusRpc = wsConfig.daemonStatusRpc !== false;
    this.advertiseRelayConfig = wsConfig.relayConfig !== false;
    this.serverId = serverId;
    if (typeof daemonVersion !== "string" || daemonVersion.trim().length === 0) {
      throw new MissingDaemonVersionError();
    }
    this.daemonVersion = daemonVersion.trim();
    this.daemonRuntimeConfig = daemonRuntimeConfig;
    this.browserToolsBroker = browserToolsBroker ?? null;
    this.hubRelationships = hubRelationships ?? null;
    this.larkChannelService = larkChannelService ?? null;
    this.assistantStore = assistantStore ?? null;
    this.memoryService = memoryService ?? null;
    this.teamStore = teamStore ?? null;
    this.mcpStore = mcpStore ?? null;
    this.skillStore = skillStore ?? null;
    this.pluginService = pluginService ?? null;
    this.workflowService = workflowService ?? null;
    this.loopService = loopService ?? null;
    this.daemonKeyPair = daemonKeyPair ?? null;
    this.agentManager = agentManager;
    this.agentStorage = agentStorage;
    this.projectRegistry = projectRegistry ?? createNoopProjectRegistry();
    this.workspaceRegistry = workspaceRegistry ?? createNoopWorkspaceRegistry();
    const requiredServices = requireWebSocketServices({
      scheduleService,
      checkoutDiffManager,
    });
    this.scheduleService = requiredServices.scheduleService;
    this.checkoutDiffManager = requiredServices.checkoutDiffManager;
    this.github = github ?? createGitHubService();
    this.workspaceGitService = workspaceGitService ?? createFallbackWorkspaceGitService();
    this.workspaceAutoName = workspaceAutoName;
    this.downloadTokenStore = downloadTokenStore;
    this.paseoHome = paseoHome;
    this.clientAccessStore = new ClientAccessStore(
      this.logger,
      join(paseoHome, "client-access.json"),
    );
    this.worktreesRoot = daemonRuntimeConfig?.worktreesRoot;
    this.daemonConfigStore = daemonConfigStore;
    this.mcpBaseUrl = mcpBaseUrl;
    this.assignOptionalServices({
      speech,
      terminalManager,
      dictation,
      onLifecycleIntent,
      serviceProxy,
      scriptRuntimeStore,
      onBranchChanged,
      getDaemonTcpPort,
      getDaemonTcpHost,
      serviceProxyPublicBaseUrl,
      resolveScriptHealth,
    });
    if (!providerSnapshotManager) {
      throw new Error("providerSnapshotManager is required");
    }
    this.providerSnapshotManager = providerSnapshotManager;
    this.serverCapabilities = buildServerCapabilities({
      readiness: this.speech?.getReadiness() ?? null,
    });
    this.unsubscribeSpeechReadiness =
      this.speech?.onReadinessChange((snapshot) => {
        this.publishSpeechReadiness(snapshot);
      }) ?? null;
    this.unsubscribeDaemonConfigChange = this.daemonConfigStore.onChange((config, details) => {
      const nextAgentManagerState = this.providerSnapshotManager.applyMutableProviderConfig(
        config.providers,
        { removeProviders: details.removedProviders },
      );
      this.agentManager.updateProviderRegistry(nextAgentManagerState);
      if (!config.clientAccess.requireApproval) {
        this.acceptPendingClientAdmissions();
      }
      this.broadcastDaemonConfigChanged(config);
    });

    const pushLogger = this.logger.child({ module: "push" });
    this.pushNotifications = createPushNotifications({
      logger: pushLogger,
      filePath: join(paseoHome, "push-tokens.json"),
    });
    this.pushNotificationSender = pushNotificationSender ?? this.pushNotifications;

    this.agentManager.setAgentAttentionCallback((params) => {
      void this.broadcastAgentAttention(params).catch((err) => {
        this.logger.warn({ err, agentId: params.agentId }, "Failed to broadcast agent attention");
      });
    });

    this.providerUsageService = new ProviderUsageService({
      logger: this.logger,
    });

    this.wss = this.createWebSocketServer(server, wsConfig, auth);
    this.startRuntimeMetricsInterval();
    this.startApplicationSocketLeaseInterval();

    this.logger.info("WebSocket server initialized on /ws");
  }

  public async startLanDirectListener(): Promise<void> {
    if (this.directHttpServer || !this.daemonKeyPair) {
      return;
    }

    const httpServer = createHttpServer((_request, response) => {
      response.statusCode = 404;
      response.end("Not found");
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          httpServer.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          httpServer.off("error", onError);
          resolve();
        };
        httpServer.once("error", onError);
        httpServer.once("listening", onListening);
        httpServer.listen(0, "0.0.0.0");
      });
    } catch (error) {
      httpServer.close();
      this.logger.warn({ err: error }, "Failed to start LAN direct listener");
      return;
    }

    const boundAddress = httpServer.address();
    if (!boundAddress || typeof boundAddress === "string") {
      httpServer.close();
      return;
    }

    const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
    wss.on("connection", (socket, request) => {
      void this.attachLanDirectSocket(socket, request);
    });
    this.directHttpServer = httpServer;
    this.directWss = wss;
    this.directCandidateBaseUrls = listLanIpv4Addresses().map(
      (host) => `ws://${host}:${boundAddress.port}/ws`,
    );
    this.logger.info(
      {
        port: boundAddress.port,
        candidateCount: this.directCandidateBaseUrls.length,
      },
      "LAN E2EE direct listener started",
    );
  }

  private async attachLanDirectSocket(socket: WebSocket, request: IncomingMessage): Promise<void> {
    const token = readDirectUpgradeToken(request);
    const grant = token ? this.consumeDirectUpgradeToken(token) : null;
    if (!grant || !this.daemonKeyPair) {
      socket.close(WS_CLOSE_DIRECT_UPGRADE_DENIED, "Direct upgrade denied");
      return;
    }

    try {
      const encryptedSocket = await wrapDaemonEncryptedWebSocket(
        socket,
        this.daemonKeyPair,
        this.logger.child({ module: "lan-direct", clientId: grant.clientId }),
      );
      await this.attachSocket(encryptedSocket, request, {
        transport: "direct_e2ee",
        directUpgradeClientId: grant.clientId,
      });
    } catch (error) {
      this.logger.warn(
        { err: error, clientId: grant.clientId },
        "LAN direct E2EE handshake failed",
      );
      try {
        socket.close(1011, "E2EE handshake failed");
      } catch {
        // ignore
      }
    }
  }

  private consumeDirectUpgradeToken(
    token: string,
  ): { clientId: string; expiresAtMs: number } | null {
    const grant = this.directUpgradeTokens.get(token);
    this.directUpgradeTokens.delete(token);
    if (!grant || grant.expiresAtMs <= Date.now()) {
      return null;
    }
    return grant;
  }

  private sendDirectConnectionOffer(
    ws: WebSocketLike,
    identity: WebSocketConnectionIdentity,
    clientId: string,
  ): void {
    if (identity.transport !== "relay" || this.directCandidateBaseUrls.length === 0) {
      return;
    }
    const now = Date.now();
    for (const [token, grant] of this.directUpgradeTokens) {
      if (grant.expiresAtMs <= now || grant.clientId === clientId) {
        this.directUpgradeTokens.delete(token);
      }
    }
    const token = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
    const expiresAtMs = now + DIRECT_UPGRADE_TOKEN_TTL_MS;
    this.directUpgradeTokens.set(token, { clientId, expiresAtMs });
    this.sendToClient(ws, {
      type: "transport.direct_offer",
      candidates: this.directCandidateBaseUrls.map((baseUrl) => {
        const url = new URL(baseUrl);
        url.searchParams.set("directToken", token);
        return url.toString();
      }),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  }

  private assignOptionalServices(params: {
    speech: SpeechService | null | undefined;
    terminalManager: TerminalManager | null | undefined;
    dictation: { finalTimeoutMs?: number } | undefined;
    onLifecycleIntent: ((intent: SessionLifecycleIntent) => void) | undefined;
    serviceProxy: ServiceProxySubsystem | null | undefined;
    scriptRuntimeStore: WorkspaceScriptRuntimeStore | null | undefined;
    onBranchChanged:
      | ((workspaceId: string, oldBranch: string | null, newBranch: string | null) => void)
      | undefined;
    getDaemonTcpPort: (() => number | null) | undefined;
    getDaemonTcpHost: (() => string | null) | undefined;
    serviceProxyPublicBaseUrl: string | null | undefined;
    resolveScriptHealth: ((hostname: string) => ScriptHealthState | null) | undefined;
  }): void {
    this.speech = params.speech ?? null;
    this.terminalManager = params.terminalManager ?? null;
    if (this.terminalManager) {
      this.unsubscribeTerminalActivity = this.terminalManager.subscribeTerminalActivity((event) => {
        const reason = resolveTerminalAttentionReason({
          attentionReason: event.activity?.attentionReason,
          previousState: event.previous?.state ?? null,
          state: event.activity?.state ?? null,
        });
        if (!reason) {
          return;
        }
        void this.broadcastTerminalAttention({
          terminalId: event.terminalId,
          cwd: event.cwd,
          ...(event.workspaceId ? { workspaceId: event.workspaceId } : {}),
          terminalName: event.name,
          reason,
        }).catch((err) => {
          this.logger.warn(
            { err, terminalId: event.terminalId },
            "Failed to broadcast terminal attention",
          );
        });
      });
    }
    this.dictation = params.dictation ?? null;
    this.onLifecycleIntent = params.onLifecycleIntent ?? null;
    this.serviceProxy = params.serviceProxy ?? null;
    this.scriptRuntimeStore = params.scriptRuntimeStore ?? null;
    this.onBranchChanged = params.onBranchChanged ?? null;
    this.getDaemonTcpPort = params.getDaemonTcpPort ?? null;
    this.getDaemonTcpHost = params.getDaemonTcpHost ?? null;
    this.serviceProxyPublicBaseUrl = params.serviceProxyPublicBaseUrl ?? null;
    this.resolveScriptHealth = params.resolveScriptHealth ?? null;
  }

  private createWebSocketServer(
    server: HTTPServer,
    wsConfig: WebSocketServerConfig,
    auth: DaemonAuthConfig | undefined,
  ): WebSocketServer {
    const { allowedOrigins, hostnames } = wsConfig;
    const password = auth?.password;
    const wss = new WebSocketServer({
      server,
      path: "/ws",
      handleProtocols: (protocols) => selectWebSocketProtocol(protocols, password),
      verifyClient: ({ req }, callback) => {
        this.verifyWsUpgrade(req, allowedOrigins, hostnames, callback);
      },
    });
    wss.on("connection", (ws, request) => {
      void this.attachAuthenticatedSocket(ws, request, password);
    });
    return wss;
  }

  private startRuntimeMetricsInterval(): void {
    this.eventLoopDelayMonitor = monitorEventLoopDelay({ resolution: 10 });
    this.eventLoopDelayMonitor.enable();
    const runtimeMetricsInterval = setInterval(() => {
      this.flushRuntimeMetrics();
    }, WS_RUNTIME_METRICS_FLUSH_MS);
    this.runtimeMetricsInterval = runtimeMetricsInterval;
    (runtimeMetricsInterval as unknown as { unref?: () => void }).unref?.();
  }

  private startApplicationSocketLeaseInterval(): void {
    const interval = setInterval(() => {
      for (const ws of this.applicationSocketLease.listExpired()) {
        this.closePhysicalSocket({
          ws,
          logMessage: "Closing physical WebSocket with expired application lease",
        });
      }
    }, APPLICATION_SOCKET_LEASE_CHECK_INTERVAL_MS);
    this.applicationSocketLeaseInterval = interval;
    (interval as unknown as { unref?: () => void }).unref?.();
  }

  // Main-loop stall visibility: terminal frames and agent traffic share one event
  // loop, so delay percentiles here are the ground truth for "the daemon is busy".
  private snapshotEventLoopDelay(): {
    p50Ms: number;
    p99Ms: number;
    maxMs: number;
  } | null {
    const monitor = this.eventLoopDelayMonitor;
    if (!monitor) {
      return null;
    }
    const toMs = (nanoseconds: number): number => Math.round(nanoseconds / 1e5) / 10;
    const snapshot = {
      p50Ms: toMs(monitor.percentile(50)),
      p99Ms: toMs(monitor.percentile(99)),
      maxMs: toMs(monitor.max),
    };
    monitor.reset();
    return snapshot;
  }

  private verifyWsUpgrade(
    req: IncomingMessage,
    allowedOrigins: Set<string>,
    hostnames: HostnamesConfig | undefined,
    callback: (res: boolean, code?: number, message?: string) => void,
  ): void {
    if (!this.acceptingConnections) {
      callback(false, 503, "Server shutting down");
      return;
    }

    const requestMetadata = extractSocketRequestMetadata(req);
    const origin = requestMetadata.origin;
    const requestHost = requestMetadata.host ?? null;
    if (requestHost && !isHostnameAllowed(requestHost, hostnames)) {
      this.incrementRuntimeCounter("hostRejected");
      this.logger.warn(
        { ...requestMetadata, host: requestHost },
        "Rejected connection from disallowed host",
      );
      callback(false, 403, "Host not allowed");
      return;
    }
    const sameOrigin = isWebSocketSameOrigin(origin, requestHost);

    if (!origin || allowedOrigins.has("*") || allowedOrigins.has(origin) || sameOrigin) {
      callback(true);
    } else {
      this.incrementRuntimeCounter("originRejected");
      this.logger.warn({ ...requestMetadata, origin }, "Rejected connection from origin");
      callback(false, 403, "Origin not allowed");
    }
  }

  private async attachAuthenticatedSocket(
    ws: WebSocket,
    request: IncomingMessage,
    password: string | undefined,
  ): Promise<void> {
    if (password) {
      const requestMetadata = extractSocketRequestMetadata(request);
      const protocol = extractWsBearerProtocol(request.headers["sec-websocket-protocol"]);
      const token = extractWsBearerToken(protocol);
      const isAuthorized = isBearerTokenValid({ password, token });
      if (!isAuthorized) {
        const reason = token === null ? "Password required" : "Incorrect password";
        this.logger.warn(
          { ...requestMetadata, hasToken: token !== null },
          "Rejected WebSocket connection with invalid daemon password",
        );
        ws.close(WS_CLOSE_DAEMON_AUTH_FAILED, reason);
        return;
      }
    }

    await this.attachSocket(ws, request);
  }

  public broadcast(message: WSOutboundMessage): void {
    const trustedSockets = [...this.sessions]
      .filter(([, connection]) => connection.kind === "trusted")
      .map(([ws]) => ws);
    this.sendMessageToSockets(trustedSockets, message);
  }

  public listTrustedSessions(): Session[] {
    return Array.from(
      new Set(
        [...this.sessions.values(), ...this.externalSessionsByKey.values()]
          .filter(
            (connection): connection is TrustedSessionConnection => connection.kind === "trusted",
          )
          .map((connection) => connection.session),
      ),
    );
  }

  public publishProjectUpdate(update: ProjectUpdate): void {
    for (const session of this.listTrustedSessions()) session.emitProjectUpdate(update);
  }

  public publishSpeechReadiness(readiness: SpeechReadinessSnapshot | null): void {
    this.updateServerCapabilities(buildServerCapabilities({ readiness }));
  }

  public updateServerCapabilities(capabilities: ServerCapabilities | null | undefined): void {
    const next = capabilities ?? undefined;
    if (areServerCapabilitiesEqual(this.serverCapabilities, next)) {
      return;
    }
    this.serverCapabilities = next;
    this.broadcastCapabilitiesUpdate();
  }

  public async attachExternalSocket(
    ws: WebSocketLike,
    metadata?: ExternalSocketMetadata,
  ): Promise<void> {
    if (metadata?.transport === "relay") {
      this.incrementRuntimeCounter("relayExternalSocketAttached");
    }
    await this.attachSocket(ws, undefined, metadata);
  }

  public async attachHubSocket(
    ws: WebSocketLike,
    options: {
      daemonId: string;
      scopes: readonly string[];
      agents: HubExecutionAgents;
    },
  ): Promise<void> {
    if (!this.acceptingConnections) {
      ws.close(WS_CLOSE_SERVER_SHUTDOWN, "Server shutting down");
      return;
    }

    const connectionLogger = this.logger.child({
      connectionKind: "hub",
      daemonId: options.daemonId,
    });
    const session = this.createSocketSession({
      clientId: `hub:${options.daemonId}`,
      appVersion: null,
      clientCapabilities: null,
      scopes: options.scopes,
      connectionLogger,
      onMessage: (message) => this.sendToClient(ws, wrapSessionMessage(message)),
      hubExecutionAgents: options.agents,
    });
    const connection: HubConnection = {
      kind: "hub",
      session,
      daemonId: options.daemonId,
      connectionLogger,
      socket: ws,
    };
    this.sessions.set(ws, connection);
    this.bindSocketHandlers(ws);
    connectionLogger.info("Hub session attached");
  }

  public prepareForShutdown(): void {
    this.acceptingConnections = false;
  }

  public async close(): Promise<void> {
    this.prepareForShutdown();
    this.unsubscribeSpeechReadiness?.();
    this.unsubscribeSpeechReadiness = null;
    this.unsubscribeDaemonConfigChange?.();
    this.unsubscribeDaemonConfigChange = null;
    this.unsubscribeTerminalActivity?.();
    this.unsubscribeTerminalActivity = null;
    if (this.runtimeMetricsInterval) {
      clearInterval(this.runtimeMetricsInterval);
      this.runtimeMetricsInterval = null;
    }
    if (this.applicationSocketLeaseInterval) {
      clearInterval(this.applicationSocketLeaseInterval);
      this.applicationSocketLeaseInterval = null;
    }
    this.applicationSocketLease.clear();
    this.flushRuntimeMetrics({ final: true });
    this.eventLoopDelayMonitor?.disable();
    this.eventLoopDelayMonitor = null;

    const uniqueConnections = new Set<SessionConnection>([
      ...this.sessions.values(),
      ...this.externalSessionsByKey.values(),
    ]);

    const pendingSockets = new Set<WebSocketLike>([
      ...this.pendingConnections.keys(),
      ...this.pendingClientAdmissions.keys(),
    ]);
    for (const pending of this.pendingConnections.values()) {
      if (pending.helloTimeout) {
        clearTimeout(pending.helloTimeout);
        pending.helloTimeout = null;
      }
    }

    const cleanupPromises: Promise<void>[] = [];
    for (const connection of uniqueConnections) {
      if (connection.kind === "trusted" && connection.externalDisconnectCleanupTimeout) {
        clearTimeout(connection.externalDisconnectCleanupTimeout);
        connection.externalDisconnectCleanupTimeout = null;
      }

      cleanupPromises.push(Promise.resolve(connection.session.cleanup()));
      const sockets = connection.kind === "trusted" ? connection.sockets : [connection.socket];
      for (const ws of sockets) {
        cleanupPromises.push(
          new Promise<void>((resolve) => {
            // WebSocket.CLOSED = 3
            if (ws.readyState === 3) {
              resolve();
              return;
            }
            ws.once("close", () => resolve());
            ws.close();
          }),
        );
      }
    }

    for (const ws of pendingSockets) {
      cleanupPromises.push(
        new Promise<void>((resolve) => {
          if (ws.readyState === 3) {
            resolve();
            return;
          }
          ws.once("close", () => resolve());
          ws.close();
        }),
      );
    }

    await Promise.all(cleanupPromises);
    this.providerSnapshotManager.destroy();
    this.checkoutDiffManager.dispose();
    await this.workspaceGitService.dispose();
    this.pendingConnections.clear();
    this.pendingClientAdmissions.clear();
    this.sessions.clear();
    this.socketIdentities.clear();
    this.externalSessionsByKey.clear();
    this.directUpgradeTokens.clear();
    for (const clientId of this.browserToolsRegistrations.keys()) {
      this.unregisterBrowserToolsClient(clientId);
    }
    this.wss.close();
    const directWss = this.directWss;
    this.directWss = null;
    if (directWss) {
      await new Promise<void>((resolve) => directWss.close(() => resolve()));
    }
    const directHttpServer = this.directHttpServer;
    this.directHttpServer = null;
    if (directHttpServer) {
      directHttpServer.closeAllConnections();
      await new Promise<void>((resolve) => directHttpServer.close(() => resolve()));
    }
    this.directCandidateBaseUrls = [];
  }

  private sendToClient(ws: WebSocketLike, message: WSOutboundMessage): void {
    this.sendMessageToSockets([ws], message);
  }

  private sendMessageToSockets(sockets: Iterable<WebSocketLike>, message: WSOutboundMessage): void {
    const writableSockets = [...sockets].filter((ws) => this.ensureOutboundCapacity(ws, 0));
    if (writableSockets.length === 0) {
      return;
    }

    let payload: string;
    try {
      payload = JSON.stringify(message);
    } catch (err) {
      this.logger.warn({ err }, "ws_serialize_failed");
      return;
    }

    const payloadBytes = outboundFrameByteLength(payload);
    for (const ws of writableSockets) {
      this.sendFrameToClient(ws, payload, payloadBytes, () => {
        this.runtimeMetrics.recordOutboundMessage(message, ws.bufferedAmount);
      });
    }
  }

  private sendBinaryToClient(ws: WebSocketLike, frame: Uint8Array): void {
    this.sendFrameToClient(ws, frame, outboundFrameByteLength(frame), () => {
      this.runtimeMetrics.recordOutboundBinaryFrame(ws.bufferedAmount);
    });
  }

  private async sendBinaryToClientAndWait(ws: WebSocketLike, frame: Uint8Array): Promise<void> {
    try {
      const sent = await sendBoundedPhysicalFrameAndWait({
        socket: ws,
        frame,
        onHighWater: () => this.closeAtOutboundHighWater(ws),
      });
      if (!sent) {
        throw new Error("Physical WebSocket is not open");
      }
      this.runtimeMetrics.recordOutboundBinaryFrame(ws.bufferedAmount);
    } catch (err) {
      this.logger.warn({ err }, "ws_send_failed");
      throw err;
    }
  }

  private sendFrameToClient(
    ws: WebSocketLike,
    frame: string | Uint8Array,
    frameBytes: number,
    recordSent: () => void,
  ): void {
    try {
      const sent = sendBoundedPhysicalFrame({
        socket: ws,
        frame,
        frameBytes,
        onHighWater: () => this.closeAtOutboundHighWater(ws),
      });
      if (sent) recordSent();
    } catch (err) {
      this.logger.warn({ err }, "ws_send_failed");
    }
  }

  private ensureOutboundCapacity(ws: WebSocketLike, frameBytes: number): boolean {
    if (ws.readyState !== 1) return false;
    if (physicalSocketHasCapacity(ws, frameBytes)) return true;

    this.closeAtOutboundHighWater(ws);
    return false;
  }

  private closeAtOutboundHighWater(ws: WebSocketLike): void {
    this.closePhysicalSocket({
      ws,
      logMessage: "Closing physical WebSocket at outbound high-water mark",
      logFields: {
        bufferedAmount: ws.bufferedAmount,
        maxBufferedBytes: MAX_PHYSICAL_SOCKET_BUFFERED_BYTES,
      },
    });
  }

  private closePhysicalSocket(params: ClosePhysicalSocketParams): void {
    const { ws, logMessage, logFields } = params;
    this.applicationSocketLease.release(ws);
    if (ws.readyState !== 1) {
      return;
    }
    const identity = this.socketIdentities.get(ws);
    this.logger.warn(
      {
        ...(identity ? toConnectionLogFields(identity) : {}),
        ...logFields,
      },
      logMessage,
    );
    try {
      // A close frame queues behind application data, so it cannot enforce a
      // hard memory cutoff. Production transports expose terminate().
      if (ws.terminate) {
        ws.terminate();
      } else {
        ws.close();
      }
    } catch (err) {
      this.logger.warn(
        { err, ...(identity ? toConnectionLogFields(identity) : {}) },
        "ws_close_failed",
      );
    }
  }

  private sendToConnection(connection: SessionConnection, message: WSOutboundMessage): void {
    const sockets = connection.kind === "trusted" ? connection.sockets : [connection.socket];
    this.sendMessageToSockets(sockets, message);
  }

  private sendBinaryToConnection(connection: SessionConnection, frame: Uint8Array): void {
    if (connection.kind !== "trusted") {
      return;
    }
    for (const ws of connection.sockets) {
      this.sendBinaryToClient(ws, frame);
    }
  }

  private async attachSocket(
    ws: WebSocketLike,
    request?: unknown,
    metadata?: ExternalSocketMetadata,
  ): Promise<void> {
    if (!this.acceptingConnections) {
      try {
        ws.close(WS_CLOSE_SERVER_SHUTDOWN, "Server shutting down");
      } catch {
        // ignore close errors
      }
      return;
    }

    const requestMetadata = extractSocketRequestMetadata(request);
    const identity = createWebSocketConnectionIdentity(requestMetadata, metadata);
    this.socketIdentities.set(ws, identity);
    const connectionLogger = this.logger.child(toConnectionLogFields(identity));

    const pending: PendingConnection = {
      connectionLogger,
      helloTimeout: null,
      identity,
    };
    const timeout = setTimeout(() => {
      if (this.pendingConnections.get(ws) !== pending) {
        return;
      }
      pending.helloTimeout = null;
      this.pendingConnections.delete(ws);
      pending.connectionLogger.warn(
        { ...toConnectionLogFields(identity), timeoutMs: HELLO_TIMEOUT_MS },
        "Closing connection due to missing hello",
      );
      try {
        ws.close(WS_CLOSE_HELLO_TIMEOUT, "Hello timeout");
      } catch {
        // ignore close errors
      }
    }, HELLO_TIMEOUT_MS);
    pending.helloTimeout = timeout;
    (timeout as unknown as { unref?: () => void }).unref?.();

    this.pendingConnections.set(ws, pending);
    this.incrementRuntimeCounter("connectedAwaitingHello");
    this.bindSocketHandlers(ws);

    pending.connectionLogger.info(
      {
        ...toConnectionLogFields(identity),
        totalPendingConnections: this.pendingConnections.size,
      },
      "Client connected; awaiting hello",
    );
  }

  private createSessionConnection(params: {
    ws: WebSocketLike;
    clientId: string;
    appVersion: string | null;
    clientCapabilities: Record<string, unknown> | null;
    connectionLogger: pino.Logger;
  }): TrustedSessionConnection {
    const { ws, clientId, appVersion, clientCapabilities, connectionLogger } = params;
    let connection: TrustedSessionConnection | null = null;

    const session = this.createSocketSession({
      clientId,
      appVersion,
      clientCapabilities,
      scopes: ["*"],
      connectionLogger,
      onMessage: (msg) => {
        if (!connection) {
          return;
        }
        this.sendToConnection(connection, wrapSessionMessage(msg));
      },
      onMessageToSource: (source, msg) => {
        if (!connection || !connection.sockets.has(source as WebSocketLike)) {
          return;
        }
        this.sendToClient(source as WebSocketLike, wrapSessionMessage(msg));
      },
      onBinaryMessage: (frame) => {
        if (!connection) {
          return;
        }
        this.sendBinaryToConnection(connection, frame);
      },
      onBinaryMessageToSource: async (source, frame) => {
        if (!connection || !connection.sockets.has(source as WebSocketLike)) {
          throw new Error("File transfer source socket is no longer attached");
        }
        await this.sendBinaryToClientAndWait(source as WebSocketLike, frame);
      },
      getTransportBufferedAmount: () => {
        if (!connection) {
          return null;
        }
        // Relay-attached sockets are a WebSocketLike that doesn't expose
        // bufferedAmount. Return null when no socket gives a signal so the
        // terminal fallback can't mistake "no signal" for "client keeping up";
        // a direct ws reports its real buffered bytes (0 when drained).
        let maxBuffered: number | null = null;
        for (const socket of connection.sockets) {
          if (typeof socket.bufferedAmount === "number") {
            maxBuffered = Math.max(maxBuffered ?? 0, socket.bufferedAmount);
          }
        }
        return maxBuffered;
      },
      onLifecycleIntent: (intent) => {
        this.onLifecycleIntent?.(intent);
      },
      hubRelationships: this.hubRelationships ?? undefined,
    });

    connection = {
      kind: "trusted",
      session,
      clientId,
      appVersion,
      clientCapabilities,
      connectionLogger,
      sockets: new Set([ws]),
      externalDisconnectCleanupTimeout: null,
    };
    session.updateClientCapabilities(clientCapabilities, ws);
    return connection;
  }

  private createSocketSession(options: SocketSessionOptions): Session {
    return new Session({
      clientId: options.clientId,
      appVersion: options.appVersion,
      clientCapabilities: options.clientCapabilities,
      scopes: options.scopes,
      onMessage: options.onMessage,
      onMessageToSource: options.onMessageToSource,
      onBinaryMessage: options.onBinaryMessage,
      onBinaryMessageToSource: options.onBinaryMessageToSource,
      getTransportBufferedAmount: options.getTransportBufferedAmount,
      onLifecycleIntent: options.onLifecycleIntent,
      logger: options.connectionLogger.child({ module: "session" }),
      onWorkspaceRecovered: async (workspace) => {
        await Promise.all(
          this.listTrustedSessions().map((activeSession) =>
            activeSession.refreshRecoveredWorkspaceForExternalMutation(workspace),
          ),
        );
      },
      downloadTokenStore: this.downloadTokenStore,
      pushNotifications: this.pushNotifications,
      paseoHome: this.paseoHome,
      worktreesRoot: this.worktreesRoot,
      agentManager: this.agentManager,
      agentStorage: this.agentStorage,
      projectRegistry: this.projectRegistry,
      workspaceRegistry: this.workspaceRegistry,
      scheduleService: this.scheduleService,
      workflowService: this.workflowService,
      loopService: this.loopService ?? undefined,
      checkoutDiffManager: this.checkoutDiffManager,
      github: this.github,
      workspaceGitService: this.workspaceGitService,
      workspaceAutoName: this.workspaceAutoName,
      daemonConfigStore: this.daemonConfigStore,
      mcpBaseUrl: this.mcpBaseUrl,
      stt: () => this.speech?.resolveStt() ?? null,
      sttLanguage: this.speech?.resolveSttLanguage() ?? "en",
      tts: () => this.speech?.resolveTts() ?? null,
      terminalManager: this.terminalManager,
      providerSnapshotManager: this.providerSnapshotManager,
      providerUsageService: this.providerUsageService,
      hubExecutionAgents: options.hubExecutionAgents,
      hubRelationships: options.hubRelationships,
      serviceProxy: this.serviceProxy ?? undefined,
      scriptRuntimeStore: this.scriptRuntimeStore ?? undefined,
      workspaceSetupSnapshots: this.workspaceSetupSnapshots,
      workspaceSetupRuntime: this.workspaceSetupRuntime,
      onBranchChanged: this.onBranchChanged ?? undefined,
      getDaemonTcpPort: this.getDaemonTcpPort ?? undefined,
      getDaemonTcpHost: this.getDaemonTcpHost ?? undefined,
      serviceProxyPublicBaseUrl: this.serviceProxyPublicBaseUrl,
      resolveScriptHealth: this.resolveScriptHealth ?? undefined,
      voice: {
        turnDetection: () => this.speech?.resolveTurnDetection() ?? null,
      },
      voiceBridge: {
        registerVoiceSpeakHandler: (agentId, handler) => {
          this.voiceSpeakHandlers.set(agentId, handler);
        },
        unregisterVoiceSpeakHandler: (agentId) => {
          this.voiceSpeakHandlers.delete(agentId);
        },
        registerVoiceCallerContext: (agentId, context) => {
          this.voiceCallerContexts.set(agentId, context);
        },
        unregisterVoiceCallerContext: (agentId) => {
          this.voiceCallerContexts.delete(agentId);
        },
      },
      dictation:
        this.dictation || this.speech
          ? {
              finalTimeoutMs: this.dictation?.finalTimeoutMs,
              stt: () => this.speech?.resolveDictationStt() ?? null,
              sttLanguage: this.speech?.resolveDictationSttLanguage() ?? "en",
              getSpeechReadiness: () => this.speech!.getReadiness(),
            }
          : undefined,
      serverId: this.serverId,
      daemonVersion: this.daemonVersion,
      daemonRuntimeConfig: this.daemonRuntimeConfig,
      getWebSocketRuntimeMetrics: () => this.lastRuntimeMetricsSnapshot,
      larkChannelService: this.larkChannelService,
      assistantStore: this.assistantStore,
      memoryService: this.memoryService,
      teamStore: this.teamStore,
      mcpStore: this.mcpStore,
      skillStore: this.skillStore,
      pluginService: this.pluginService,
    });
  }

  private clearPendingConnection(ws: WebSocketLike): PendingConnection | null {
    const pending = this.pendingConnections.get(ws);
    if (!pending) {
      return null;
    }
    if (pending.helloTimeout) {
      clearTimeout(pending.helloTimeout);
      pending.helloTimeout = null;
    }
    this.pendingConnections.delete(ws);
    return pending;
  }

  // oxlint-disable-next-line complexity
  private handleHello(params: {
    ws: WebSocketLike;
    message: WSHelloMessage;
    pending: PendingConnection;
  }): void {
    const { ws, message, pending } = params;

    if (message.protocolVersion !== WS_PROTOCOL_VERSION) {
      this.clearPendingConnection(ws);
      pending.connectionLogger.warn(
        {
          receivedProtocolVersion: message.protocolVersion,
          expectedProtocolVersion: WS_PROTOCOL_VERSION,
        },
        "Rejected hello due to protocol version mismatch",
      );
      try {
        ws.close(WS_CLOSE_INCOMPATIBLE_PROTOCOL, "Incompatible protocol version");
      } catch {
        // ignore close errors
      }
      return;
    }

    const clientId = message.clientId.trim();
    if (clientId.length === 0) {
      this.clearPendingConnection(ws);
      pending.connectionLogger.warn("Rejected hello with empty clientId");
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Invalid hello");
      } catch {
        // ignore close errors
      }
      return;
    }

    this.clearPendingConnection(ws);
    pending.identity.clientId = clientId;
    if (message.appVersion) {
      pending.identity.appVersion = message.appVersion;
    }

    if (
      pending.identity.directUpgradeClientId &&
      pending.identity.directUpgradeClientId !== clientId
    ) {
      pending.connectionLogger.warn(
        {
          expectedClientId: pending.identity.directUpgradeClientId,
          receivedClientId: clientId,
        },
        "Rejected LAN direct upgrade for mismatched client",
      );
      try {
        ws.close(WS_CLOSE_DIRECT_UPGRADE_DENIED, "Direct upgrade client mismatch");
      } catch {
        // ignore
      }
      return;
    }

    if (
      this.clientAccessStore.isPaused(clientId) ||
      (pending.identity.peer === "external" &&
        this.daemonConfigStore.get().clientAccess.requireApproval &&
        !this.clientAccessStore.isApproved(clientId))
    ) {
      this.pendingClientAdmissions.set(ws, {
        connectionLogger: pending.connectionLogger.child({ clientId }),
        identity: pending.identity,
        hello: { ...message, clientId },
        requestedAt: new Date().toISOString(),
      });
      this.sendClientApprovalRequired(ws);
      pending.connectionLogger.info(
        { ...toConnectionLogFields(pending.identity) },
        "Client connection waiting for approval",
      );
      return;
    }

    const approvedClient = this.clientAccessStore.get(clientId);
    if (pending.identity.peer === "external" && approvedClient && !approvedClient.paused) {
      this.clientAccessStore.approve(
        {
          clientId,
          clientName: message.clientName ?? approvedClient.clientName,
          clientHostname:
            resolveClientHostname(message.clientHostname, pending.identity.remoteAddress) ??
            approvedClient.clientHostname,
          clientType: message.clientType,
          appVersion: message.appVersion ?? null,
          remoteAddress: pending.identity.remoteAddress ?? approvedClient.remoteAddress,
          remotePort: pending.identity.remotePort ?? approvedClient.remotePort,
          transport: pending.identity.transport,
          peer: pending.identity.peer,
          requestedAt: approvedClient.requestedAt,
        },
        approvedClient.approvedAt,
      );
    }

    this.acceptApprovedHello({
      ws,
      message: { ...message, clientId },
      identity: pending.identity,
      connectionLogger: pending.connectionLogger,
    });
  }

  private acceptApprovedHello(params: {
    ws: WebSocketLike;
    message: WSHelloMessage;
    identity: WebSocketConnectionIdentity;
    connectionLogger: pino.Logger;
  }): void {
    const { ws, message, identity, connectionLogger: baseLogger } = params;
    const clientId = message.clientId.trim();
    if (!this.clientAccessHistoryIds.has(ws)) {
      this.clientAccessHistoryIds.set(
        ws,
        this.clientAccessStore.startConnection({
          clientId,
          clientName: message.clientName ?? null,
          clientHostname: resolveClientHostname(message.clientHostname, identity.remoteAddress),
          clientType: message.clientType,
          appVersion: message.appVersion ?? null,
          remoteAddress: identity.remoteAddress ?? null,
          remotePort: identity.remotePort ?? null,
          transport: identity.transport,
          peer: identity.peer,
        }),
      );
    }
    if (this.clientAccessStore.get(clientId)) {
      this.implicitlyAllowedClientAccess.delete(clientId);
      this.clientAccessStore.markConnected(clientId);
    } else {
      this.recordImplicitlyAllowedClientAccess(message, identity);
    }
    const existing = this.externalSessionsByKey.get(clientId);
    if (existing) {
      this.incrementRuntimeCounter("helloResumed");
      if (existing.externalDisconnectCleanupTimeout) {
        clearTimeout(existing.externalDisconnectCleanupTimeout);
        existing.externalDisconnectCleanupTimeout = null;
      }
      const newAppVersion = message.appVersion ?? null;
      if (newAppVersion && newAppVersion !== existing.appVersion) {
        existing.appVersion = newAppVersion;
        existing.session.updateAppVersion(newAppVersion);
      }
      const newClientCapabilities = message.capabilities ?? null;
      // COMPAT(selectiveAgentTimeline): added in v0.1.106. Every capable resumed
      // hello resets membership before server_info so stale retained-session
      // state cannot leak. Remove after 2027-01-12.
      existing.session.updateClientCapabilities(newClientCapabilities, ws);
      if (
        JSON.stringify(existing.clientCapabilities ?? null) !==
        JSON.stringify(newClientCapabilities ?? null)
      ) {
        existing.clientCapabilities = newClientCapabilities;
        this.syncBrowserToolsClientRegistration(existing);
      }
      existing.sockets.add(ws);
      this.sessions.set(ws, existing);
      identity.sessionId = existing.session.getSessionId();
      this.syncBrowserToolsClientRegistration(existing);
      this.sendToClient(ws, this.createServerInfoMessage());
      this.sendDirectConnectionOffer(ws, identity, clientId);
      baseLogger.info(
        {
          ...toConnectionLogFields(identity),
          resumed: true,
          totalSessions: this.sessions.size,
        },
        "Client connected via hello",
      );
      return;
    }

    const connectionLogger = baseLogger.child({ clientId });
    this.incrementRuntimeCounter("helloNew");
    const connection = this.createSessionConnection({
      ws,
      clientId,
      appVersion: message.appVersion ?? null,
      clientCapabilities: message.capabilities ?? null,
      connectionLogger,
    });
    this.sessions.set(ws, connection);
    this.externalSessionsByKey.set(clientId, connection);
    identity.sessionId = connection.session.getSessionId();
    this.syncBrowserToolsClientRegistration(connection);
    this.sendToClient(ws, this.createServerInfoMessage());
    this.sendDirectConnectionOffer(ws, identity, clientId);
    connection.connectionLogger.info(
      {
        ...toConnectionLogFields(identity),
        resumed: false,
        totalSessions: this.sessions.size,
      },
      "Client connected via hello",
    );
  }

  private sendClientApprovalRequired(ws: WebSocketLike): void {
    this.sendToClient(ws, {
      type: "connection.approval_required",
      message: CLIENT_ACCESS_DENIED_MESSAGE,
    });
  }

  private buildServerInfoStatusPayload(): ServerInfoStatusPayload {
    return {
      status: "server_info",
      serverId: this.serverId,
      hostname: getHostname(),
      version: this.daemonVersion,
      // COMPAT(desktopManaged): added in v0.1.X, remove optional parsing after 2027-01-16.
      desktopManaged: this.daemonRuntimeConfig?.desktopManaged === true,
      ...(this.daemonRuntimeConfig?.relayDeviceType
        ? { relayDeviceType: this.daemonRuntimeConfig.relayDeviceType }
        : {}),
      ...(this.serverCapabilities ? { capabilities: this.serverCapabilities } : {}),
      features: {
        // COMPAT(providersSnapshot): keep optional until all clients rely on snapshot flow.
        providersSnapshot: true,
        // COMPAT(providersSnapshotCwd): added in v0.3.2, remove gate after 2027-02-10.
        providersSnapshotCwd: true,
        // COMPAT(checkoutForgeSetAutoMerge): added in v0.1.106, remove old
        // checkoutGithubSetAutoMerge fallback after 2026-12-28.
        checkoutForgeSetAutoMerge: true,
        // COMPAT(checkoutGithubSetAutoMerge): added in v0.1.75, remove gate after 2026-11-13.
        checkoutGithubSetAutoMerge: true,
        githubCheckDetails: true,
        // COMPAT(forgeCheckDetails): added in v0.1.106, remove githubCheckDetails fallback after 2026-12-28.
        forgeCheckDetails: true,
        // COMPAT(forgeSearch): added in v0.1.106, remove github_search fallback after 2026-12-28.
        forgeSearch: true,
        // COMPAT(daemonStatusRpc): added in v0.1.76, remove gate after 2026-11-18.
        ...(this.advertiseDaemonStatusRpc ? { daemonStatusRpc: true } : {}),
        // COMPAT(relayConfig): added in v0.2.6, remove gate after 2027-01-31.
        ...(this.advertiseRelayConfig ? { relayConfig: true } : {}),
        // COMPAT(pushTokenRevocation): added in v0.3.2, remove gate after 2027-02-10.
        pushTokenRevocation: true,
        // COMPAT(terminalRestoreModes): added in v0.1.81, remove gate after 2026-11-23.
        "terminal-restore-modes": true,
        // COMPAT(terminalInputModeReplay): added in v0.2.6, remove gate after 2027-02-02.
        "terminal-input-mode-replay": true,
        // COMPAT(terminalSizeOwnership): added in v0.2.6, remove gate after 2027-02-02.
        "terminal-size-ownership": true,
        // COMPAT(rewind): added in v0.1.X, drop the gate when floor >= v0.1.X.
        rewind: true,
        // COMPAT(agentTimelinePromptIndex): added in v0.2.X, drop the gate when floor >= v0.2.X.
        agentTimelinePromptIndex: true,
        // COMPAT(agentHistorySearch): added in v0.3.0, remove gate after 2027-02-07.
        agentHistorySearch: true,
        // COMPAT(checkoutRefresh): added in v0.1.86, remove gate after 2026-11-29.
        checkoutRefresh: true,
        // COMPAT(workspaceMultiplicity): added in v0.1.97, drop the gate when floor >= v0.1.97
        workspaceMultiplicity: true,
        // COMPAT(projectRemove): added in v0.1.97, drop the gate when floor >= v0.1.97.
        projectRemove: true,
        // COMPAT(projectAdd): added in v0.1.97, drop the gate when floor >= v0.1.97.
        projectAdd: true,
        // COMPAT(projectList): added in v0.2.4, drop the gate when floor >= v0.2.4.
        projectList: true,
        // COMPAT(worktreeRestore): keep through 2027-01-11 for clients older than v0.1.105.
        worktreeRestore: true,
        // COMPAT(workspaceRecovery): added in v0.1.105, remove after 2027-01-11 once daemon floor >= v0.1.105.
        workspaceRecovery: true,
        // COMPAT(workspaceFileEditing): added in v0.2.0, remove after 2027-01-18 once daemon floor >= v0.2.0.
        workspaceFileEditing: true,
        // COMPAT(workspaceScriptManagement): added in v0.1.105, remove gate after 2027-01-10.
        workspaceScriptManagement: true,
        // COMPAT(providerUsageList): added in v0.1.98, drop the gate when daemon floor >= v0.1.98.
        providerUsageList: true,
        // COMPAT(agentDetach): added in v0.1.98, remove gate after 2026-12-19 once daemon floor >= v0.1.98.
        agentDetach: true,
        // COMPAT(agentThinkingUpdate): added in v0.2.4, remove gate after 2027-01-28.
        agentThinkingUpdate: true,
        // COMPAT(daemonDiagnostics): added in v0.1.100, remove gate after 2026-12-25 once daemon floor >= v0.1.100.
        daemonDiagnostics: true,
        // COMPAT(daemonSelfUpdate): added in v0.1.93, remove gate after 2026-12-13.
        daemonSelfUpdate: this.daemonRuntimeConfig?.desktopManaged !== true,
        // COMPAT(agentForkContext): added in v0.1.102, remove gate after 2026-12-28.
        agentForkContext: true,
        // COMPAT(agentForkContextCursor): added in v0.1.108, remove gate after 2027-01-14.
        agentForkContextCursor: true,
        // COMPAT(providerSubagents): added in v0.1.107, remove gate after 2027-01-12.
        providerSubagents: true,
        // COMPAT(workspacePinning): added in v0.1.107, remove gate after 2027-01-12.
        workspacePinning: true,
        // COMPAT(hubRelationship): added in v0.1.X, drop the gate when floor >= v0.1.X.
        hubRelationship: true,
        // COMPAT(projectGithubClone): added in v0.1.108, remove gate after 2027-01-15.
        projectGithubClone: true,
        // COMPAT(workspaceGithubRepositorySearch): added in v0.1.108, remove gate after 2027-01-15.
        workspaceGithubRepositorySearch: true,
        // COMPAT(projectCreateDirectory): added in v0.1.108, remove gate after 2027-01-15.
        projectCreateDirectory: true,
        // COMPAT(projectCreateDirectoryless): added on 2026-08-19.
        projectCreateDirectoryless: true,
        // COMPAT(projectConfigById): added in v0.3.1, remove gate after 2027-02-20.
        projectConfigById: true,
        // COMPAT(commitsList): added in v0.1.110, remove gate after 2027-01-16.
        commitsList: true,
        // COMPAT(commitBaseClassification): added in v0.2.0, remove gate after 2027-01-23.
        commitBaseClassification: true,
        // COMPAT(providerRemoval): added in v0.1.105, drop the gate when floor >= v0.1.105.
        providerRemoval: true,
        // COMPAT(importSessionWorkspaceTarget): added in v0.1.110, remove gate after 2027-01-16.
        importSessionWorkspaceTarget: true,
        // COMPAT(forgeProviders): added in v0.1.106, drop the gate when daemon floor >= v0.1.106.
        forgeProviders: true,
        // COMPAT(selectiveAgentTimeline): added in v0.1.106, remove after 2027-01-12.
        selectiveAgentTimeline: true,
        // COMPAT(canonicalSubmittedPrompts): added in v0.2.6, remove gate after 2027-01-30.
        canonicalSubmittedPrompts: true,
        // COMPAT(stableProjectIdentity): added in v0.1.109, remove gate after 2027-01-15.
        stableProjectIdentity: true,
        // COMPAT(agentProfiles): added in v0.3.2, remove gate after 2027-02-11.
        agentProfiles: true,
        // COMPAT(workflowPython): added in v0.3.2, remove gate after 2027-02-12.
        workflowPython: true,
        // COMPAT(workflowNodeRun): added in v0.3.2, remove gate after 2027-02-12.
        workflowNodeRun: true,
        // COMPAT(workflowNodeInputMode): added in v0.3.2, remove gate after 2027-02-16.
        workflowNodeInputMode: true,
        // COMPAT(workflowInputConfiguration): added in v0.3.2, remove gate after 2027-02-12.
        workflowInputConfiguration: true,
        // COMPAT(workflowCommandResultFd3): added in v0.3.2, remove gate after 2027-02-12.
        workflowCommandResultFd3: true,
        workflowProtocolVersion: WORKFLOW_PROTOCOL_VERSION,
        // COMPAT(workflowProtocolRevision): added in v0.3.2, remove gate after 2027-02-16.
        workflowProtocolRevision: WORKFLOW_PROTOCOL_REVISION,
        // COMPAT(agentConfigApply): added in v0.3.2, remove gate after 2027-02-11.
        agentConfigApply: true,
        // COMPAT(larkChannel): added in v0.1.108, remove gate after 2027-01-13.
        larkChannel: true,
        larkReminders: true,
        // COMPAT(larkDirectory): added in v0.3.2, remove gate after 2027-02-19.
        larkDirectory: true,
        // COMPAT(assistants): added in v0.1.108, remove gate after 2027-01-13.
        assistants: true,
        // COMPAT(memory): added in v0.3.2, remove gate after 2027-02-18.
        memory: true,
        // COMPAT(memoryPolicies): added in v0.3.2, remove gate after 2027-02-18.
        memoryPolicies: true,
        // COMPAT(memoryScopePolicies): added in v0.3.2, remove gate after 2027-02-18.
        memoryScopePolicies: true,
        // COMPAT(memoryUsers): added in v0.3.2, remove gate after 2027-02-19.
        memoryUsers: true,
        // COMPAT(memorySync): added in v0.3.2, remove gate after 2027-02-20.
        memorySync: true,
        // COMPAT(reasoningTranslation): added in v0.3.2, remove gate after 2027-02-19.
        reasoningTranslation: true,
        // COMPAT(teams): added in v0.2.X, remove gate when the daemon floor includes it.
        teams: true,
        // COMPAT(mcpSkillManagement): added in v0.1.X, remove when daemon floor includes it.
        mcpServers: true,
        // COMPAT(mcpSkillManagement): added in v0.1.X, remove when daemon floor includes it.
        skills: true,
        // COMPAT(pluginManagement): added in v0.3.2, remove gate after 2027-02-18.
        plugins: true,
        // COMPAT(pluginProjectScopedApps): added on 2026-08-20.
        pluginProjectScopedApps: true,
        // COMPAT(pluginProjectDefaultAgent): added on 2026-08-20.
        pluginProjectDefaultAgent: true,
        // COMPAT(pluginProjectManagement): added on 2026-08-20.
        pluginProjectManagement: true,
        // COMPAT(pluginAppJobList): added in v0.3.2, remove gate after 2027-02-19.
        pluginAppJobList: true,
        // COMPAT(pluginAppJobMutation): added in v0.3.2, remove gate after 2027-02-19.
        pluginAppJobMutation: true,
        // COMPAT(pluginAppJobDrafts): added on 2026-08-20.
        pluginAppJobDrafts: true,
        // COMPAT(pluginHttpServiceSubmit): added in v0.3.2, remove gate after 2027-02-19.
        pluginHttpServiceSubmit: true,
        // COMPAT(pluginHttpServiceManagement): added on 2026-08-20.
        pluginHttpServiceManagement: true,
      },
    };
  }

  private createServerInfoMessage(): WSOutboundMessage {
    return {
      type: "session",
      message: {
        type: "status",
        payload: this.buildServerInfoStatusPayload(),
      },
    };
  }

  private createDaemonConfigChangedMessage(config: MutableDaemonConfig): WSOutboundMessage {
    return wrapSessionMessage({
      type: "status",
      payload: {
        status: "daemon_config_changed",
        config,
      },
    });
  }

  private recordImplicitlyAllowedClientAccess(
    hello: WSHelloMessage,
    identity: WebSocketConnectionIdentity,
    connectedAt = new Date().toISOString(),
  ): void {
    const clientId = hello.clientId.trim();
    const existing = this.implicitlyAllowedClientAccess.get(clientId);
    this.implicitlyAllowedClientAccess.set(clientId, {
      clientId,
      clientName: hello.clientName ?? existing?.clientName ?? null,
      clientHostname:
        resolveClientHostname(hello.clientHostname, identity.remoteAddress) ??
        existing?.clientHostname ??
        null,
      clientType: hello.clientType,
      appVersion: hello.appVersion ?? existing?.appVersion ?? null,
      remoteAddress: identity.remoteAddress ?? existing?.remoteAddress ?? null,
      remotePort: identity.remotePort ?? existing?.remotePort ?? null,
      transport: identity.transport,
      peer: identity.peer,
      requestedAt: existing?.requestedAt ?? connectedAt,
      approvedAt: null,
      lastConnectedAt: connectedAt,
    });
  }

  private listClientAccessEntries(): DaemonClientAccessEntry[] {
    const entries = new Map<string, DaemonClientAccessEntry>();
    for (const approved of this.clientAccessStore.listApproved()) {
      const connection = this.externalSessionsByKey.get(approved.clientId);
      entries.set(approved.clientId, {
        ...approved,
        status: approved.paused ? "paused" : "approved",
        connected: Boolean(connection && connection.sockets.size > 0),
      });
    }
    for (const allowed of this.implicitlyAllowedClientAccess.values()) {
      if (entries.has(allowed.clientId)) continue;
      const connection = this.externalSessionsByKey.get(allowed.clientId);
      entries.set(allowed.clientId, {
        ...allowed,
        status: "allowed",
        connected: Boolean(connection && connection.sockets.size > 0),
      });
    }
    for (const [socket, pending] of this.pendingClientAdmissions) {
      const clientId = pending.hello.clientId.trim();
      if (!clientId || entries.has(clientId)) continue;
      entries.set(clientId, {
        clientId,
        clientName: pending.hello.clientName ?? null,
        clientHostname: resolveClientHostname(
          pending.hello.clientHostname,
          pending.identity.remoteAddress,
        ),
        clientType: pending.hello.clientType,
        appVersion: pending.hello.appVersion ?? null,
        remoteAddress: pending.identity.remoteAddress ?? null,
        remotePort: pending.identity.remotePort ?? null,
        transport: pending.identity.transport,
        peer: pending.identity.peer,
        status: "pending",
        requestedAt: pending.requestedAt,
        approvedAt: null,
        lastConnectedAt: null,
        connected: socket.readyState === 1,
      });
    }
    return Array.from(entries.values()).sort((left, right) => {
      if (left.status !== right.status) return left.status === "pending" ? -1 : 1;
      return right.requestedAt.localeCompare(left.requestedAt);
    });
  }

  private approveClientAccess(clientIdInput: string): DaemonClientAccessEntry | null {
    const clientId = clientIdInput.trim();
    if (!clientId) return null;
    const admissions = Array.from(this.pendingClientAdmissions.entries()).filter(
      ([, pending]) => pending.hello.clientId.trim() === clientId,
    );
    const pending = admissions[0]?.[1];
    let approved: ApprovedClientAccessRecord | undefined =
      this.clientAccessStore.get(clientId) ?? undefined;
    if (pending) {
      approved = this.clientAccessStore.approve({
        clientId,
        clientName: pending.hello.clientName ?? null,
        clientHostname: resolveClientHostname(
          pending.hello.clientHostname,
          pending.identity.remoteAddress,
        ),
        clientType: pending.hello.clientType,
        appVersion: pending.hello.appVersion ?? null,
        remoteAddress: pending.identity.remoteAddress ?? null,
        remotePort: pending.identity.remotePort ?? null,
        transport: pending.identity.transport,
        peer: pending.identity.peer,
        requestedAt: pending.requestedAt,
      });
      this.implicitlyAllowedClientAccess.delete(clientId);
    }
    if (!approved) return null;

    for (const [socket, admission] of admissions) {
      this.pendingClientAdmissions.delete(socket);
      this.acceptApprovedHello({
        ws: socket,
        message: admission.hello,
        identity: admission.identity,
        connectionLogger: admission.connectionLogger,
      });
    }
    const connection = this.externalSessionsByKey.get(clientId);
    return {
      ...approved,
      status: approved.paused ? "paused" : "approved",
      connected: Boolean(connection && connection.sockets.size > 0),
    };
  }

  private setClientAccessPaused(
    clientIdInput: string,
    paused: boolean,
  ): DaemonClientAccessEntry | null {
    const clientId = clientIdInput.trim();
    let updated = this.clientAccessStore.setPaused(clientId, paused);
    if (!updated && paused) {
      const allowed = this.implicitlyAllowedClientAccess.get(clientId);
      if (allowed) {
        const approved = this.clientAccessStore.approve({
          clientId: allowed.clientId,
          clientName: allowed.clientName,
          clientHostname: allowed.clientHostname,
          clientType: allowed.clientType,
          appVersion: allowed.appVersion,
          remoteAddress: allowed.remoteAddress,
          remotePort: allowed.remotePort,
          transport: allowed.transport,
          peer: allowed.peer,
          requestedAt: allowed.requestedAt,
          lastConnectedAt: allowed.lastConnectedAt,
        });
        this.implicitlyAllowedClientAccess.delete(clientId);
        updated = this.clientAccessStore.setPaused(approved.clientId, true);
      }
    }
    if (!updated) return null;
    if (paused) {
      setTimeout(() => void this.disconnectClientAccess(clientId), 0);
    } else {
      this.acceptPendingClientAdmissionsForClient(clientId);
    }
    const connection = this.externalSessionsByKey.get(clientId);
    return {
      ...updated,
      status: paused ? "paused" : "approved",
      connected: !paused && Boolean(connection && connection.sockets.size > 0),
    };
  }

  private deleteClientAccess(clientIdInput: string): boolean {
    const clientId = clientIdInput.trim();
    if (!clientId) return false;
    const hasPendingAdmission = Array.from(this.pendingClientAdmissions.values()).some(
      (pending) => pending.hello.clientId.trim() === clientId,
    );
    const deletedImplicitlyAllowed = this.implicitlyAllowedClientAccess.delete(clientId);
    const deleted = this.clientAccessStore.delete(clientId);
    if (!deleted && !deletedImplicitlyAllowed && !hasPendingAdmission) return false;
    setTimeout(() => void this.disconnectClientAccess(clientId), 0);
    return true;
  }

  private acceptPendingClientAdmissionsForClient(clientId: string): void {
    for (const [socket, admission] of Array.from(this.pendingClientAdmissions.entries())) {
      if (admission.hello.clientId.trim() !== clientId) continue;
      this.pendingClientAdmissions.delete(socket);
      this.acceptApprovedHello({
        ws: socket,
        message: admission.hello,
        identity: admission.identity,
        connectionLogger: admission.connectionLogger,
      });
    }
  }

  private async disconnectClientAccess(clientId: string): Promise<void> {
    for (const [socket, admission] of Array.from(this.pendingClientAdmissions.entries())) {
      if (admission.hello.clientId.trim() !== clientId) continue;
      this.pendingClientAdmissions.delete(socket);
      try {
        socket.close(WS_CLOSE_CLIENT_ACCESS_REVOKED, "Client access revoked");
      } catch {
        // ignore close failures
      }
    }

    const connection = this.externalSessionsByKey.get(clientId);
    if (!connection) return;
    for (const socket of connection.sockets) {
      try {
        socket.close(WS_CLOSE_CLIENT_ACCESS_REVOKED, "Client access revoked");
      } catch {
        // ignore close failures
      }
    }
    await this.cleanupConnection(connection, "Client access revoked");
  }

  private acceptPendingClientAdmissions(): void {
    for (const [socket, admission] of Array.from(this.pendingClientAdmissions.entries())) {
      if (this.clientAccessStore.isPaused(admission.hello.clientId)) continue;
      this.pendingClientAdmissions.delete(socket);
      this.acceptApprovedHello({
        ws: socket,
        message: admission.hello,
        identity: admission.identity,
        connectionLogger: admission.connectionLogger,
      });
    }
  }

  private broadcastCapabilitiesUpdate(): void {
    this.broadcast(this.createServerInfoMessage());
  }

  private broadcastDaemonConfigChanged(config: MutableDaemonConfig): void {
    this.broadcast(this.createDaemonConfigChangedMessage(config));
  }

  private bindSocketHandlers(ws: WebSocketLike): void {
    ws.on("message", (...args: unknown[]) => {
      const data = args[0] as Buffer | ArrayBuffer | Buffer[] | string;
      this.handleRawMessage(ws, data);
    });

    ws.on("close", async (...args: unknown[]) => {
      const code = args[0];
      const reason = args[1];
      await this.detachSocket(ws, {
        code: typeof code === "number" ? code : undefined,
        reason,
      });
    });

    ws.on("error", async (...args: unknown[]) => {
      const error = args[0];
      const err = error instanceof Error ? error : new Error(String(error));
      const active = this.sessions.get(ws);
      const pending = this.pendingConnections.get(ws);
      const admission = this.pendingClientAdmissions.get(ws);
      const log =
        active?.connectionLogger ??
        pending?.connectionLogger ??
        admission?.connectionLogger ??
        this.logger;
      log.error({ err }, "Client error");
      await this.detachSocket(ws, { error: err });
    });
  }

  public resolveVoiceSpeakHandler(callerAgentId: string): VoiceSpeakHandler | null {
    return this.voiceSpeakHandlers.get(callerAgentId) ?? null;
  }

  public resolveVoiceCallerContext(callerAgentId: string): VoiceCallerContext | null {
    return this.voiceCallerContexts.get(callerAgentId) ?? null;
  }

  private async detachSocket(
    ws: WebSocketLike,
    details: {
      code?: number;
      reason?: unknown;
      error?: Error;
    },
  ): Promise<void> {
    this.applicationSocketLease.release(ws);
    const identity = this.socketIdentities.get(ws);
    const clientAccessHistoryId = this.clientAccessHistoryIds.get(ws);
    if (clientAccessHistoryId) {
      this.clientAccessStore.endConnection(clientAccessHistoryId);
      this.clientAccessHistoryIds.delete(ws);
    }
    const identityFields = identity ? toConnectionLogFields(identity) : {};
    const pending = this.clearPendingConnection(ws);
    if (pending) {
      this.incrementRuntimeCounter("pendingDisconnected");
      pending.connectionLogger.info(
        {
          ...identityFields,
          code: details.code,
          reason: stringifyCloseReason(details.reason),
        },
        "Pending client disconnected",
      );
      this.socketIdentities.delete(ws);
      return;
    }

    const admission = this.pendingClientAdmissions.get(ws);
    if (admission) {
      this.pendingClientAdmissions.delete(ws);
      admission.connectionLogger.info(
        {
          ...identityFields,
          code: details.code,
          reason: stringifyCloseReason(details.reason),
        },
        "Client access request disconnected",
      );
      this.socketIdentities.delete(ws);
      return;
    }

    const connection = this.sessions.get(ws);
    if (!connection) {
      if (identity) {
        this.logger.info(
          {
            ...identityFields,
            code: details.code,
            reason: stringifyCloseReason(details.reason),
          },
          "Client socket closed without active session",
        );
        this.socketIdentities.delete(ws);
      }
      return;
    }

    this.sessions.delete(ws);
    if (connection.kind === "hub") {
      this.socketIdentities.delete(ws);
      connection.connectionLogger.info(
        { code: details.code, reason: stringifyCloseReason(details.reason) },
        "Hub session disconnected",
      );
      connection.session.cleanup();
      return;
    }
    connection.sockets.delete(ws);
    connection.session.clearAgentTimelineSubscription(ws);
    this.socketIdentities.delete(ws);

    if (connection.sockets.size === 0) {
      this.unregisterBrowserToolsClient(connection.clientId);
      this.incrementRuntimeCounter("sessionDisconnectedWaitingReconnect");
      if (connection.externalDisconnectCleanupTimeout) {
        clearTimeout(connection.externalDisconnectCleanupTimeout);
      }
      const timeout = setTimeout(() => {
        if (connection.externalDisconnectCleanupTimeout !== timeout) {
          return;
        }
        connection.externalDisconnectCleanupTimeout = null;
        void this.cleanupConnection(connection, "Client disconnected (grace timeout)");
      }, EXTERNAL_SESSION_DISCONNECT_GRACE_MS);
      connection.externalDisconnectCleanupTimeout = timeout;

      connection.connectionLogger.info(
        {
          ...identityFields,
          code: details.code,
          reason: stringifyCloseReason(details.reason),
          reconnectGraceMs: EXTERNAL_SESSION_DISCONNECT_GRACE_MS,
        },
        "Client disconnected; waiting for reconnect",
      );
      return;
    }

    if (connection.sockets.size > 0) {
      this.incrementRuntimeCounter("sessionSocketDisconnectedAttached");
      connection.connectionLogger.info(
        {
          ...identityFields,
          remainingSockets: connection.sockets.size,
          code: details.code,
          reason: stringifyCloseReason(details.reason),
        },
        "Client socket disconnected; session remains attached",
      );
      return;
    }

    await this.cleanupConnection(connection, "Client disconnected");
  }

  private async cleanupConnection(
    connection: TrustedSessionConnection,
    logMessage: string,
  ): Promise<void> {
    this.incrementRuntimeCounter("sessionCleanup");
    if (connection.externalDisconnectCleanupTimeout) {
      clearTimeout(connection.externalDisconnectCleanupTimeout);
      connection.externalDisconnectCleanupTimeout = null;
    }

    for (const socket of connection.sockets) {
      this.sessions.delete(socket);
      this.socketIdentities.delete(socket);
    }
    connection.sockets.clear();
    const existing = this.externalSessionsByKey.get(connection.clientId);
    if (existing === connection) {
      this.externalSessionsByKey.delete(connection.clientId);
    }
    this.unregisterBrowserToolsClient(connection.clientId);

    connection.connectionLogger.trace(
      { clientId: connection.clientId, totalSessions: this.sessions.size },
      logMessage,
    );
    await connection.session.cleanup();
  }

  private syncBrowserToolsClientRegistration(connection: TrustedSessionConnection): void {
    if (!this.browserToolsBroker) {
      return;
    }
    const browserHostCapability = getBrowserHostCapability(connection.clientCapabilities);
    if (!browserHostCapability) {
      this.unregisterBrowserToolsClient(connection.clientId);
      return;
    }
    const capabilitySignature = JSON.stringify(browserHostCapability);
    const existing = this.browserToolsRegistrations.get(connection.clientId);
    if (existing?.capabilitySignature === capabilitySignature) {
      return;
    }
    if (existing) {
      this.browserToolsRegistrations.delete(connection.clientId);
      existing.unregister();
    }

    const unregister = this.browserToolsBroker.registerClient({
      id: connection.clientId,
      hostKind: browserHostCapability.hostKind,
      supportedCommands: browserHostCapability.supportedCommands,
      sendBrowserAutomationRequest: (request) => {
        this.sendToConnection(connection, wrapSessionMessage(request));
      },
    });
    this.browserToolsRegistrations.set(connection.clientId, {
      capabilitySignature,
      unregister,
    });
  }

  private unregisterBrowserToolsClient(clientId: string): void {
    const registration = this.browserToolsRegistrations.get(clientId);
    if (!registration) {
      return;
    }
    this.browserToolsRegistrations.delete(clientId);
    registration.unregister();
  }

  private handleInvalidInboundMessage(args: {
    ws: WebSocketLike;
    parsed: unknown;
    parsedMessage: { success: false; error: { message: string } } & Record<string, unknown>;
    pendingConnection: PendingConnection | undefined;
    activeConnection: SessionConnection | undefined;
    log: pino.Logger;
  }): void {
    const { ws, parsed, parsedMessage, pendingConnection, activeConnection, log } = args;
    this.incrementRuntimeCounter("validationFailed");
    if (pendingConnection) {
      pendingConnection.connectionLogger.warn(
        { error: parsedMessage.error.message },
        "Rejected pending message before hello",
      );
      this.clearPendingConnection(ws);
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Invalid hello");
      } catch {
        // ignore close errors
      }
      return;
    }

    const requestInfo = extractRequestInfoFromUnknownWsInbound(parsed);
    const isUnknownSchema =
      requestInfo?.requestId != null &&
      typeof parsed === "object" &&
      parsed != null &&
      "type" in parsed &&
      (parsed as { type?: unknown }).type === "session";

    log.warn(
      {
        clientId: activeConnection?.kind === "trusted" ? activeConnection.clientId : undefined,
        requestId: requestInfo?.requestId,
        requestType: requestInfo?.requestType,
        error: parsedMessage.error.message,
      },
      "WS inbound message validation failed",
    );

    if (requestInfo) {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "rpc_error",
          payload: {
            requestId: requestInfo.requestId,
            requestType: requestInfo.requestType,
            error: isUnknownSchema
              ? `Unknown request, try upgrading the daemon (currently v${this.daemonVersion})`
              : "Invalid message",
            code: isUnknownSchema ? "unknown_schema" : "invalid_message",
          },
        }),
      );
      return;
    }

    const errorMessage = `Invalid message: ${parsedMessage.error.message}`;
    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "status",
        payload: {
          status: "error",
          message: errorMessage,
        },
      }),
    );
  }

  private maybeHandleBinaryFrame(params: {
    ws: WebSocketLike;
    buffer: Buffer;
    activeConnection: SessionConnection | undefined;
    log: pino.Logger;
  }): boolean {
    const { ws, buffer, activeConnection, log } = params;
    const asBytes = asUint8Array(buffer);
    if (!asBytes) {
      return false;
    }
    const decodedFrame = decodeBinaryFrame(asBytes);
    if (!decodedFrame) {
      return false;
    }
    if (!activeConnection && this.pendingClientAdmissions.has(ws)) {
      this.sendClientApprovalRequired(ws);
      return true;
    }
    if (!activeConnection) {
      this.incrementRuntimeCounter("binaryBeforeHelloRejected");
      log.warn("Rejected binary frame before hello");
      this.clearPendingConnection(ws);
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Session message before hello");
      } catch {
        // ignore close errors
      }
      return true;
    }
    if (activeConnection.kind === "hub") {
      log.warn("Rejected binary frame on Hub session");
      ws.close(WS_CLOSE_INVALID_HELLO, "Binary frames are not supported on Hub sessions");
      return true;
    }
    void Promise.resolve(activeConnection.session.handleBinaryFrame(decodedFrame)).catch(
      (error: unknown) => {
        this.handleRawMessageError({
          ws,
          data: buffer,
          error,
          log: activeConnection.connectionLogger,
        });
      },
    );
    return true;
  }

  private handlePendingConnectionMessage(params: {
    ws: WebSocketLike;
    message: WSInboundMessage;
    pendingConnection: PendingConnection;
  }): void {
    const { ws, message, pendingConnection } = params;
    if (message.type === "hello") {
      this.handleHello({
        ws,
        message,
        pending: pendingConnection,
      });
      return;
    }

    pendingConnection.connectionLogger.warn(
      {
        messageType: message.type,
      },
      "Rejected pending message before hello",
    );
    this.incrementRuntimeCounter("pendingMessageRejectedBeforeHello");
    this.clearPendingConnection(ws);
    try {
      ws.close(WS_CLOSE_INVALID_HELLO, "Session message before hello");
    } catch {
      // ignore close errors
    }
  }

  private handleRawMessage(
    ws: WebSocketLike,
    data: Buffer | ArrayBuffer | Buffer[] | string,
  ): void {
    if (!this.acceptingConnections) {
      return;
    }

    this.applicationSocketLease.renew(ws);

    const activeConnection = this.sessions.get(ws);
    const pendingConnection = this.pendingConnections.get(ws);
    const pendingAdmission = this.pendingClientAdmissions.get(ws);
    const log =
      activeConnection?.connectionLogger ??
      pendingConnection?.connectionLogger ??
      pendingAdmission?.connectionLogger ??
      this.logger;

    try {
      const buffer = bufferFromWsData(data);
      const binaryHandled = this.maybeHandleBinaryFrame({
        ws,
        buffer,
        activeConnection,
        log,
      });
      if (binaryHandled) {
        return;
      }

      const parsed = JSON.parse(buffer.toString());
      const parsedMessage = WSInboundMessageSchema.safeParse(parsed);
      if (!parsedMessage.success) {
        this.handleInvalidInboundMessage({
          ws,
          parsed,
          parsedMessage,
          pendingConnection,
          activeConnection,
          log,
        });
        return;
      }

      const message = parsedMessage.data;
      this.recordInboundMessageType(message.type);

      if (message.type === "ping") {
        this.applicationSocketLease.claim(ws);
        this.sendToClient(ws, { type: "pong" });
        return;
      }

      if (message.type === "recording_state") {
        return;
      }

      if (pendingConnection) {
        this.handlePendingConnectionMessage({
          ws,
          message,
          pendingConnection,
        });
        return;
      }

      if (pendingAdmission) {
        this.sendClientApprovalRequired(ws);
        return;
      }

      if (!activeConnection) {
        this.incrementRuntimeCounter("missingConnectionForMessage");
        this.logger.error("No connection found for websocket");
        return;
      }

      if (message.type === "hello") {
        this.incrementRuntimeCounter("unexpectedHelloOnActiveConnection");
        activeConnection.connectionLogger.warn("Received hello on active connection");
        try {
          ws.close(WS_CLOSE_INVALID_HELLO, "Unexpected hello");
        } catch {
          // ignore close errors
        }
        return;
      }

      if (message.type === "session") {
        void this.dispatchSessionMessage(ws, activeConnection, message).catch((error: unknown) => {
          this.handleRawMessageError({
            ws,
            data,
            error,
            log: activeConnection.connectionLogger,
          });
        });
      }
    } catch (error) {
      this.handleRawMessageError({ ws, data, error, log });
    }
  }

  private dispatchClientAccessMessage(
    ws: WebSocketLike,
    activeConnection: TrustedSessionConnection,
    message: SessionInboundMessage,
  ): boolean {
    if (message.type === "daemon.client_access.list.request") {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.client_access.list.response",
          payload: {
            requestId: message.requestId,
            clients: this.listClientAccessEntries(),
            history: this.clientAccessStore.listHistory(),
            historyRetentionDays: CLIENT_ACCESS_HISTORY_RETENTION_DAYS,
          },
        }),
      );
      return true;
    }

    if (message.type === "daemon.client_access.approve.request") {
      const client = this.approveClientAccess(message.clientId);
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.client_access.approve.response",
          payload: {
            requestId: message.requestId,
            client,
            success: client !== null,
            error: client ? null : "连接申请不存在",
          },
        }),
      );
      return true;
    }

    if (message.type === "daemon.client_access.set_paused.request") {
      const clientId = message.clientId.trim();
      const isPausingCurrentClient = message.paused && activeConnection.clientId === clientId;
      const client = isPausingCurrentClient
        ? null
        : this.setClientAccessPaused(clientId, message.paused);
      let error: string | null = null;
      if (isPausingCurrentClient) {
        error = "不能暂停当前客户端";
      } else if (!client) {
        error = "客户端不存在";
      }
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.client_access.set_paused.response",
          payload: {
            requestId: message.requestId,
            client,
            success: client !== null,
            error,
          },
        }),
      );
      return true;
    }

    if (message.type === "daemon.client_access.delete.request") {
      const clientId = message.clientId.trim();
      const isCurrentClient = activeConnection.clientId === clientId;
      const success = isCurrentClient ? false : this.deleteClientAccess(clientId);
      let error: string | null = null;
      if (isCurrentClient) {
        error = "不能删除当前客户端";
      } else if (!success) {
        error = "客户端不存在";
      }
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.client_access.delete.response",
          payload: {
            requestId: message.requestId,
            clientId,
            success,
            error,
          },
        }),
      );
      return true;
    }

    if (message.type === "daemon.client_access.history.delete.request") {
      const historyId = message.historyId.trim();
      const success = this.clientAccessStore.deleteHistory(historyId);
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "daemon.client_access.history.delete.response",
          payload: {
            requestId: message.requestId,
            historyId,
            success,
            error: success ? null : "历史记录不存在",
          },
        }),
      );
      return true;
    }

    return false;
  }

  private async dispatchSessionMessage(
    ws: WebSocketLike,
    activeConnection: SessionConnection,
    message: Extract<WSInboundMessage, { type: "session" }>,
  ): Promise<void> {
    this.recordInboundSessionRequestType(message.message.type);
    const controlRpc = getControlRpcLogInfo(message.message);
    if (controlRpc) {
      const identity = this.socketIdentities.get(ws);
      let connectionFields: Record<string, unknown>;
      if (identity) {
        connectionFields = toConnectionLogFields(identity);
      } else if (activeConnection.kind === "trusted") {
        connectionFields = { clientId: activeConnection.clientId };
      } else {
        connectionFields = { daemonId: activeConnection.daemonId };
      }
      activeConnection.connectionLogger.warn(
        {
          ...connectionFields,
          ...controlRpc,
        },
        "ws_control_rpc_received",
      );
    }
    if (
      activeConnection.kind === "trusted" &&
      message.message.type === "browser.automation.execute.response"
    ) {
      this.browserToolsBroker?.receiveResponse(message.message as BrowserAutomationExecuteResponse);
      return;
    }

    if (
      activeConnection.kind === "trusted" &&
      this.dispatchClientAccessMessage(ws, activeConnection, message.message)
    ) {
      return;
    }

    const startMs = performance.now();
    await activeConnection.session.handleMessage(message.message, ws);
    const durationMs = performance.now() - startMs;
    this.recordRequestLatency(message.message.type, durationMs);

    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS && activeConnection.kind === "trusted") {
      activeConnection.connectionLogger.warn(
        {
          requestType: message.message.type,
          durationMs: Math.round(durationMs),
          inflightRequests: activeConnection.session.getRuntimeMetrics().inflightRequests,
        },
        "ws_slow_request",
      );
    }
  }

  private handleRawMessageError(params: {
    ws: WebSocketLike;
    data: Buffer | ArrayBuffer | Buffer[] | string;
    error: unknown;
    log: pino.Logger;
  }): void {
    const { ws, data, error, log } = params;
    const err = error instanceof Error ? error : new Error(String(error));
    const { rawPayload, parsedPayload } = this.decodeRawMessagePayloadForError(data);

    const trimmedRawPayload =
      typeof rawPayload === "string" && rawPayload.length > 2000
        ? `${rawPayload.slice(0, 2000)}... (truncated)`
        : rawPayload;

    log.error(
      {
        err,
        rawPayload: trimmedRawPayload,
        parsedPayload,
      },
      "Failed to parse/handle message",
    );

    if (this.pendingConnections.has(ws)) {
      this.clearPendingConnection(ws);
      try {
        ws.close(WS_CLOSE_INVALID_HELLO, "Invalid hello");
      } catch {
        // ignore close errors
      }
      return;
    }

    const requestInfo = extractRequestInfoFromUnknownWsInbound(parsedPayload);
    if (requestInfo) {
      this.sendToClient(
        ws,
        wrapSessionMessage({
          type: "rpc_error",
          payload: {
            requestId: requestInfo.requestId,
            requestType: requestInfo.requestType,
            error: "Invalid message",
            code: "invalid_message",
          },
        }),
      );
      return;
    }

    this.sendToClient(
      ws,
      wrapSessionMessage({
        type: "status",
        payload: {
          status: "error",
          message: `Invalid message: ${err.message}`,
        },
      }),
    );
  }

  private decodeRawMessagePayloadForError(data: Buffer | ArrayBuffer | Buffer[] | string): {
    rawPayload: string | null;
    parsedPayload: unknown;
  } {
    let rawPayload: string | null = null;
    let parsedPayload: unknown = null;
    try {
      const buffer = bufferFromWsData(data);
      rawPayload = buffer.toString();
      parsedPayload = JSON.parse(rawPayload);
    } catch (payloadError) {
      rawPayload = rawPayload ?? "<unreadable>";
      parsedPayload = parsedPayload ?? rawPayload;
      const payloadErr =
        payloadError instanceof Error ? payloadError : new Error(String(payloadError));
      this.logger.error({ err: payloadErr }, "Failed to decode raw payload");
    }
    return { rawPayload, parsedPayload };
  }

  private incrementRuntimeCounter(counter: keyof WebSocketRuntimeCounters): void {
    this.runtimeMetrics.incrementCounter(counter);
  }

  private recordInboundMessageType(type: string): void {
    this.runtimeMetrics.recordInboundMessage(type);
  }

  private recordInboundSessionRequestType(type: string): void {
    this.runtimeMetrics.recordInboundSessionRequest(type);
  }

  private recordRequestLatency(type: string, durationMs: number): void {
    this.runtimeMetrics.recordRequestLatency(type, durationMs);
  }

  private collectSessionRuntimeMetrics(): WebSocketRuntimeMetrics {
    const uniqueConnections = new Set<TrustedSessionConnection>(
      this.externalSessionsByKey.values(),
    );
    let terminalDirectorySubscriptionCount = 0;
    let terminalSubscriptionCount = 0;
    let workspaceGitWatchedDirectoryCount = 0;
    let workspaceGitWorkspaceRecordCount = 0;
    let workspaceGitSubscriptionCount = 0;
    let inflightRequests = 0;
    let peakInflightRequests = 0;

    for (const connection of uniqueConnections) {
      const sessionMetrics = connection.session.getRuntimeMetrics();
      terminalDirectorySubscriptionCount += sessionMetrics.terminalDirectorySubscriptionCount;
      terminalSubscriptionCount += sessionMetrics.terminalSubscriptionCount;
      workspaceGitWatchedDirectoryCount += sessionMetrics.workspaceGitWatchedDirectoryCount;
      workspaceGitWorkspaceRecordCount += sessionMetrics.workspaceGitWorkspaceRecordCount;
      workspaceGitSubscriptionCount += sessionMetrics.workspaceGitSubscriptionCount;
      inflightRequests += sessionMetrics.inflightRequests;
      peakInflightRequests = Math.max(peakInflightRequests, sessionMetrics.peakInflightRequests);
      connection.session.resetPeakInflight();
    }

    return {
      ...this.checkoutDiffManager.getMetrics(),
      terminalDirectorySubscriptionCount,
      terminalSubscriptionCount,
      workspaceGitWatchedDirectoryCount,
      workspaceGitWorkspaceRecordCount,
      workspaceGitSubscriptionCount,
      inflightRequests,
      peakInflightRequests,
    };
  }

  private flushRuntimeMetrics(options?: { final?: boolean }): void {
    const runtimeMetrics = this.runtimeMetrics.snapshotAndReset();
    const activeConnections = new Set<SessionConnection>(this.sessions.values()).size;
    const activeSockets = this.sessions.size;
    const pendingConnections = this.pendingConnections.size;
    const reconnectGraceSessions = [...this.externalSessionsByKey.values()].filter(
      (connection) =>
        connection.sockets.size === 0 && connection.externalDisconnectCleanupTimeout !== null,
    ).length;
    const sessionMetrics = this.collectSessionRuntimeMetrics();
    const agentSnapshot = this.agentManager.getMetricsSnapshot();
    const gitCommandMetrics = snapshotGitCommandRuntimeMetrics();
    const loggedMetrics = {
      windowMs: runtimeMetrics.windowMs,
      final: Boolean(options?.final),
      sessions: {
        activeConnections,
        externalSessionKeys: this.externalSessionsByKey.size,
        reconnectGraceSessions,
      },
      sockets: {
        activeSockets,
        pendingConnections,
      },
      counters: runtimeMetrics.counters,
      inboundMessageTypesTop: runtimeMetrics.inboundMessageTypesTop,
      inboundSessionRequestTypesTop: runtimeMetrics.inboundSessionRequestTypesTop,
      outboundMessageTypesTop: runtimeMetrics.outboundMessageTypesTop,
      outboundSessionMessageTypesTop: runtimeMetrics.outboundSessionMessageTypesTop,
      outboundAgentStreamTypesTop: runtimeMetrics.outboundAgentStreamTypesTop,
      outboundAgentStreamAgentsTop: runtimeMetrics.outboundAgentStreamAgentsTop,
      outboundBinaryFrameTypesTop: runtimeMetrics.outboundBinaryFrameTypesTop,
      bufferedAmount: runtimeMetrics.bufferedAmount,
      eventLoopDelay: this.snapshotEventLoopDelay(),
      uptimeSeconds: getProcessUptimeSeconds(),
      memory: getProcessMemoryDiagnostics(),
      runtime: sessionMetrics,
      latency: runtimeMetrics.latency,
      agents: agentSnapshot,
      git: {
        commands: gitCommandMetrics,
        workspaceService: this.workspaceGitService.getMetrics(),
      },
    } satisfies WebSocketRuntimeMetricsLogPayload;

    this.lastRuntimeMetricsSnapshot = {
      collectedAt: new Date().toISOString(),
      ...loggedMetrics,
    };
    this.logger.info(loggedMetrics, "ws_runtime_metrics");
  }

  private getClientActivityState(session: Session): ClientPresenceState {
    const activity = session.getClientActivity();
    if (!activity) {
      return {
        appVisible: false,
        focusedAgentId: null,
        focusedTerminalId: null,
        lastActivityAtMs: null,
      };
    }

    return {
      appVisible: activity.appVisible,
      focusedAgentId: activity.focusedAgentId,
      focusedTerminalId: activity.focusedTerminalId,
      lastActivityAtMs: activity.lastActivityAt.getTime(),
    };
  }

  private async broadcastAgentAttention(params: {
    agentId: string;
    provider: AgentProvider;
    reason: "finished" | "error" | "permission";
  }): Promise<void> {
    const clientEntries: Array<{
      ws: WebSocketLike;
      state: ClientPresenceState;
    }> = [];

    for (const [ws, connection] of this.sessions) {
      if (connection.kind !== "trusted") {
        continue;
      }
      clientEntries.push({
        ws,
        state: this.getClientActivityState(connection.session),
      });
    }

    const allStates = clientEntries.map((e) => e.state);
    const nowMs = Date.now();
    const agent = this.agentManager.getAgent(params.agentId);
    if (!agent?.workspaceId) {
      return;
    }
    const assistantMessage = await this.agentManager.getLastAssistantMessage(params.agentId);
    const notification = buildAgentAttentionNotificationPayload({
      reason: params.reason,
      serverId: this.serverId,
      workspaceId: agent.workspaceId,
      agentId: params.agentId,
      assistantMessage,
      permissionRequest: findLatestPermissionRequest(agent.pendingPermissions),
    });

    const plan = computeNotificationPlan({
      allStates,
      focusTarget: { kind: "agent", id: params.agentId },
      pushEligible: isPushEligibleAttentionReason(params.reason),
      nowMs,
    });

    if (plan.shouldPush) {
      void this.pushNotificationSender.send(notification).catch((err) => {
        this.logger.warn({ err, agentId: params.agentId }, "Failed to send push notification");
      });
    }

    for (const [clientIndex, { ws }] of clientEntries.entries()) {
      const shouldNotify = clientIndex === plan.inAppRecipientIndex;
      const timestamp = new Date().toISOString();
      const connection = this.sessions.get(ws);
      const attentionPayload = {
        agentId: params.agentId,
        reason: params.reason,
        timestamp,
        shouldNotify,
        notification,
      };
      const message = wrapSessionMessage(
        connection?.session.supportsForSource(CLIENT_CAPS.selectiveAgentTimeline, ws)
          ? {
              type: "agent_attention_required",
              payload: attentionPayload,
            }
          : {
              type: "agent_stream",
              payload: {
                agentId: params.agentId,
                event: {
                  type: "attention_required",
                  provider: params.provider,
                  reason: params.reason,
                  timestamp,
                  shouldNotify,
                  notification,
                },
                timestamp,
              },
            },
      );

      this.sendToClient(ws, message);
    }
  }

  private async broadcastTerminalAttention(params: {
    terminalId: string;
    cwd: string;
    workspaceId?: string;
    terminalName: string;
    reason: TerminalAttentionReason;
  }): Promise<void> {
    const clientEntries: Array<{
      ws: WebSocketLike;
      state: ClientPresenceState;
    }> = [];

    for (const [ws, connection] of this.sessions) {
      if (connection.kind !== "trusted") {
        continue;
      }
      clientEntries.push({
        ws,
        state: this.getClientActivityState(connection.session),
      });
    }

    const allStates = clientEntries.map((e) => e.state);
    const nowMs = Date.now();
    const workspaceId = params.workspaceId;

    const plan = computeNotificationPlan({
      allStates,
      focusTarget: { kind: "terminal", id: params.terminalId },
      pushEligible: true,
      nowMs,
    });

    const title = terminalAttentionTitle(params.reason);
    const body = params.terminalName;

    if (plan.shouldPush) {
      void this.pushNotificationSender
        .send({
          title,
          body,
          data: {
            serverId: this.serverId,
            terminalId: params.terminalId,
            cwd: params.cwd,
            ...(workspaceId ? { workspaceId } : {}),
          },
        })
        .catch((err) => {
          this.logger.warn(
            { err, terminalId: params.terminalId },
            "Failed to send push notification",
          );
        });
    }

    for (const [clientIndex, { ws }] of clientEntries.entries()) {
      const shouldNotify = clientIndex === plan.inAppRecipientIndex;
      const message = wrapSessionMessage({
        type: "terminal_attention_required",
        payload: {
          serverId: this.serverId,
          terminalId: params.terminalId,
          cwd: params.cwd,
          ...(workspaceId ? { workspaceId } : {}),
          reason: params.reason,
          title,
          body,
          shouldNotify,
        },
      });
      this.sendToClient(ws, message);
    }
  }
}

interface SocketRequestMetadata {
  host?: string;
  origin?: string;
  userAgent?: string;
  remoteAddress?: string;
  remotePort?: number;
}

// oxlint-disable-next-line complexity
function createWebSocketConnectionIdentity(
  requestMetadata: SocketRequestMetadata,
  metadata: ExternalSocketMetadata | undefined,
): WebSocketConnectionIdentity {
  return {
    connectionId: `conn_${randomUUID().replaceAll("-", "")}`,
    transport: metadata?.transport === "relay" ? "relay" : "direct",
    peer: resolveConnectionPeer(requestMetadata, metadata),
    browserOrigin: requestMetadata.origin !== undefined,
    ...(requestMetadata.host ? { host: requestMetadata.host } : {}),
    ...(requestMetadata.origin ? { origin: requestMetadata.origin } : {}),
    ...((metadata?.userAgent ?? requestMetadata.userAgent)
      ? { userAgent: metadata?.userAgent ?? requestMetadata.userAgent }
      : {}),
    ...((metadata?.remoteAddress ?? requestMetadata.remoteAddress)
      ? {
          remoteAddress: normalizeRemoteAddress(
            (metadata?.remoteAddress ?? requestMetadata.remoteAddress)!,
          ),
        }
      : {}),
    ...((metadata?.remotePort ?? requestMetadata.remotePort)
      ? { remotePort: metadata?.remotePort ?? requestMetadata.remotePort }
      : {}),
    ...(metadata?.relayConnectionId ? { relayConnectionId: metadata.relayConnectionId } : {}),
    ...(metadata?.directUpgradeClientId
      ? { directUpgradeClientId: metadata.directUpgradeClientId }
      : {}),
  };
}

function toConnectionLogFields(identity: WebSocketConnectionIdentity): Record<string, string> {
  return {
    connectionId: identity.connectionId,
    transport: identity.transport,
    peer: identity.peer,
    ...(identity.host ? { host: identity.host } : {}),
    ...(identity.origin ? { origin: identity.origin } : {}),
    ...(identity.userAgent ? { userAgent: identity.userAgent } : {}),
    ...(identity.remoteAddress ? { remoteAddress: identity.remoteAddress } : {}),
    ...(identity.remotePort !== undefined ? { remotePort: String(identity.remotePort) } : {}),
    ...(identity.relayConnectionId ? { relayConnectionId: identity.relayConnectionId } : {}),
    ...(identity.clientId ? { clientId: identity.clientId } : {}),
    ...(identity.sessionId ? { sessionId: identity.sessionId } : {}),
    ...(identity.appVersion ? { appVersion: identity.appVersion } : {}),
  };
}

function resolveConnectionPeer(
  requestMetadata: SocketRequestMetadata,
  metadata: ExternalSocketMetadata | undefined,
): WebSocketConnectionIdentity["peer"] {
  if (metadata?.transport === "relay" || metadata?.transport === "direct_e2ee") return "external";
  if (!requestMetadata.remoteAddress) return "local_ipc";
  return isLoopbackAddress(requestMetadata.remoteAddress) ? "loopback" : "external";
}

function readDirectUpgradeToken(request: IncomingMessage): string | null {
  try {
    const url = new URL(request.url ?? "", "http://localhost");
    const token = url.searchParams.get("directToken")?.trim();
    return token || null;
  } catch {
    return null;
  }
}

function listLanIpv4Addresses(): string[] {
  const addresses = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal || entry.family !== "IPv4") continue;
      addresses.add(entry.address);
    }
  }
  return [...addresses].sort();
}

function isLoopbackAddress(address: string): boolean {
  const normalized = normalizeRemoteAddress(address).toLowerCase();
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
  return normalized.startsWith("127.");
}

function resolveClientHostname(
  advertisedHostname: string | undefined,
  remoteAddress: string | undefined,
): string | null {
  const advertised = advertisedHostname?.trim();
  if (advertised) return advertised;
  if (!remoteAddress) return null;
  const normalizedRemoteAddress = normalizeRemoteAddress(remoteAddress).toLowerCase();
  if (isLoopbackAddress(normalizedRemoteAddress)) return getHostname();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (normalizeRemoteAddress(entry.address).toLowerCase() === normalizedRemoteAddress) {
        return getHostname();
      }
    }
  }
  return null;
}

function normalizeRemoteAddress(address: string): string {
  const trimmed = address.trim();
  return trimmed.toLowerCase().startsWith("::ffff:") ? trimmed.slice("::ffff:".length) : trimmed;
}

// oxlint-disable-next-line complexity
function extractSocketRequestMetadata(request: unknown): SocketRequestMetadata {
  if (!request || typeof request !== "object") {
    return {};
  }

  const record = request as {
    headers?: {
      host?: unknown;
      origin?: unknown;
      "user-agent"?: unknown;
    };
    url?: unknown;
    socket?: {
      remoteAddress?: unknown;
      remotePort?: unknown;
    };
  };

  const host = typeof record.headers?.host === "string" ? record.headers.host : undefined;
  const origin = typeof record.headers?.origin === "string" ? record.headers.origin : undefined;
  const userAgent =
    typeof record.headers?.["user-agent"] === "string" ? record.headers["user-agent"] : undefined;
  const remoteAddress =
    typeof record.socket?.remoteAddress === "string" ? record.socket.remoteAddress : undefined;
  const remotePort =
    typeof record.socket?.remotePort === "number" &&
    Number.isInteger(record.socket.remotePort) &&
    record.socket.remotePort >= 0 &&
    record.socket.remotePort <= 65535
      ? record.socket.remotePort
      : undefined;

  return {
    ...(host ? { host } : {}),
    ...(origin ? { origin } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(remoteAddress ? { remoteAddress } : {}),
    ...(remotePort !== undefined ? { remotePort } : {}),
  };
}

interface HostAuthority {
  hostname: string;
  port: string | null;
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function parseHostAuthority(host: string): HostAuthority | null {
  const trimmed = host.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    if (end === -1) {
      return null;
    }
    const hostname = stripIpv6Brackets(trimmed.slice(0, end + 1)).toLowerCase();
    const rest = trimmed.slice(end + 1);
    if (!rest) {
      return { hostname, port: null };
    }
    if (!rest.startsWith(":")) {
      return null;
    }
    const port = rest.slice(1);
    return port ? { hostname, port } : null;
  }

  const firstColon = trimmed.indexOf(":");
  if (firstColon === -1) {
    return { hostname: trimmed.toLowerCase(), port: null };
  }
  if (trimmed.indexOf(":", firstColon + 1) !== -1) {
    return { hostname: trimmed.toLowerCase(), port: null };
  }
  const hostname = trimmed.slice(0, firstColon).toLowerCase();
  const port = trimmed.slice(firstColon + 1);
  return hostname && port ? { hostname, port } : null;
}

function defaultPortForOriginProtocol(protocol: string): string | null {
  if (protocol === "http:") {
    return "80";
  }
  if (protocol === "https:") {
    return "443";
  }
  return null;
}

function isLoopbackAlias(hostname: string): boolean {
  const normalized = stripIpv6Brackets(hostname).toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  return /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

export function isWebSocketSameOrigin(
  origin: string | undefined,
  requestHost: string | null,
): boolean {
  if (!origin || !requestHost) {
    return false;
  }

  if (origin === `http://${requestHost}` || origin === `https://${requestHost}`) {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }
  const originPort = originUrl.port || defaultPortForOriginProtocol(originUrl.protocol);
  if (!originPort) {
    return false;
  }

  const requestAuthority = parseHostAuthority(requestHost);
  if (!requestAuthority) {
    return false;
  }
  const requestPort = requestAuthority.port || defaultPortForOriginProtocol(originUrl.protocol);
  if (originPort !== requestPort) {
    return false;
  }

  return isLoopbackAlias(originUrl.hostname) && isLoopbackAlias(requestAuthority.hostname);
}

function selectWebSocketProtocol(
  protocols: Set<string>,
  password: string | undefined,
): string | false {
  if (!password) {
    return protocols.values().next().value ?? false;
  }

  for (const protocol of protocols) {
    const token = extractWsBearerToken(protocol);
    if (token !== null) {
      return protocol;
    }
  }

  return false;
}

function stringifyCloseReason(reason: unknown): string | null {
  if (typeof reason === "string") {
    return reason.length > 0 ? reason : null;
  }
  if (Buffer.isBuffer(reason)) {
    const text = reason.toString();
    return text.length > 0 ? text : null;
  }
  if (reason == null) {
    return null;
  }
  const text = String(reason);
  return text.length > 0 ? text : null;
}

function getControlRpcLogInfo(
  message: Extract<WSInboundMessage, { type: "session" }>["message"],
): { requestType: string; requestId: string; reason?: string } | null {
  if (message.type === "shutdown_server_request") {
    return {
      requestType: message.type,
      requestId: message.requestId,
      reason: CLIENT_SHUTDOWN_RPC_REASON,
    };
  }
  if (message.type === "restart_server_request") {
    const reason = normalizeClientRestartRpcReason(message.reason);
    return {
      requestType: message.type,
      requestId: message.requestId,
      reason,
    };
  }
  if (message.type === "daemon.update.request") {
    return {
      requestType: message.type,
      requestId: message.requestId,
      reason: "daemon_update",
    };
  }
  return null;
}

function extractRequestInfoFromUnknownWsInbound(
  payload: unknown,
): { requestId: string; requestType?: string } | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as {
    type?: unknown;
    requestId?: unknown;
    message?: unknown;
  };

  // Session-wrapped messages
  if (record.type === "session" && record.message && typeof record.message === "object") {
    const msg = record.message as { requestId?: unknown; type?: unknown };
    if (typeof msg.requestId === "string") {
      return {
        requestId: msg.requestId,
        ...(typeof msg.type === "string" ? { requestType: msg.type } : {}),
      };
    }
  }

  // Non-session messages (future-proof)
  if (typeof record.requestId === "string") {
    return {
      requestId: record.requestId,
      ...(typeof record.type === "string" ? { requestType: record.type } : {}),
    };
  }

  return null;
}
