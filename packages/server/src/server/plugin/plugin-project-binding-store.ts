import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  ensurePrivateDirectory,
  ensurePrivateFile,
  writePrivateFileAtomicSync,
} from "../private-files.js";

const PluginProjectBindingSchema = z.object({
  projectId: z.string().trim().min(1),
  pluginProjectId: z.string().trim().min(1),
  pluginId: z.string().trim().min(1),
  kind: z.enum(["app", "job"]),
  appId: z.string().trim().min(1).optional(),
  serviceName: z.string().trim().min(1).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type PluginProjectBinding = z.infer<typeof PluginProjectBindingSchema>;

export interface PluginProjectSnapshot extends PluginProjectBinding {
  name: string;
  knowledge: string;
  data: Record<string, unknown>;
}

export interface PluginProjectUpdate {
  name?: string;
  knowledge?: string;
  data?: Record<string, unknown>;
}

function bindingIdentity(
  binding: Pick<
    PluginProjectBinding,
    "kind" | "pluginId" | "appId" | "serviceName" | "pluginProjectId"
  >,
): string {
  return [
    binding.kind,
    binding.pluginId,
    binding.appId ?? "",
    binding.serviceName ?? "",
    binding.pluginProjectId,
  ].join("\u0000");
}

export class PluginProjectBindingStore {
  private readonly bindings = new Map<string, PluginProjectBinding>();

  constructor(private readonly directory: string) {}

  initialize(): void {
    ensurePrivateDirectory(this.directory);
    for (const entry of readdirSync(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(this.directory, entry.name);
      try {
        ensurePrivateFile(filePath);
        const binding = PluginProjectBindingSchema.parse(
          JSON.parse(readFileSync(filePath, "utf8")) as unknown,
        );
        this.bindings.set(binding.projectId, binding);
      } catch {
        // Ignore invalid legacy entries. A later save replaces them atomically.
      }
    }
  }

  get(projectId: string): PluginProjectBinding | null {
    return this.bindings.get(projectId.trim()) ?? null;
  }

  list(): PluginProjectBinding[] {
    return [...this.bindings.values()].toSorted((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  }

  claim(
    input: Omit<PluginProjectBinding, "createdAt" | "updatedAt">,
    now: string,
  ): {
    binding: PluginProjectBinding;
    created: boolean;
  } {
    const parsedInput = PluginProjectBindingSchema.omit({
      createdAt: true,
      updatedAt: true,
    }).parse(input);
    const current = this.bindings.get(parsedInput.projectId);
    if (current && bindingIdentity(current) !== bindingIdentity(parsedInput)) {
      throw new Error(
        `Project ${parsedInput.projectId} 已绑定插件项目 ${current.pluginId}/${current.pluginProjectId}，一个 Project 只能绑定一个插件项目`,
      );
    }
    const binding = PluginProjectBindingSchema.parse({
      ...current,
      ...parsedInput,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    this.write(binding);
    return { binding, created: current === undefined };
  }

  release(projectId: string, expectedPluginProjectId?: string): boolean {
    const normalizedProjectId = projectId.trim();
    const current = this.bindings.get(normalizedProjectId);
    if (!current) return false;
    if (expectedPluginProjectId && current.pluginProjectId !== expectedPluginProjectId) {
      return false;
    }
    rmSync(this.filePath(normalizedProjectId), { force: true });
    this.bindings.delete(normalizedProjectId);
    return true;
  }

  private write(binding: PluginProjectBinding): void {
    ensurePrivateDirectory(this.directory);
    writePrivateFileAtomicSync(this.filePath(binding.projectId), JSON.stringify(binding, null, 2));
    this.bindings.set(binding.projectId, binding);
  }

  private filePath(projectId: string): string {
    const key = createHash("sha256").update(projectId).digest("hex");
    return path.join(this.directory, `${key}.json`);
  }
}
