import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type pino from "pino";
import { z } from "zod";
import {
  TeamSchema,
  TeamCreateInputSchema,
  TeamUpdateInputSchema,
  type Team,
  type TeamCreateInput,
  type TeamMemberSettings,
  type TeamUpdateInput,
} from "@getpaseo/protocol/messages";
import { ensurePrivateFile, writePrivateFileAtomicSync } from "../private-files.js";
import type { AssistantStore } from "../assistants/assistant-store.js";

const TEAM_STORE_VERSION = 1;

const TeamStorePayloadSchema = z.object({
  version: z.literal(TEAM_STORE_VERSION),
  teams: z.array(TeamSchema),
});

type TeamStorePayload = z.infer<typeof TeamStorePayloadSchema>;

function createDefaultPayload(): TeamStorePayload {
  return { version: TEAM_STORE_VERSION, teams: [] };
}

function clonePayload(payload: TeamStorePayload): TeamStorePayload {
  return TeamStorePayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
}

function nowMs(): number {
  return Date.now();
}

function requireTrimmed(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

export class TeamStore {
  private readonly filePath: string;
  private readonly logger: pino.Logger;
  private readonly assistantStore: Pick<AssistantStore, "get">;
  private loaded = false;
  private payload: TeamStorePayload = createDefaultPayload();

  constructor(options: {
    paseoHome: string;
    logger: pino.Logger;
    assistantStore: Pick<AssistantStore, "get">;
  }) {
    this.filePath = path.join(options.paseoHome, "teams.json");
    this.logger = options.logger.child({ module: "team-store" });
    this.assistantStore = options.assistantStore;
  }

  list(): Team[] {
    this.ensureLoaded();
    return clonePayload(this.payload).teams;
  }

  get(id: string): Team | null {
    this.ensureLoaded();
    return this.payload.teams.find((team) => team.id === id) ?? null;
  }

  create(input: TeamCreateInput): Team {
    this.ensureLoaded();
    const parsed = TeamCreateInputSchema.parse(input);
    if (!parsed.leaderAssistantId || !parsed.assistantIds) {
      throw new Error("Team leader and assistants are required");
    }
    const leaderAssistantId = requireTrimmed(parsed.leaderAssistantId, "Team leader");
    const assistantIds = this.validateMembership(parsed.assistantIds, leaderAssistantId);
    const memberSettings = this.validateMemberSettings(parsed.memberSettings ?? {}, assistantIds);
    const timestamp = nowMs();
    const team = TeamSchema.parse({
      id: randomUUID(),
      userId: "local",
      name: requireTrimmed(parsed.name, "Team name"),
      workspace: parsed.workspace?.trim() ?? "",
      workspaceMode: parsed.workspaceMode ?? "shared",
      leaderAssistantId,
      assistantIds,
      assistants: this.buildAssistantSlots(assistantIds, leaderAssistantId, memberSettings),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    this.replaceAndPersist({ ...this.payload, teams: [...this.payload.teams, team] });
    return team;
  }

  update(input: TeamUpdateInput): Team | null {
    this.ensureLoaded();
    const parsed = TeamUpdateInputSchema.parse(input);
    const index = this.payload.teams.findIndex((team) => team.id === parsed.id);
    if (index < 0) return null;
    const current = this.payload.teams[index]!;
    const leaderAssistantId = requireTrimmed(
      parsed.leaderAssistantId ?? current.leaderAssistantId,
      "Team leader",
    );
    const assistantIds = this.validateMembership(
      parsed.assistantIds ?? resolveTeamAssistantIds(current),
      leaderAssistantId,
    );
    const memberSettings = this.validateMemberSettings(
      parsed.memberSettings ?? this.resolveStoredMemberSettings(current),
      assistantIds,
    );
    const team = TeamSchema.parse({
      ...current,
      ...(parsed.name !== undefined ? { name: requireTrimmed(parsed.name, "Team name") } : {}),
      ...(parsed.workspace !== undefined ? { workspace: parsed.workspace } : {}),
      ...(parsed.workspaceMode !== undefined ? { workspaceMode: parsed.workspaceMode } : {}),
      leaderAssistantId,
      assistantIds,
      assistants: this.buildAssistantSlots(assistantIds, leaderAssistantId, memberSettings),
      ...(parsed.sessionMode !== undefined ? { sessionMode: parsed.sessionMode } : {}),
      updatedAt: nowMs(),
    });
    const teams = [...this.payload.teams];
    teams[index] = team;
    this.replaceAndPersist({ ...this.payload, teams });
    return team;
  }

  delete(id: string): boolean {
    this.ensureLoaded();
    const teams = this.payload.teams.filter((team) => team.id !== id);
    if (teams.length === this.payload.teams.length) return false;
    this.replaceAndPersist({ ...this.payload, teams });
    return true;
  }

  isAssistantInUse(assistantId: string): boolean {
    this.ensureLoaded();
    return this.payload.teams.some((team) => resolveTeamAssistantIds(team).includes(assistantId));
  }

  private validateMembership(assistantIds: string[], leaderAssistantId: string): string[] {
    const normalized = [...new Set(assistantIds.map((id) => id.trim()).filter(Boolean))];
    if (normalized.length < 2) {
      throw new Error("A team requires at least two assistants");
    }
    if (!normalized.includes(leaderAssistantId)) {
      throw new Error("The team leader must be a team member");
    }
    for (const assistantId of normalized) {
      if (!this.assistantStore.get(assistantId)) {
        throw new Error(`Assistant ${assistantId} not found`);
      }
    }
    return normalized;
  }

  private buildAssistantSlots(
    assistantIds: string[],
    leaderAssistantId: string,
    memberSettings: Record<string, TeamMemberSettings>,
  ): Team["assistants"] {
    return assistantIds.map((assistantId) => {
      const assistant = this.assistantStore.get(assistantId);
      if (!assistant) {
        throw new Error(`Assistant ${assistantId} not found`);
      }
      return {
        slotId: assistantId,
        conversationId: "",
        role: assistantId === leaderAssistantId ? "leader" : "teammate",
        assistantBackend: "preset",
        assistantName: assistant.name,
        status: "idle",
        assistantId,
        ...(memberSettings[assistantId]?.provider
          ? { provider: memberSettings[assistantId].provider }
          : {}),
        ...(memberSettings[assistantId]?.model ? { model: memberSettings[assistantId].model } : {}),
        ...(memberSettings[assistantId]?.thinkingOptionId
          ? { thinkingOptionId: memberSettings[assistantId].thinkingOptionId }
          : {}),
      };
    });
  }

  private validateMemberSettings(
    settings: Record<string, TeamMemberSettings>,
    assistantIds: string[],
  ): Record<string, TeamMemberSettings> {
    const memberIds = new Set(assistantIds);
    const normalized: Record<string, TeamMemberSettings> = {};
    for (const [rawAssistantId, value] of Object.entries(settings)) {
      const assistantId = requireTrimmed(rawAssistantId, "Team member");
      if (!memberIds.has(assistantId)) {
        throw new Error(`Assistant ${assistantId} is not a team member`);
      }
      let provider = value.provider?.trim();
      let model = value.model?.trim();
      if (!provider && model?.includes("/")) {
        const separatorIndex = model.indexOf("/");
        provider = model.slice(0, separatorIndex).trim();
        model = model.slice(separatorIndex + 1).trim();
      }
      const thinkingOptionId = value.thinkingOptionId?.trim();
      if (provider || model || thinkingOptionId) {
        normalized[assistantId] = {
          ...(provider ? { provider } : {}),
          ...(model ? { model } : {}),
          ...(thinkingOptionId ? { thinkingOptionId } : {}),
        };
      }
    }
    return normalized;
  }

  private resolveStoredMemberSettings(team: Team): Record<string, TeamMemberSettings> {
    return Object.fromEntries(
      team.assistants.flatMap((member) => {
        if (
          !member.assistantId ||
          (!member.provider && !member.model && !member.thinkingOptionId)
        ) {
          return [];
        }
        return [
          [
            member.assistantId,
            {
              ...(member.provider ? { provider: member.provider } : {}),
              ...(member.model ? { model: member.model } : {}),
              ...(member.thinkingOptionId ? { thinkingOptionId: member.thinkingOptionId } : {}),
            },
          ],
        ];
      }),
    );
  }

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (!existsSync(this.filePath)) {
      this.payload = createDefaultPayload();
      this.loaded = true;
      return;
    }
    ensurePrivateFile(this.filePath);
    const raw = readFileSync(this.filePath, "utf8");
    try {
      this.payload = TeamStorePayloadSchema.parse(JSON.parse(raw));
    } catch (error) {
      this.logger.error({ err: error, filePath: this.filePath }, "Failed to parse team store");
      throw error;
    }
    this.loaded = true;
  }

  private replaceAndPersist(payload: TeamStorePayload): void {
    const parsed = TeamStorePayloadSchema.parse(payload);
    writePrivateFileAtomicSync(this.filePath, JSON.stringify(parsed, null, 2));
    this.payload = parsed;
    this.loaded = true;
  }
}

export function resolveTeamAssistantIds(team: Team): string[] {
  if (team.assistantIds) {
    return [...team.assistantIds];
  }
  return team.assistants
    .map((assistant) => assistant.assistantId)
    .filter((assistantId): assistantId is string => Boolean(assistantId));
}
