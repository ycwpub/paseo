import type { AlertTroubleshooterConfig, PluginAppState } from "@getpaseo/protocol/messages";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import type { AlertTroubleshooterQueueItem } from "./alert-troubleshooter-queue-store.js";
import type { AlertTroubleshooterRecord } from "./alert-troubleshooter-record-store.js";

export interface AlertTroubleshooterCompletion {
  status: "succeeded" | "pending" | "not_support";
  summary: string;
  documentUrl?: string;
}

export interface AlertTroubleshooterCompletionContext {
  message: string | null | undefined;
  config: AlertTroubleshooterConfig;
  record: AlertTroubleshooterRecord;
  workspaceCwd: string;
  wikiTarget?: { spaceId: string; parentNodeToken: string };
}

export interface AlertTroubleshooterAgentStageInput {
  stage: string;
  title: string;
  prompt: string;
  outputSchema?: Record<string, unknown>;
  labels?: Record<string, string>;
  notifyOnFinish?: boolean;
}

export interface AlertTroubleshooterAgentStageResult {
  agentId: string;
  lastMessage: string | null;
}

export interface AlertTroubleshooterRecordExecutionInput {
  config: AlertTroubleshooterConfig;
  state: PluginAppState;
  project: PersistedProjectRecord;
  record: AlertTroubleshooterRecord;
  item: AlertTroubleshooterQueueItem;
  workspace: { workspaceId: string; cwd: string };
  wikiTarget?: { spaceId: string; parentNodeToken: string };
  closeContext?: {
    baseToken: string;
    tableId: string;
    parentWikiToken: string;
    targetSpaceId: string;
  };
  prompt: string;
  launchAgent(
    input: AlertTroubleshooterAgentStageInput,
  ): Promise<AlertTroubleshooterAgentStageResult>;
}

export interface AlertTroubleshooterRecordExecutionResult {
  agentId: string;
  completion: AlertTroubleshooterCompletion;
  persistenceHandled?: boolean;
  completionWarning?: string;
}
