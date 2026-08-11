import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { AssistantStore } from "../assistants/assistant-store.js";
import { resolveTeamAssistantIds, TeamStore } from "./team-store.js";

describe("TeamStore", () => {
  let paseoHome: string;
  let assistants: AssistantStore;
  let store: TeamStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-team-store-"));
    const logger = pino({ level: "silent" });
    assistants = new AssistantStore({ paseoHome, logger });
    store = new TeamStore({ paseoHome, logger, assistantStore: assistants });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("creates and updates a team with one leader and multiple assistants", () => {
    const leader = assistants.create({ name: "Lead", prompt: "Plan and delegate." });
    const implementer = assistants.create({ name: "Implementer", prompt: "Implement tasks." });
    const reviewer = assistants.create({ name: "Reviewer", prompt: "Review changes." });

    const created = store.create({
      name: "Delivery",
      leaderAssistantId: leader.id,
      assistantIds: [leader.id, implementer.id],
      memberSettings: {
        [implementer.id]: {
          provider: "codex",
          model: "gpt-5.4",
          thinkingOptionId: "high",
        },
      },
    });

    expect(resolveTeamAssistantIds(created)).toEqual([leader.id, implementer.id]);
    expect(created.assistants).toEqual([
      expect.objectContaining({ assistantId: leader.id, role: "leader", assistantName: "Lead" }),
      expect.objectContaining({
        assistantId: implementer.id,
        role: "teammate",
        assistantName: "Implementer",
        provider: "codex",
        model: "gpt-5.4",
        thinkingOptionId: "high",
      }),
    ]);

    const updated = store.update({
      id: created.id,
      assistantIds: [leader.id, implementer.id, reviewer.id],
      leaderAssistantId: reviewer.id,
    });
    expect(updated?.leaderAssistantId).toBe(reviewer.id);
    expect(updated?.assistants.find((member) => member.assistantId === reviewer.id)?.role).toBe(
      "leader",
    );
    expect(
      updated?.assistants.find((member) => member.assistantId === implementer.id),
    ).toMatchObject({
      provider: "codex",
      model: "gpt-5.4",
      thinkingOptionId: "high",
    });

    const cleared = store.update({
      id: created.id,
      memberSettings: {},
    });
    expect(cleared?.assistants.find((member) => member.assistantId === implementer.id)?.model).toBe(
      undefined,
    );
    expect(
      cleared?.assistants.find((member) => member.assistantId === implementer.id)?.provider,
    ).toBeUndefined();
    expect(
      cleared?.assistants.find((member) => member.assistantId === implementer.id)?.thinkingOptionId,
    ).toBeUndefined();
    expect(store.isAssistantInUse(leader.id)).toBe(true);
    expect(store.isAssistantInUse("missing")).toBe(false);
  });

  test("rejects invalid membership", () => {
    const leader = assistants.create({ name: "Lead", prompt: "Lead." });
    const teammate = assistants.create({ name: "Teammate", prompt: "Work." });

    expect(() =>
      store.create({
        name: "Too small",
        leaderAssistantId: leader.id,
        assistantIds: [leader.id],
      }),
    ).toThrow(/assistantIds|>=2/);
    expect(() =>
      store.create({
        name: "Wrong leader",
        leaderAssistantId: "missing",
        assistantIds: [leader.id, teammate.id],
      }),
    ).toThrow("leader must be a team member");
    expect(() =>
      store.create({
        name: "Unknown settings member",
        leaderAssistantId: leader.id,
        assistantIds: [leader.id, teammate.id],
        memberSettings: {
          missing: { model: "codex/gpt-5.4" },
        },
      }),
    ).toThrow("is not a team member");
  });
});
