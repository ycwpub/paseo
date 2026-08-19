export type IslandNotificationKind = "running" | "finished" | "error" | "permission" | "info";

export interface IslandNotificationInput {
  id?: unknown;
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  data?: unknown;
  durationMs?: unknown;
}

export interface IslandNotification {
  id: string;
  kind: IslandNotificationKind;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
}

export function shouldAutoDismissIslandNotification(kind: IslandNotificationKind): boolean {
  void kind;
  return false;
}

const KIND_PRIORITY: Record<IslandNotificationKind, number> = {
  permission: 5,
  error: 4,
  finished: 3,
  running: 2,
  info: 1,
};

const DEFAULT_DURATION_MS: Record<IslandNotificationKind, number> = {
  permission: 30_000,
  error: 12_000,
  finished: 8_000,
  running: 8_000,
  info: 8_000,
};

const MIN_DURATION_MS = 2_000;
const MAX_DURATION_MS = 60_000;
const MAX_NOTIFICATION_COUNT = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toKind(value: unknown): IslandNotificationKind {
  if (
    value === "running" ||
    value === "finished" ||
    value === "error" ||
    value === "permission" ||
    value === "info"
  ) {
    return value;
  }
  return "info";
}

function toDurationMs(value: unknown, kind: IslandNotificationKind): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_DURATION_MS[kind];
  }
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(value)));
}

export function parseIslandNotification(
  input: IslandNotificationInput | undefined,
  now: number,
  createId: () => string,
): IslandNotification | null {
  const title = toTrimmedString(input?.title);
  if (!title) {
    return null;
  }
  const kind = toKind(input?.kind);
  const id = toTrimmedString(input?.id) ?? createId();
  const body = toTrimmedString(input?.body) ?? "";
  const data = isRecord(input?.data) ? input.data : undefined;
  return {
    id,
    kind,
    title,
    body,
    ...(data ? { data } : {}),
    durationMs: toDurationMs(input?.durationMs, kind),
    createdAt: now,
    updatedAt: now,
  };
}

export class IslandNotificationQueue {
  readonly #notifications = new Map<string, IslandNotification>();

  upsert(notification: IslandNotification): void {
    const previous = this.#notifications.get(notification.id);
    this.#notifications.set(notification.id, {
      ...notification,
      createdAt: previous?.createdAt ?? notification.createdAt,
    });
    this.#trim();
  }

  remove(id: string): boolean {
    return this.#notifications.delete(id);
  }

  clear(): void {
    this.#notifications.clear();
  }

  get(id: string): IslandNotification | null {
    return this.#notifications.get(id) ?? null;
  }

  list(): IslandNotification[] {
    return [...this.#notifications.values()].sort((left, right) => {
      const priorityDifference = KIND_PRIORITY[right.kind] - KIND_PRIORITY[left.kind];
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      return right.updatedAt - left.updatedAt;
    });
  }

  current(): IslandNotification | null {
    return this.list()[0] ?? null;
  }

  #trim(): void {
    if (this.#notifications.size <= MAX_NOTIFICATION_COUNT) {
      return;
    }
    const keep = new Set(
      this.list()
        .slice(0, MAX_NOTIFICATION_COUNT)
        .map((item) => item.id),
    );
    for (const id of this.#notifications.keys()) {
      if (!keep.has(id)) {
        this.#notifications.delete(id);
      }
    }
  }
}
