import type {
  PaseoMemoryPolicy,
  PaseoMemoryScope,
  PaseoMemoryScopePolicy,
  PaseoMemorySyncOrigin,
  PaseoMemoryUser,
} from "@getpaseo/protocol/messages";

const SUMMARY_INDEX_MARKER = "<!-- paseo:memory-detail-index -->";

function deterministicWinner<T>(left: T, right: T): T {
  return JSON.stringify(left).localeCompare(JSON.stringify(right)) >= 0 ? left : right;
}

function newerUser(left: PaseoMemoryUser, right: PaseoMemoryUser): PaseoMemoryUser {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt > right.updatedAt ? left : right;
  }
  return deterministicWinner(left, right);
}

function normalizedUserName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function mergeMemorySyncUsers(
  localUsers: readonly PaseoMemoryUser[],
  incomingUsers: readonly PaseoMemoryUser[],
): { users: PaseoMemoryUser[]; incomingUserIdMap: Map<string, string> } {
  const users = [...localUsers];
  const incomingUserIdMap = new Map<string, string>();

  for (const incoming of incomingUsers) {
    const byId = users.findIndex((user) => user.id === incoming.id);
    if (byId >= 0) {
      users[byId] = newerUser(users[byId]!, incoming);
      incomingUserIdMap.set(incoming.id, users[byId]!.id);
      continue;
    }
    const byName = users.findIndex(
      (user) => normalizedUserName(user.name) === normalizedUserName(incoming.name),
    );
    if (byName >= 0) {
      users[byName] = newerUser(users[byName]!, { ...incoming, id: users[byName]!.id });
      incomingUserIdMap.set(incoming.id, users[byName]!.id);
      continue;
    }
    users.push(incoming);
    incomingUserIdMap.set(incoming.id, incoming.id);
  }

  return { users, incomingUserIdMap };
}

function summaryPrefix(value: string): string {
  const markerIndex = value.indexOf(SUMMARY_INDEX_MARKER);
  return (markerIndex >= 0 ? value.slice(0, markerIndex) : value).trim();
}

function summaryBlocks(value: string): string[] {
  return summaryPrefix(value)
    .split(/\n{2,}/u)
    .map((block) => block.trim())
    .filter(Boolean);
}

export function mergeMemorySyncSummaries(local: string, incoming: string): string {
  const blocks = new Map<string, string>();
  for (const block of [...summaryBlocks(local), ...summaryBlocks(incoming)]) {
    const key = block.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
    if (!blocks.has(key)) blocks.set(key, block);
  }
  return [...blocks.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([, block]) => block)
    .join("\n\n");
}

function policyKey(policy: PaseoMemoryPolicy): string {
  return `${policy.target.type}:${policy.target.id}`;
}

export function mergeMemorySyncPolicies(
  local: readonly PaseoMemoryPolicy[],
  incoming: readonly PaseoMemoryPolicy[],
): PaseoMemoryPolicy[] {
  const byKey = new Map(local.map((policy) => [policyKey(policy), policy]));
  for (const policy of incoming) {
    const key = policyKey(policy);
    const current = byKey.get(key);
    byKey.set(key, current ? deterministicWinner(current, policy) : policy);
  }
  return [...byKey.values()].toSorted((left, right) =>
    policyKey(left).localeCompare(policyKey(right)),
  );
}

function scopeKey(scope: PaseoMemoryScope): string {
  return `${scope.type}:${scope.id ?? ""}`;
}

export function remapMemorySyncScope(
  scope: PaseoMemoryScope | undefined,
  incomingUserIdMap: ReadonlyMap<string, string>,
): PaseoMemoryScope | undefined {
  if (scope?.type !== "global" || !scope.id) return scope;
  return { ...scope, id: incomingUserIdMap.get(scope.id) ?? scope.id };
}

export function mergeMemorySyncScopePolicies(
  local: readonly PaseoMemoryScopePolicy[],
  incoming: readonly PaseoMemoryScopePolicy[],
  incomingUserIdMap: ReadonlyMap<string, string>,
): PaseoMemoryScopePolicy[] {
  const byKey = new Map(local.map((policy) => [scopeKey(policy.scope), policy]));
  for (const rawPolicy of incoming) {
    const policy = {
      ...rawPolicy,
      scope: remapMemorySyncScope(rawPolicy.scope, incomingUserIdMap) ?? rawPolicy.scope,
    };
    const key = scopeKey(policy.scope);
    const current = byKey.get(key);
    byKey.set(key, current ? deterministicWinner(current, policy) : policy);
  }
  return [...byKey.values()].toSorted((left, right) =>
    scopeKey(left.scope).localeCompare(scopeKey(right.scope)),
  );
}

export function memorySyncOriginKey(origin: PaseoMemorySyncOrigin): string {
  return `${origin.hostId}\u0000${origin.memoryId}`;
}

export function localMemorySyncOrigin(
  hostId: string,
  detail: { id: string; syncOrigin?: PaseoMemorySyncOrigin },
): PaseoMemorySyncOrigin {
  return detail.syncOrigin ?? { hostId, memoryId: detail.id };
}

export function incomingMemoryVersionWins(
  local: { updatedAt: string; value: unknown },
  incoming: { updatedAt: string; value: unknown },
): boolean {
  if (local.updatedAt !== incoming.updatedAt) return incoming.updatedAt > local.updatedAt;
  return JSON.stringify(incoming.value).localeCompare(JSON.stringify(local.value)) > 0;
}
