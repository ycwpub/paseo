import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { SkillSession } from "./skill-session.js";
import { SkillStore } from "./skill-store.js";

describe("SkillSession", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  test("refreshes shared resources before returning the skill list", async () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-skill-session-"));
    const store = new SkillStore({ paseoHome: tempRoot, logger: createTestLogger() });
    const emitted: SessionOutboundMessage[] = [];
    const refreshSharedResources = vi.fn(() => {
      store.create({
        name: "new-skill",
        content: "---\nname: new-skill\n---\n",
      });
    });
    const session = new SkillSession({
      host: { emit: (message) => emitted.push(message) },
      store,
      refreshSharedResources,
      logger: createTestLogger(),
    });

    await session.handleRequest({
      type: "skill.list.request",
      requestId: "request-1",
      refresh: true,
    });

    expect(refreshSharedResources).toHaveBeenCalledOnce();
    expect(emitted).toContainEqual({
      type: "skill.list.response",
      payload: {
        requestId: "request-1",
        skills: [expect.objectContaining({ name: "new-skill" })],
        error: null,
      },
    });
  });
});
