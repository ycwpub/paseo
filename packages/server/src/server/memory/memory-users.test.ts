import { describe, expect, test } from "vitest";
import {
  applyMemoryUserOperation,
  createDefaultMemoryUser,
  normalizeMemoryUsers,
} from "./memory-users.js";

describe("memory users", () => {
  test("normalizes an empty user collection to the default user", () => {
    const state = normalizeMemoryUsers(undefined, undefined);
    expect(state.activeUserId).toBe("default");
    expect(state.users).toEqual([expect.objectContaining({ id: "default", name: "默认用户" })]);
  });

  test("creates, selects, and renames users", () => {
    const initial = {
      users: [createDefaultMemoryUser("2026-08-19T00:00:00.000Z")],
      activeUserId: "default",
    };
    const created = applyMemoryUserOperation(
      initial,
      { type: "create", name: "袁昌旺" },
      "2026-08-19T01:00:00.000Z",
    );
    expect(created.users).toHaveLength(2);
    expect(created.activeUserId).not.toBe("default");
    expect(created.users[1]).toMatchObject({
      name: "袁昌旺",
      createdAt: "2026-08-19T01:00:00.000Z",
    });

    const renamed = applyMemoryUserOperation(
      created,
      { type: "rename", id: created.activeUserId, name: "新名称" },
      "2026-08-19T02:00:00.000Z",
    );
    expect(renamed.users[1]).toMatchObject({
      name: "新名称",
      updatedAt: "2026-08-19T02:00:00.000Z",
    });
    expect(applyMemoryUserOperation(renamed, { type: "select", id: "default" }).activeUserId).toBe(
      "default",
    );
  });

  test("rejects duplicate user names", () => {
    const initial = {
      users: [createDefaultMemoryUser("2026-08-19T00:00:00.000Z")],
      activeUserId: "default",
    };
    expect(() => applyMemoryUserOperation(initial, { type: "create", name: " 默认用户 " })).toThrow(
      'Memory user name "默认用户" already exists',
    );
  });
});
