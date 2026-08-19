import { randomUUID } from "node:crypto";
import type { PaseoMemoryUser, PaseoMemoryUserOperation } from "@getpaseo/protocol/messages";

export const DEFAULT_MEMORY_USER_ID = "default";
export const DEFAULT_MEMORY_USER_NAME = "默认用户";

export interface MemoryUserState {
  users: PaseoMemoryUser[];
  activeUserId: string;
}

export function createDefaultMemoryUser(timestamp = new Date().toISOString()): PaseoMemoryUser {
  return {
    id: DEFAULT_MEMORY_USER_ID,
    name: DEFAULT_MEMORY_USER_NAME,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeMemoryUsers(
  users: readonly PaseoMemoryUser[] | undefined,
  activeUserId: string | undefined,
): MemoryUserState {
  const normalizedUsers = users?.length ? [...users] : [createDefaultMemoryUser()];
  const selectedId = normalizedUsers.some((user) => user.id === activeUserId)
    ? activeUserId!
    : normalizedUsers[0]!.id;
  return { users: normalizedUsers, activeUserId: selectedId };
}

export function applyMemoryUserOperation(
  state: MemoryUserState,
  operation: PaseoMemoryUserOperation,
  timestamp = new Date().toISOString(),
): MemoryUserState {
  if (operation.type === "create") {
    const name = requireUserName(operation.name);
    requireUniqueUserName(state.users, name);
    const user: PaseoMemoryUser = {
      id: `user-${randomUUID()}`,
      name,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return { users: [...state.users, user], activeUserId: user.id };
  }

  const userIndex = state.users.findIndex((user) => user.id === operation.id);
  if (userIndex < 0) throw new Error(`Memory user ${operation.id} not found`);

  if (operation.type === "select") {
    return { ...state, activeUserId: operation.id };
  }
  if (operation.type === "rename") {
    const name = requireUserName(operation.name);
    requireUniqueUserName(state.users, name, operation.id);
    const users = [...state.users];
    users[userIndex] = {
      ...users[userIndex]!,
      name,
      updatedAt: timestamp,
    };
    return { ...state, users };
  }
  if (state.users.length === 1) {
    throw new Error("At least one global memory user must remain");
  }
  const users = state.users.filter((user) => user.id !== operation.id);
  return {
    users,
    activeUserId: state.activeUserId === operation.id ? users[0]!.id : state.activeUserId,
  };
}

function requireUserName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("Memory user name is required");
  if (name.length > 80) throw new Error("Memory user name must be 80 characters or fewer");
  return name;
}

function requireUniqueUserName(
  users: readonly PaseoMemoryUser[],
  name: string,
  excludedId?: string,
): void {
  const normalized = name.toLocaleLowerCase();
  if (
    users.some(
      (user) => user.id !== excludedId && user.name.trim().toLocaleLowerCase() === normalized,
    )
  ) {
    throw new Error(`Memory user name "${name}" already exists`);
  }
}
