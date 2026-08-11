import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type pino from "pino";

import { ensurePrivateFile, writePrivateFileAtomicSync } from "./private-files.js";

export type ClientAccessClientType = "mobile" | "browser" | "cli" | "mcp";
export type ClientAccessTransport = "direct" | "relay";
export type ClientAccessPeer = "loopback" | "local_ipc" | "external";

export interface ApprovedClientAccessRecord {
  clientId: string;
  clientName: string | null;
  clientHostname: string | null;
  clientType: ClientAccessClientType;
  appVersion: string | null;
  remoteAddress: string | null;
  remotePort: number | null;
  transport: ClientAccessTransport;
  peer: ClientAccessPeer;
  requestedAt: string;
  approvedAt: string;
  lastConnectedAt: string | null;
  paused: boolean;
}

export interface ClientAccessHistoryRecord {
  id: string;
  clientId: string;
  clientName: string | null;
  clientHostname: string | null;
  clientType: ClientAccessClientType;
  appVersion: string | null;
  remoteAddress: string | null;
  remotePort: number | null;
  transport: ClientAccessTransport;
  peer: ClientAccessPeer;
  connectedAt: string;
  disconnectedAt: string | null;
}

interface PersistedClientAccessFile {
  version: 1;
  approvedClients: ApprovedClientAccessRecord[];
  history: ClientAccessHistoryRecord[];
}

const HISTORY_RETENTION_DAYS = 30;
const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

// oxlint-disable-next-line complexity
function normalizeRecord(value: unknown): ApprovedClientAccessRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const clientId = typeof record.clientId === "string" ? record.clientId.trim() : "";
  const clientType = record.clientType;
  const transport = record.transport;
  const peer = record.peer;
  const requestedAt = typeof record.requestedAt === "string" ? record.requestedAt : "";
  const approvedAt = typeof record.approvedAt === "string" ? record.approvedAt : "";
  if (
    !clientId ||
    !["mobile", "browser", "cli", "mcp"].includes(String(clientType)) ||
    !["direct", "relay"].includes(String(transport)) ||
    !["loopback", "local_ipc", "external"].includes(String(peer)) ||
    !requestedAt ||
    !approvedAt
  ) {
    return null;
  }
  return {
    clientId,
    clientName:
      typeof record.clientName === "string" && record.clientName.trim()
        ? record.clientName.trim()
        : null,
    clientHostname:
      typeof record.clientHostname === "string" && record.clientHostname.trim()
        ? record.clientHostname.trim()
        : null,
    clientType: clientType as ClientAccessClientType,
    appVersion: typeof record.appVersion === "string" ? record.appVersion : null,
    remoteAddress:
      typeof record.remoteAddress === "string" && record.remoteAddress.trim()
        ? record.remoteAddress.trim()
        : null,
    remotePort:
      typeof record.remotePort === "number" &&
      Number.isInteger(record.remotePort) &&
      record.remotePort >= 0 &&
      record.remotePort <= 65535
        ? record.remotePort
        : null,
    transport: transport as ClientAccessTransport,
    peer: peer as ClientAccessPeer,
    requestedAt,
    approvedAt,
    lastConnectedAt:
      typeof record.lastConnectedAt === "string" && record.lastConnectedAt
        ? record.lastConnectedAt
        : null,
    paused: record.paused === true,
  };
}

// oxlint-disable-next-line complexity
function normalizeHistoryRecord(value: unknown): ClientAccessHistoryRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const clientType = record.clientType;
  const transport = record.transport;
  const peer = record.peer;
  if (
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.clientId !== "string" ||
    !record.clientId ||
    !["mobile", "browser", "cli", "mcp"].includes(String(clientType)) ||
    !["direct", "relay"].includes(String(transport)) ||
    !["loopback", "local_ipc", "external"].includes(String(peer)) ||
    typeof record.connectedAt !== "string" ||
    !record.connectedAt
  ) {
    return null;
  }
  return {
    id: record.id,
    clientId: record.clientId,
    clientName: typeof record.clientName === "string" ? record.clientName : null,
    clientHostname: typeof record.clientHostname === "string" ? record.clientHostname : null,
    clientType: clientType as ClientAccessClientType,
    appVersion: typeof record.appVersion === "string" ? record.appVersion : null,
    remoteAddress: typeof record.remoteAddress === "string" ? record.remoteAddress : null,
    remotePort:
      typeof record.remotePort === "number" &&
      Number.isInteger(record.remotePort) &&
      record.remotePort >= 0 &&
      record.remotePort <= 65535
        ? record.remotePort
        : null,
    transport: transport as ClientAccessTransport,
    peer: peer as ClientAccessPeer,
    connectedAt: record.connectedAt,
    disconnectedAt:
      typeof record.disconnectedAt === "string" && record.disconnectedAt
        ? record.disconnectedAt
        : null,
  };
}

export class ClientAccessStore {
  private readonly logger: pino.Logger;
  private readonly filePath: string;
  private readonly approvedClients = new Map<string, ApprovedClientAccessRecord>();
  private readonly history: ClientAccessHistoryRecord[] = [];
  private readonly historyCleanupInterval: ReturnType<typeof setInterval>;

  constructor(logger: pino.Logger, filePath: string) {
    this.logger = logger.child({ component: "client-access-store" });
    this.filePath = filePath;
    this.loadFromDisk();
    this.historyCleanupInterval = setInterval(() => this.pruneHistory(), 60 * 60 * 1000);
    this.historyCleanupInterval.unref?.();
  }

  isApproved(clientId: string): boolean {
    return this.approvedClients.get(clientId.trim())?.paused === false;
  }

