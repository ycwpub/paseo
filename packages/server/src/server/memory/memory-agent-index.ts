import path from "node:path";
import type { PaseoMemoryScope, PaseoMemoryState } from "@getpaseo/protocol/messages";
import { writePrivateFileAtomicSync } from "../private-files.js";
import { isMemoryScopeVisible } from "./memory-model.js";
import { buildMemoryTotalDocument, buildMemoryTotalSystemPrompt } from "./memory-total-document.js";

function sanitizeAgentId(agentId: string): string {
  const normalized = agentId.trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return normalized.slice(0, 128) || "agent";
}

export function buildMemoryAgentSystemPrompt(indexPath: string): string {
  return buildMemoryTotalSystemPrompt(indexPath);
}

export class MemoryAgentIndex {
  constructor(private readonly paseoHome: string) {}

  pathForAgent(agentId: string): string {
    return path.join(this.paseoHome, "memory", "agent-indexes", `${sanitizeAgentId(agentId)}.md`);
  }

  systemPromptForAgent(agentId: string): string {
    return buildMemoryAgentSystemPrompt(this.pathForAgent(agentId));
  }

  write(input: {
    agentId: string;
    state: PaseoMemoryState;
    enabled: boolean;
    scopes: readonly PaseoMemoryScope[];
  }): string {
    const indexPath = this.pathForAgent(input.agentId);
    const overviewDocuments = input.enabled
      ? (input.state.overviewDocuments ?? []).filter((document) =>
          isMemoryScopeVisible(document.scope, input.scopes),
        )
      : [];
    const content = buildMemoryTotalDocument({
      totalDocumentPath: indexPath,
      memoryRoot: this.paseoHome,
      enabled: input.enabled,
      scopes: input.scopes,
      overviewDocuments,
    });
    writePrivateFileAtomicSync(indexPath, content);
    return indexPath;
  }
}
