import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import {
  StoredWorkflowRunsSchema,
  WorkflowRunSchema,
  type WorkflowRun,
} from "@getpaseo/protocol/workflow/types";
import { writeJsonFileAtomic } from "../atomic-file.js";

type WorkflowRunUpdater = (run: WorkflowRun) => WorkflowRun | Promise<WorkflowRun>;

export class WorkflowRunStore {
  private readonly mutations = new Map<string, Promise<unknown>>();

  constructor(private readonly dir: string) {}

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  async list(): Promise<WorkflowRun[]> {
    await this.ensureDir();
    const entries = await readdir(this.dir, { withFileTypes: true });
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const content = await readFile(join(this.dir, entry.name), "utf8");
          return WorkflowRunSchema.parse(JSON.parse(content));
        }),
    );
    return StoredWorkflowRunsSchema.parse({ runs }).runs.sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    );
  }

  async get(id: string): Promise<WorkflowRun | null> {
    await this.ensureDir();
    try {
      const content = await readFile(this.filePath(id), "utf8");
      return WorkflowRunSchema.parse(JSON.parse(content));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async create(run: Omit<WorkflowRun, "id">): Promise<WorkflowRun> {
    const created = WorkflowRunSchema.parse({ ...run, id: randomUUID() });
    await this.write(created);
    return created;
  }

  async update(id: string, updater: WorkflowRunUpdater): Promise<WorkflowRun | null> {
    return this.serialize(id, async () => {
      const current = await this.get(id);
      if (!current) {
        return null;
      }
      const next = await updater(current);
      if (next.id !== id) {
        throw new Error(`Workflow run update cannot change id: ${id}`);
      }
      const updated = WorkflowRunSchema.parse(next);
      await this.write(updated);
      return updated;
    });
  }

  async delete(id: string): Promise<void> {
    await this.serialize(id, async () => {
      await this.ensureDir();
      await rm(this.filePath(id), { force: true });
    });
  }

  private async write(run: WorkflowRun): Promise<void> {
    await this.ensureDir();
    await writeJsonFileAtomic(this.filePath(run.id), run);
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
