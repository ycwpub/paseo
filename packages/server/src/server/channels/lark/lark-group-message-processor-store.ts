import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  LarkGroupMessageProcessorCreateInputSchema,
  LarkGroupMessageProcessorSchema,
  LarkGroupMessageProcessorUpdateInputSchema,
  type LarkGroupMessageProcessor,
  type LarkGroupMessageProcessorCreateInput,
  type LarkGroupMessageProcessorUpdateInput,
} from "@getpaseo/protocol/messages";

import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";

const STORE_VERSION = 1;
const PayloadSchema = z.object({
  version: z.literal(STORE_VERSION),
  processors: z.array(LarkGroupMessageProcessorSchema),
});
type Payload = z.infer<typeof PayloadSchema>;

function cloneProcessor(processor: LarkGroupMessageProcessor): LarkGroupMessageProcessor {
  return LarkGroupMessageProcessorSchema.parse(JSON.parse(JSON.stringify(processor)));
}

export class LarkGroupMessageProcessorStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: Payload = { version: STORE_VERSION, processors: [] };

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "channels", "lark-group-processors.json");
  }

  list(): LarkGroupMessageProcessor[] {
    this.ensureLoaded();
    return this.payload.processors
      .map(cloneProcessor)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  get(id: string): LarkGroupMessageProcessor | null {
    this.ensureLoaded();
    const processor = this.payload.processors.find((entry) => entry.id === id);
    return processor ? cloneProcessor(processor) : null;
  }

  create(input: LarkGroupMessageProcessorCreateInput, now: string): LarkGroupMessageProcessor {
    this.ensureLoaded();
    const processor = LarkGroupMessageProcessorSchema.parse({
      ...LarkGroupMessageProcessorCreateInputSchema.parse(input),
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    this.persist([...this.payload.processors, processor]);
    return cloneProcessor(processor);
  }

  update(
    id: string,
    input: LarkGroupMessageProcessorUpdateInput,
    now: string,
  ): LarkGroupMessageProcessor | null {
    this.ensureLoaded();
    const index = this.payload.processors.findIndex((entry) => entry.id === id);
    if (index < 0) return null;
    const current = this.payload.processors[index]!;
    const updated = LarkGroupMessageProcessorSchema.parse({
      ...LarkGroupMessageProcessorUpdateInputSchema.parse(input),
      id,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    const processors = [...this.payload.processors];
    processors[index] = updated;
    this.persist(processors);
    return cloneProcessor(updated);
  }

  setEnabled(id: string, enabled: boolean, now: string): LarkGroupMessageProcessor | null {
    const current = this.get(id);
    return current ? this.update(id, { ...current, enabled }, now) : null;
  }

  delete(id: string): boolean {
    this.ensureLoaded();
    const processors = this.payload.processors.filter((entry) => entry.id !== id);
    if (processors.length === this.payload.processors.length) return false;
    this.persist(processors);
    return true;
  }

  deleteByBotId(botId: string): void {
    this.ensureLoaded();
    const processors = this.payload.processors.filter((entry) => entry.botId !== botId);
    if (processors.length !== this.payload.processors.length) this.persist(processors);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (existsSync(this.filePath)) {
      ensurePrivateFile(this.filePath);
      this.payload = PayloadSchema.parse(
        JSON.parse(readFileSync(this.filePath, "utf8")) as unknown,
      );
    }
    this.loaded = true;
  }

  private persist(processors: LarkGroupMessageProcessor[]): void {
    const payload = PayloadSchema.parse({ version: STORE_VERSION, processors });
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(payload, null, 2));
    this.payload = payload;
    this.loaded = true;
  }
}
