import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import type { SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { AssistantSession } from "./assistant-session.js";
import { AssistantStore } from "./assistant-store.js";

describe("AssistantSession", () => {
  let paseoHome: string;
  let store: AssistantStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-assistant-session-"));
    store = new AssistantStore({ paseoHome, logger: pino({ level: "silent" }) });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("does not delete an assistant that belongs to a team", async () => {
    const assistant = store.create({ name: "Lead", prompt: "Lead." });
    const messages: SessionOutboundMessage[] = [];
    const session = new AssistantSession({
      host: { emit: (message) => messages.push(message) },
      store,
      isAssistantInUse: (assistantId) => assistantId === assistant.id,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "assistant.delete.request",
      requestId: "delete-lead",
      id: assistant.id,
    });

    expect(store.get(assistant.id)).not.toBeNull();
    expect(messages.at(-1)).toMatchObject({
      type: "assistant.delete.response",
      payload: {
        requestId: "delete-lead",
        id: assistant.id,
        ok: false,
        error: "Remove this assistant from its teams before deleting it",
      },
    });
  });
});
