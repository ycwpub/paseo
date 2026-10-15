import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type {
  ProjectCallPermissionDecision,
  ProjectCallRequest,
} from "@getpaseo/protocol/messages";

export interface ProjectCallAuditRecord {
  timestamp: string;
  projectId: string;
  workspaceId?: string;
  agentId?: string;
  taskId?: string;
  source: string;
  kind: ProjectCallRequest["kind"];
  target: string;
  method?: string;
  allowed: boolean;
  reason: ProjectCallPermissionDecision["reason"];
  matchedRuleId: string | null;
  enforcement: ProjectCallPermissionDecision["enforcement"];
  durationMs: number;
}

export interface AppendProjectCallAuditInput {
  projectId: string;
  workspaceId?: string;
  agentId?: string;
  taskId?: string;
  source: string;
  request: ProjectCallRequest;
  decision: ProjectCallPermissionDecision;
  durationMs: number;
}

function auditTarget(request: ProjectCallRequest): string {
  if (request.kind === "rpc") return request.target;
  const url = new URL(request.url);
  url.search = "";
  url.hash = "";
  return url.toString();
}

export class ProjectCallAuditStore {
  public readonly filePath: string;
  private readonly maxEntries: number;

  public constructor(input: { directory: string; maxEntries?: number }) {
    mkdirSync(input.directory, { recursive: true });
    this.filePath = path.join(input.directory, "project-call-audit.jsonl");
    this.maxEntries = input.maxEntries ?? 2_000;
  }

  public async append(input: AppendProjectCallAuditInput): Promise<void> {
    const records = this.readAll();
    const record: ProjectCallAuditRecord = {
      timestamp: new Date().toISOString(),
      projectId: input.projectId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      source: input.source,
      kind: input.request.kind,
      target: auditTarget(input.request),
      ...(input.request.kind === "http"
        ? { method: input.request.method.trim().toUpperCase() }
        : {}),
      allowed: input.decision.allowed,
      reason: input.decision.reason,
      matchedRuleId: input.decision.matchedRuleId,
      enforcement: input.decision.enforcement,
      durationMs: Math.max(0, Math.round(input.durationMs)),
    };
    records.push(record);
    const retained = records.slice(-this.maxEntries);
    const temporaryPath = `${this.filePath}.tmp`;
    writeFileSync(
      temporaryPath,
      retained.map((entry) => JSON.stringify(entry)).join("\n") + (retained.length > 0 ? "\n" : ""),
      { encoding: "utf8", mode: 0o600 },
    );
    renameSync(temporaryPath, this.filePath);
  }

  public list(input: { projectId?: string; limit?: number } = {}): ProjectCallAuditRecord[] {
    const filtered = input.projectId
      ? this.readAll().filter((record) => record.projectId === input.projectId)
      : this.readAll();
    return filtered.slice(-(input.limit ?? this.maxEntries));
  }

  private readAll(): ProjectCallAuditRecord[] {
    if (!existsSync(this.filePath)) return [];
    return readFileSync(this.filePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as ProjectCallAuditRecord];
        } catch {
          return [];
        }
      });
  }
}
