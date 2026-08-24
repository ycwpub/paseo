import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CODEX_SESSION_DIRECTORIES = ["sessions", "archived_sessions"] as const;

export interface ResolveCodexSessionHomeOptions {
  codexHome?: string;
  homeDir?: string;
}

function addCandidate(
  candidates: string[],
  seen: Set<string>,
  candidate: string | undefined,
): void {
  const normalized = candidate?.trim();
  if (!normalized) return;
  const resolved = path.resolve(normalized);
  if (seen.has(resolved)) return;
  seen.add(resolved);
  candidates.push(resolved);
}

function codexHomeCandidates(options: ResolveCodexSessionHomeOptions): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const homeDir = options.homeDir ?? os.homedir();
  const defaultCodexHome = path.join(homeDir, ".codex");

  addCandidate(candidates, seen, options.codexHome);
  addCandidate(candidates, seen, defaultCodexHome);
  addCandidate(candidates, seen, path.join(defaultCodexHome, "aiden-app-home"));

  return candidates;
}

async function directoryContainsThread(directory: string, threadId: string): Promise<boolean> {
  const pending = [directory];
  const expectedSuffix = `-${threadId}.jsonl`;

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;

    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EACCES")
      ) {
        continue;
      }
      throw error;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        pending.push(path.join(current, entry.name));
      } else if (entry.isFile() && entry.name.endsWith(expectedSuffix)) {
        return true;
      }
    }
  }

  return false;
}

export async function resolveCodexSessionHome(
  threadId: string,
  options: ResolveCodexSessionHomeOptions = {},
): Promise<string | undefined> {
  if (!threadId.trim()) return undefined;

  for (const candidate of codexHomeCandidates(options)) {
    for (const directory of CODEX_SESSION_DIRECTORIES) {
      if (await directoryContainsThread(path.join(candidate, directory), threadId)) {
        return candidate;
      }
    }
  }

  return undefined;
}
