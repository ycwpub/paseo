import { z } from "zod";

export const DaemonClientAccessListRequestSchema = z.object({
  type: z.literal("daemon.client_access.list.request"),
  requestId: z.string(),
});

export const DaemonClientAccessApproveRequestSchema = z.object({
  type: z.literal("daemon.client_access.approve.request"),
  requestId: z.string(),
  clientId: z.string().trim().min(1),
});

export const DaemonClientAccessSetPausedRequestSchema = z.object({
  type: z.literal("daemon.client_access.set_paused.request"),
  requestId: z.string(),
  clientId: z.string().trim().min(1),
  paused: z.boolean(),
});

export const DaemonClientAccessDeleteRequestSchema = z.object({
  type: z.literal("daemon.client_access.delete.request"),
  requestId: z.string(),
  clientId: z.string().trim().min(1),
});

export const DaemonClientAccessHistoryDeleteRequestSchema = z.object({
  type: z.literal("daemon.client_access.history.delete.request"),
  requestId: z.string(),
  historyId: z.string().trim().min(1),
});

export const DaemonRelayHistoryDeleteRequestSchema = z.object({
  type: z.literal("daemon.relay_history.delete.request"),
  requestId: z.string(),
  historyId: z.string().trim().min(1),
});

export const DaemonClientAccessEntrySchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().nullable(),
  clientHostname: z.string().nullable().default(null),
  clientType: z.enum(["mobile", "browser", "cli", "mcp"]),
  appVersion: z.string().nullable(),
  remoteAddress: z.string().nullable().default(null),
  remotePort: z.number().int().min(0).max(65535).nullable().default(null),
  transport: z.enum(["direct", "relay"]),
  peer: z.enum(["loopback", "local_ipc", "external"]),
  status: z.enum(["pending", "allowed", "approved", "paused"]),
  requestedAt: z.string(),
  approvedAt: z.string().nullable(),
  lastConnectedAt: z.string().nullable().default(null),
  connected: z.boolean(),
});

export type DaemonClientAccessEntry = z.infer<typeof DaemonClientAccessEntrySchema>;

export const DaemonClientAccessHistoryEntrySchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  clientName: z.string().nullable(),
  clientHostname: z.string().nullable().default(null),
  clientType: z.enum(["mobile", "browser", "cli", "mcp"]),
  appVersion: z.string().nullable(),
  remoteAddress: z.string().nullable().default(null),
  remotePort: z.number().int().min(0).max(65535).nullable().default(null),
  transport: z.enum(["direct", "relay"]),
  peer: z.enum(["loopback", "local_ipc", "external"]),
  connectedAt: z.string(),
  disconnectedAt: z.string().nullable(),
});

export type DaemonClientAccessHistoryEntry = z.infer<typeof DaemonClientAccessHistoryEntrySchema>;

export const DaemonClientAccessListResponseSchema = z.object({
  type: z.literal("daemon.client_access.list.response"),
  payload: z.object({
    requestId: z.string(),
    clients: z.array(DaemonClientAccessEntrySchema),
    history: z.array(DaemonClientAccessHistoryEntrySchema).optional(),
    historyRetentionDays: z.number().int().positive().optional(),
  }),
});

export const DaemonClientAccessApproveResponseSchema = z.object({
  type: z.literal("daemon.client_access.approve.response"),
  payload: z.object({
    requestId: z.string(),
    client: DaemonClientAccessEntrySchema.nullable(),
    success: z.boolean(),
    error: z.string().nullable(),
  }),
});

export const DaemonClientAccessSetPausedResponseSchema = z.object({
  type: z.literal("daemon.client_access.set_paused.response"),
  payload: z.object({
    requestId: z.string(),
    client: DaemonClientAccessEntrySchema.nullable(),
    success: z.boolean(),
    error: z.string().nullable(),
  }),
});

export const DaemonClientAccessDeleteResponseSchema = z.object({
  type: z.literal("daemon.client_access.delete.response"),
  payload: z.object({
    requestId: z.string(),
    clientId: z.string(),
    success: z.boolean(),
    error: z.string().nullable(),
  }),
});

export const DaemonClientAccessHistoryDeleteResponseSchema = z.object({
  type: z.literal("daemon.client_access.history.delete.response"),
  payload: z.object({
    requestId: z.string(),
    historyId: z.string(),
    success: z.boolean(),
    error: z.string().nullable(),
  }),
});

export const DaemonRelayHistoryDeleteResponseSchema = z.object({
  type: z.literal("daemon.relay_history.delete.response"),
  payload: z.object({
    requestId: z.string(),
    historyId: z.string(),
    success: z.boolean(),
    error: z.string().nullable(),
  }),
});