  isPaused(clientId: string): boolean {
    return this.approvedClients.get(clientId.trim())?.paused === true;
  }

  get(clientId: string): ApprovedClientAccessRecord | null {
    return this.approvedClients.get(clientId.trim()) ?? null;
  }

  listApproved(): ApprovedClientAccessRecord[] {
    return Array.from(this.approvedClients.values()).sort((left, right) =>
      right.approvedAt.localeCompare(left.approvedAt),
    );
  }

  approve(
    record: Omit<
      ApprovedClientAccessRecord,
      | "approvedAt"
      | "lastConnectedAt"
      | "paused"
      | "remoteAddress"
      | "remotePort"
      | "clientHostname"
    > &
      Partial<
        Pick<
          ApprovedClientAccessRecord,
          "lastConnectedAt" | "remoteAddress" | "remotePort" | "clientHostname"
        >
      >,
    approvedAt = new Date().toISOString(),
  ): ApprovedClientAccessRecord {
    const clientId = record.clientId.trim();
    const existing = this.approvedClients.get(clientId);
    const approved: ApprovedClientAccessRecord = {
      ...record,
      clientId,
      clientHostname: record.clientHostname?.trim() || null,
      remoteAddress: record.remoteAddress ?? null,
      remotePort: record.remotePort ?? null,
      approvedAt,
      lastConnectedAt: record.lastConnectedAt ?? existing?.lastConnectedAt ?? null,
      paused: false,
    };
    this.approvedClients.set(approved.clientId, approved);
    this.persist();
    return approved;
  }

  markConnected(
    clientId: string,
    connectedAt = new Date().toISOString(),
  ): ApprovedClientAccessRecord | null {
    const normalizedClientId = clientId.trim();
    const existing = this.approvedClients.get(normalizedClientId);
    if (!existing) return null;
    const updated = { ...existing, lastConnectedAt: connectedAt };
    this.approvedClients.set(normalizedClientId, updated);
    this.persist();
    return updated;
  }

  setPaused(clientId: string, paused: boolean): ApprovedClientAccessRecord | null {
    const normalizedClientId = clientId.trim();
    const existing = this.approvedClients.get(normalizedClientId);
    if (!existing) return null;
    const updated = { ...existing, paused };
    this.approvedClients.set(normalizedClientId, updated);
    this.persist();
    return updated;
  }

  delete(clientId: string): boolean {
    const deleted = this.approvedClients.delete(clientId.trim());
    if (deleted) this.persist();
    return deleted;
  }

  startConnection(
    record: Omit<ClientAccessHistoryRecord, "id" | "connectedAt" | "disconnectedAt">,
    connectedAt = new Date().toISOString(),
  ): string {
    const historyRecord: ClientAccessHistoryRecord = {
      ...record,
      id: `clih_${randomUUID().split("-").join("")}`,
      connectedAt,
      disconnectedAt: null,
    };
    this.history.unshift(historyRecord);
    this.pruneHistory(false);
    this.persist();
    return historyRecord.id;
  }

  endConnection(historyId: string, disconnectedAt = new Date().toISOString()): boolean {
    const record = this.history.find((candidate) => candidate.id === historyId.trim());
    if (!record || record.disconnectedAt) return false;
    record.disconnectedAt = disconnectedAt;
    this.persist();
    return true;
  }

  listHistory(): ClientAccessHistoryRecord[] {
    this.pruneHistory();
    return [...this.history].sort((left, right) =>
      right.connectedAt.localeCompare(left.connectedAt),
    );
  }

  deleteHistory(historyId: string): boolean {
    const index = this.history.findIndex((record) => record.id === historyId.trim());
    if (index < 0) return false;
    this.history.splice(index, 1);
    this.persist();
    return true;
  }

  private loadFromDisk(): void {
    try {
      if (!existsSync(this.filePath)) return;
      ensurePrivateFile(this.filePath);
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as {
        approvedClients?: unknown;
        history?: unknown;
      };
      if (Array.isArray(parsed.approvedClients)) {
        for (const value of parsed.approvedClients) {
          const record = normalizeRecord(value);
          if (record) this.approvedClients.set(record.clientId, record);
        }
      }
      const loadedAt = new Date().toISOString();
      if (Array.isArray(parsed.history)) {
        for (const value of parsed.history) {
          const record = normalizeHistoryRecord(value);
          if (record) {
            this.history.push({
              ...record,
              disconnectedAt: record.disconnectedAt ?? loadedAt,
            });
          }
        }
      }
      this.pruneHistory(false);
      this.logger.info({ total: this.approvedClients.size }, "Loaded approved clients");
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to load approved clients");
    }
  }

  private persist(): void {
    try {
      const payload: PersistedClientAccessFile = {
        version: 1,
        approvedClients: this.listApproved(),
        history: [...this.history],
      };
      writePrivateFileAtomicSync(this.filePath, `${JSON.stringify(payload, null, 2)}\n`);
    } catch (error) {
      this.logger.warn({ err: error }, "Failed to persist approved clients");
    }
  }

  private pruneHistory(persist = true): void {
    const cutoff = Date.now() - HISTORY_RETENTION_MS;
    const retained = this.history.filter((record) => {
      if (!record.disconnectedAt) return true;
      const disconnectedAt = Date.parse(record.disconnectedAt);
      return !Number.isFinite(disconnectedAt) || disconnectedAt >= cutoff;
    });
    if (retained.length === this.history.length) return;
    this.history.splice(0, this.history.length, ...retained);
    if (persist) this.persist();
  }
}

export { HISTORY_RETENTION_DAYS as CLIENT_ACCESS_HISTORY_RETENTION_DAYS };
