import type { StreamItem } from "@/types/stream";
import {
  extractShellReferencePaths,
  inferTaskTodos,
  inferUserMessageReferences,
  selectCurrentTaskItems,
} from "./context-inference";

export interface TaskSummaryTodo {
  id: string;
  text: string;
  completed: boolean;
}

export interface TaskSummaryOutput {
  id: string;
  path: string;
  label: string;
  kind: "file";
}

export interface TaskSummaryReference {
  id: string;
  label: string;
  kind: "skill" | "document" | "link";
  target?: string;
}

export interface TaskSummary {
  todos: TaskSummaryTodo[];
  outputs: TaskSummaryOutput[];
  references: TaskSummaryReference[];
}

interface BuildTaskSummaryOptions {
  cwd?: string | null;
  isRunning?: boolean;
}

function normalizePath(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/\/+/g, "/");
}

function displayPath(path: string, cwd: string | null): string {
  const normalizedPath = normalizePath(path);
  if (!cwd) {
    return normalizedPath;
  }
  const normalizedCwd = normalizePath(cwd).replace(/\/+$/, "");
  if (normalizedPath === normalizedCwd) {
    return normalizedPath.split("/").at(-1) ?? normalizedPath;
  }
  if (normalizedPath.startsWith(`${normalizedCwd}/`)) {
    return normalizedPath.slice(normalizedCwd.length + 1);
  }
  return normalizedPath.replace(/^\.\/+/, "");
}

function addOutput(
  outputs: TaskSummaryOutput[],
  seen: Set<string>,
  path: string,
  cwd: string | null,
): void {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath || seen.has(normalizedPath)) {
    return;
  }
  seen.add(normalizedPath);
  outputs.push({
    id: `file:${normalizedPath}`,
    path,
    label: displayPath(path, cwd),
    kind: "file",
  });
}

function addReference(
  references: TaskSummaryReference[],
  seen: Set<string>,
  reference: Omit<TaskSummaryReference, "id">,
): void {
  const label = reference.label.trim();
  if (!label) {
    return;
  }
  const target = reference.target?.trim();
  const key = `${reference.kind}:${target || label}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  references.push({
    ...reference,
    id: key,
    label,
    ...(target ? { target } : {}),
  });
}

function isSkillToolCall(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  return normalized === "skill" || normalized.endsWith("__skill");
}

function extractUnknownSkillName(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["skill", "name"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function collectAgentToolCall(
  item: Extract<StreamItem, { kind: "tool_call" }>,
  cwd: string | null,
  outputs: TaskSummaryOutput[],
  outputKeys: Set<string>,
  references: TaskSummaryReference[],
  referenceKeys: Set<string>,
): void {
  if (item.payload.source !== "agent") {
    return;
  }
  const { name, detail } = item.payload.data;

  if (detail.type === "edit" || detail.type === "write") {
    addOutput(outputs, outputKeys, detail.filePath, cwd);
  }

  if (isSkillToolCall(name)) {
    let skillName: string | null | undefined = null;
    if (detail.type === "plain_text") {
      skillName = detail.label;
    } else if (detail.type === "unknown") {
      skillName = extractUnknownSkillName(detail.input);
    }
    addReference(references, referenceKeys, {
      kind: "skill",
      label: skillName || name,
    });
  }

  if (detail.type === "fetch") {
    addReference(references, referenceKeys, {
      kind: "link",
      label: detail.url,
      target: detail.url,
    });
  }

  if (detail.type === "search") {
    for (const filePath of detail.filePaths ?? []) {
      addReference(references, referenceKeys, {
        kind: "document",
        label: displayPath(filePath, cwd),
        target: filePath,
      });
    }
    for (const result of detail.webResults ?? []) {
      addReference(references, referenceKeys, {
        kind: "link",
        label: result.title.trim() || result.url,
        target: result.url,
      });
    }
  }

  if (detail.type === "read") {
    addReference(references, referenceKeys, {
      kind: "document",
      label: displayPath(detail.filePath, cwd),
      target: detail.filePath,
    });
  }

  if (detail.type === "shell") {
    for (const filePath of extractShellReferencePaths(detail.command)) {
      addReference(references, referenceKeys, {
        kind: "document",
        label: displayPath(filePath, detail.cwd ?? cwd),
        target: filePath,
      });
    }
  }
}

function collectOrchestratorToolCall(
  item: Extract<StreamItem, { kind: "tool_call" }>,
  references: TaskSummaryReference[],
  referenceKeys: Set<string>,
): void {
  if (item.payload.source !== "orchestrator") {
    return;
  }
  const { toolName, arguments: args } = item.payload.data;
  if (!isSkillToolCall(toolName)) {
    return;
  }
  addReference(references, referenceKeys, {
    kind: "skill",
    label: extractUnknownSkillName(args) || toolName,
  });
}

/**
 * Builds a read-only summary from the canonical conversation timeline.
 *
 * Todo state deliberately uses the latest snapshot already maintained by the
 * timeline reducer. Outputs and references are projections of tool calls, so
 * the panel never owns a second source of truth.
 */
export function buildTaskSummary(
  items: readonly StreamItem[],
  options: BuildTaskSummaryOptions = {},
): TaskSummary {
  const cwd = options.cwd?.trim() || null;
  const taskItems = selectCurrentTaskItems(items);
  let todos: TaskSummaryTodo[] = [];
  const outputs: TaskSummaryOutput[] = [];
  const references: TaskSummaryReference[] = [];
  const outputKeys = new Set<string>();
  const referenceKeys = new Set<string>();

  for (const item of taskItems) {
    if (item.kind === "todo_list") {
      const todoOccurrences = new Map<string, number>();
      todos = item.items.map((todo) => {
        const occurrence = (todoOccurrences.get(todo.text) ?? 0) + 1;
        todoOccurrences.set(todo.text, occurrence);
        return {
          id: `todo:${todo.text}:${occurrence}`,
          text: todo.text,
          completed: todo.completed,
        };
      });
      continue;
    }
    if (item.kind === "user_message") {
      for (const reference of inferUserMessageReferences(item)) {
        addReference(references, referenceKeys, reference);
      }
      continue;
    }
    if (item.kind !== "tool_call") {
      continue;
    }
    collectAgentToolCall(item, cwd, outputs, outputKeys, references, referenceKeys);
    collectOrchestratorToolCall(item, references, referenceKeys);
  }

  if (todos.length === 0) {
    todos = inferTaskTodos(taskItems, { isRunning: options.isRunning });
  }

  return { todos, outputs, references };
}
