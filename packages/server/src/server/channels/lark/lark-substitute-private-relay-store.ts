import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../../private-files.js";

const LARK_SUBSTITUTE_PRIVATE_RELAY_STORE_VERSION = 1;
const LarkSubstitutePrivateRelaySchema = z.object({
  modeId: z.string().min(1),
  botId: z.string().min(1),
  authorizedUserOpenId: z.string().min(1),
  peerOpenId: z.string().min(1),
  chatId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LarkSubstitutePrivateRelay = z.infer<typeof LarkSubstitutePrivateRelaySchema>;

const PayloadSchema = z.object({
  version: z.literal(LARK_SUBSTITUTE_PRIVATE_RELAY_STORE_VERSION),
  relays: z.array(LarkSubstitutePrivateRelaySchema),
  processedMessageIds: z.array(z.string()).default([]),
});
type Payload = z.infer<typeof PayloadSchema>;

const MAX_PROCESSED_MESSAGE_IDS = 2_000;

export class LarkSubstitutePrivateRelayStore {
  private readonly filePath: string;
  private loaded = false;
  private payload: Payload = {
    version: LARK_SUBSTITUTE_PRIVATE_RELAY_STORE_VERSION,
    relays: [],
    processedMessageIds: [],
  };

  constructor(paseoHome: string) {
    this.filePath = path.join(paseoHome, "channels", "lark-substitute-private-relays.json");
  }

  get(modeId: string, peerOpenId: string): LarkSubstitutePrivateRelay | null {
    this.ensureLoaded();
    return (
      this.payload.relays.find(
        (relay) => relay.modeId === modeId && relay.peerOpenId === peerOpenId,
      ) ?? null
    );
  }

  upsert(relay: LarkSubstitutePrivateRelay): void {
    this.ensureLoaded();
    const relays = this.payload.relays.filter(
      (entry) => !(entry.modeId === relay.modeId && entry.peerOpenId === relay.peerOpenId),
    );
    relays.push(LarkSubstitutePrivateRelaySchema.parse(relay));
    this.persist({ ...this.payload, relays });
  }

  remove(modeId: string, peerOpenId: string): void {
    this.ensureLoaded();
    this.persist({
      ...this.payload,
      relays: this.payload.relays.filter(
        (entry) => !(entry.modeId === modeId && entry.peerOpenId === peerOpenId),
      ),
    });
  }

  hasProcessed(messageId: string): boolean {
    this.ensureLoaded();
    return this.payload.processedMessageIds.includes(messageId);
  }

  markProcessed(messageId: string): void {
    this.ensureLoaded();
    if (this.payload.processedMessageIds.includes(messageId)) return;
    this.persist({
      ...this.payload,
      processedMessageIds: [...this.payload.processedMessageIds, messageId].slice(
        -MAX_PROCESSED_MESSAGE_IDS,
      ),
    });
  }

  deleteMode(modeId: string): void {
    this.ensureLoaded();
    const relays = this.payload.relays.filter((entry) => entry.modeId !== modeId);
    if (relays.length !== this.payload.relays.length) {
      this.persist({ ...this.payload, relays });
    }
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

  private persist(payload: Payload): void {
    const parsed = PayloadSchema.parse(payload);
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(parsed, null, 2));
    this.payload = parsed;
    this.loaded = true;
  }
}
