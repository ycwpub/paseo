import { randomBytes } from "node:crypto";

export interface ProjectEgressProxyCredentialContext {
  workspaceId: string;
  source: string;
}

export interface IssuedProjectEgressProxyCredential {
  token: string;
  expiresAt: number;
}

interface StoredProjectEgressProxyCredential extends ProjectEgressProxyCredentialContext {
  expiresAt: number;
}

export interface ProjectEgressProxyCredentialsOptions {
  now?: () => number;
  createToken?: () => string;
  ttlMs?: number;
  maxEntries?: number;
}

function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export class ProjectEgressProxyCredentials {
  private readonly entries = new Map<string, StoredProjectEgressProxyCredential>();
  private readonly now: () => number;
  private readonly createToken: () => string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  public constructor(options: ProjectEgressProxyCredentialsOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createToken = options.createToken ?? createOpaqueToken;
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1_000;
    this.maxEntries = options.maxEntries ?? 1_024;
  }

  public issue(context: ProjectEgressProxyCredentialContext): IssuedProjectEgressProxyCredential {
    this.pruneExpired();
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    let token = this.createToken();
    while (this.entries.has(token)) {
      token = this.createToken();
    }
    const expiresAt = this.now() + this.ttlMs;
    this.entries.set(token, { ...context, expiresAt });
    return { token, expiresAt };
  }

  public resolve(token: string): ProjectEgressProxyCredentialContext | null {
    const entry = this.entries.get(token);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(token);
      return null;
    }
    return {
      workspaceId: entry.workspaceId,
      source: entry.source,
    };
  }

  public revoke(token: string): void {
    this.entries.delete(token);
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [token, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(token);
    }
  }
}
