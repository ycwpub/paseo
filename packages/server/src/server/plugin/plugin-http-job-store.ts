import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import {
  PluginHttpJobSchema,
  type PluginHttpJob,
  type PluginHttpJobStatus,
} from "@getpaseo/protocol/messages";
import {
  ensurePrivateDirectory,
  ensurePrivateFile,
  writePrivateFileAtomicSync,
} from "../private-files.js";

type PluginHttpJobUpdater = (job: PluginHttpJob) => PluginHttpJob;

const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function readProjectId(input: unknown): string | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const record = input as Record<string, unknown>;
  const value = record.projectId ?? record.project_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function activityTimestamp(job: PluginHttpJob): string {
  return job.endedAt ?? job.startedAt ?? job.createdAt;
}

function matchesJobListOptions(
  job: PluginHttpJob,
  options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    statuses?: PluginHttpJobStatus[];
    listenerId?: string;
    routeId?: string;
    createdBefore?: string;
    createdAfter?: string;
  },
): boolean {
  if (options.pluginId && job.pluginId !== options.pluginId) return false;
  if (options.serviceName && job.serviceName !== options.serviceName) return false;
  if (
    options.projectId &&
    job.projectId !== options.projectId &&
    readProjectId(job.input) !== options.projectId
  ) {
    return false;
  }
  if (options.statuses?.length && !options.statuses.includes(job.status)) return false;
  if (options.listenerId && job.listenerId !== options.listenerId) return false;
  if (options.routeId && job.routeId !== options.routeId) return false;
  if (options.createdBefore && job.createdAt >= options.createdBefore) return false;
  if (options.createdAfter && job.createdAt <= options.createdAfter) return false;
  return true;
}

export class PluginHttpJobStore {
  private readonly mutations = new Map<string, Promise<unknown>>();
  private readonly jobs = new Map<string, PluginHttpJob>();

  constructor(private readonly directory: string) {}

  initialize(now = new Date().toISOString()): void {
    ensurePrivateDirectory(this.directory);
    for (const entry of readdirSync(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -".json".length);
      let job: PluginHttpJob | null = null;
      try {
        job = this.get(id);
      } catch {
        continue;
      }
      if (!job || (job.status !== "queued" && job.status !== "running")) continue;
      this.write({
        ...job,
        status: "failed",
        error: "Daemon restarted before the HTTP processing job completed",
        errorCode: "DAEMON_RESTARTED",
        endedAt: now,
      });
    }
  }

  async create(input: {
    pluginId: string;
    serviceName: string;
    projectId?: string;
    listenerId?: string;
    routeId?: string;
    input: unknown;
    createdAt: string;
  }): Promise<PluginHttpJob> {
    const job = PluginHttpJobSchema.parse({
      id: randomUUID(),
      pluginId: input.pluginId,
      serviceName: input.serviceName,
      projectId: input.projectId,
      listenerId: input.listenerId,
      routeId: input.routeId,
      status: "queued",
      input: input.input,
      result: null,
      workflowRunId: null,
      error: null,
      errorCode: null,
      createdAt: input.createdAt,
      startedAt: null,
      endedAt: null,
    });
    await this.serialize(job.id, () => {
      this.write(job);
      return Promise.resolve();
    });
    return job;
  }

  get(id: string): PluginHttpJob | null {
    const cached = this.jobs.get(id);
    if (cached) return cached;
    const filePath = this.filePath(id);
    if (!filePath || !existsSync(filePath)) return null;
    ensurePrivateFile(filePath);
    const job = PluginHttpJobSchema.parse(JSON.parse(readFileSync(filePath, "utf8")) as unknown);
    this.jobs.set(job.id, job);
    return job;
  }

  list(options: {
    pluginId?: string;
    serviceName?: string;
    projectId?: string;
    limit?: number;
    statuses?: PluginHttpJobStatus[];
    listenerId?: string;
    routeId?: string;
    createdBefore?: string;
    createdAfter?: string;
  }): PluginHttpJob[] {
    ensurePrivateDirectory(this.directory);
    const jobs: PluginHttpJob[] = [];
    for (const job of this.jobs.values()) {
      if (!matchesJobListOptions(job, options)) continue;
      jobs.push(job);
    }
    jobs.sort((left, right) => activityTimestamp(right).localeCompare(activityTimestamp(left)));
    return jobs.slice(0, options.limit ?? 100);
  }

  async update(id: string, updater: PluginHttpJobUpdater): Promise<PluginHttpJob | null> {
    return this.serialize(id, () => {
      const current = this.get(id);
      if (!current) return Promise.resolve(null);
      const updated = PluginHttpJobSchema.parse(updater(current));
      if (updated.id !== id) {
        throw new Error(`Plugin HTTP job update cannot change id: ${id}`);
      }
      this.write(updated);
      return Promise.resolve(updated);
    });
  }

  async delete(id: string): Promise<boolean> {
    return this.serialize(id, () => {
      const filePath = this.filePath(id);
      if (!filePath || (!this.jobs.has(id) && !existsSync(filePath))) {
        return Promise.resolve(false);
      }
      rmSync(filePath, { force: true });
      this.jobs.delete(id);
      return Promise.resolve(true);
    });
  }

  async deleteMany(ids: string[]): Promise<string[]> {
    const deleted: string[] = [];
    for (const id of new Set(ids)) {
      if (await this.delete(id)) deleted.push(id);
    }
    return deleted;
  }

  private filePath(id: string): string | null {
    return JOB_ID_PATTERN.test(id) ? path.join(this.directory, `${id}.json`) : null;
  }

  private write(job: PluginHttpJob): void {
    ensurePrivateDirectory(this.directory);
    const filePath = this.filePath(job.id);
    if (!filePath) throw new Error(`Invalid Plugin HTTP job ID: ${job.id}`);
    writePrivateFileAtomicSync(filePath, JSON.stringify(job, null, 2));
    this.jobs.set(job.id, job);
  }

  private async serialize<T>(id: string, mutation: () => Promise<T>): Promise<T> {
    const previous = this.mutations.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(mutation);
    this.mutations.set(id, next);
    try {
      return await next;
    } finally {
      if (this.mutations.get(id) === next) {
        this.mutations.delete(id);
      }
    }
  }
}
