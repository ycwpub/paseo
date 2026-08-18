import { z } from "zod";
import type { PaseoMemoryScope } from "@getpaseo/protocol/messages";
import { evaluateMemoryExtractionCandidate } from "../memory/memory-extraction-policy.js";
import { normalizeMemorySettings } from "../memory/memory-model.js";
import type { PaseoMemoryStore } from "../memory/memory-store.js";
import type { PluginWorkflowMemoryWriter } from "./plugin-http-runtime-types.js";

const PluginMemoryTargetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }).strict(),
  z.object({ type: z.literal("project"), id: z.string().trim().min(1) }).strict(),
  z.object({ type: z.literal("assistant"), id: z.string().trim().min(1) }).strict(),
]);

const PluginMemoryEntrySchema = z
  .object({
    title: z.string().trim().min(1).max(256),
    category: z
      .enum(["preference", "fact", "procedure", "decision", "project", "other"])
      .default("project"),
    content: z.string().trim().min(1).max(8_000),
    keywords: z.array(z.string().trim().min(1).max(128)).max(20).default([]),
    confidence: z.number().min(0).max(1).default(0.9),
    importance: z.number().min(0).max(1).default(0.7),
    validUntil: z.string().nullable().optional(),
  })
  .strict();

const PluginMemoryPayloadSchema = z
  .object({
    targets: z.array(PluginMemoryTargetSchema).max(8),
    entries: z.array(PluginMemoryEntrySchema).max(32),
  })
  .strict();

function readObjectPath(value: unknown, pathText: string): unknown {
  let current = value;
  for (const segment of pathText.split(".").filter(Boolean)) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function scopeKey(scope: PaseoMemoryScope): string {
  return scope.type === "global" ? "global" : `${scope.type}:${scope.id}`;
}

export class PluginWorkflowMemoryStoreWriter implements PluginWorkflowMemoryWriter {
  constructor(private readonly store: PaseoMemoryStore) {}

  async write(input: {
    pluginId: string;
    serviceName: string;
    outputPath: string;
    result: unknown;
  }): Promise<void> {
    const payload = PluginMemoryPayloadSchema.parse(readObjectPath(input.result, input.outputPath));
    const settings = normalizeMemorySettings(this.store.getState().settings);
    const targets = Array.from(
      new Map(payload.targets.map((scope) => [scopeKey(scope), scope])).values(),
    );
    for (const target of targets) {
      for (const entry of payload.entries) {
        const decision = evaluateMemoryExtractionCandidate({
          candidate: entry,
          explicit: true,
          settings,
        });
        if (!decision.accepted) continue;
        this.store.upsertExtractedMemory({
          ...entry,
          content: decision.content,
          scope: target,
          origin: "explicit",
          sensitive: decision.sensitive,
          sourceAgentId: `plugin:${input.pluginId}/${input.serviceName}`,
        });
      }
    }
  }
}
