import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { StreamItem } from "@/types/stream";

export interface InferredTaskTodo {
  id: string;
  text: string;
  completed: boolean;
}

export interface InferredTaskReference {
  kind: "document" | "link";
  label: string;
  target?: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`，。；！、]+/giu;
const TRAILING_URL_PUNCTUATION_PATTERN = /[)\]}>，。；;！!、]+$/u;
const TODO_LIST_ITEM_PATTERN = /^\s*(?:[-*•]|\d+[.)、]|[（(]\d+[)）])\s+(.+)$/u;
const SHELL_CHAIN_PATTERN = /\s*(?:&&|;)\s*/;
const SHELL_TOKEN_PATTERN = /"([^"]*)"|'([^']*)'|([^\s]+)/g;
const SHELL_REFERENCE_COMMANDS = new Set([
  "awk",
  "bat",
  "cat",
  "file",
  "grep",
  "head",
  "less",
  "md5",
  "md5sum",
  "more",
  "nl",
  "od",
  "rg",
  "sed",
  "sha1sum",
  "sha256sum",
  "shasum",
  "stat",
  "tac",
  "tail",
  "wc",
  "xxd",
]);
const NON_PATH_SHELL_ARGUMENT_PATTERN = /^(?:-|[0-9]+(?:,[0-9]+)?[a-z]*$|[0-9]+[a-z]$|[a-z]$)/i;

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimUrl(url: string): string {
  return url.replace(TRAILING_URL_PUNCTUATION_PATTERN, "");
}

function extractUrls(text: string): string[] {
  return [...text.matchAll(URL_PATTERN)].map((match) => trimUrl(match[0])).filter(Boolean);
}

function todoLabel(text: string): string {
  const withoutUrls = text.replace(URL_PATTERN, " ");
  const compacted = compactText(withoutUrls) || compactText(text);
  return compacted.length > 180 ? `${compacted.slice(0, 177)}...` : compacted;
}

function extractTodoLabels(text: string): string[] {
  const listItems = text
    .split(/\r?\n/)
    .map((line) => line.match(TODO_LIST_ITEM_PATTERN)?.[1] ?? "")
    .map(todoLabel)
    .filter(Boolean);
  if (listItems.length > 0) {
    return listItems;
  }
  const label = todoLabel(text);
  return label ? [label] : [];
}

function attachmentReferences(attachment: AgentAttachment): InferredTaskReference[] {
  switch (attachment.type) {
    case "forge_change_request":
    case "forge_issue":
    case "github_pr":
    case "github_issue":
      return [{ kind: "link", label: attachment.title, target: attachment.url }];
    case "uploaded_file":
      return [{ kind: "document", label: attachment.fileName, target: attachment.path }];
    case "text":
      if (attachment.externalResource) {
        return [
          {
            kind: "link",
            label: attachment.externalResource.title,
            target: attachment.externalResource.url,
          },
        ];
      }
      return attachment.title ? [{ kind: "document", label: attachment.title }] : [];
    case "review":
      return [{ kind: "document", label: attachment.cwd, target: attachment.cwd }];
  }
}

function tokenizeShellSegment(segment: string): string[] {
  return [...segment.matchAll(SHELL_TOKEN_PATTERN)]
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter(Boolean);
}

function extractShellSegmentReference(segment: string): string | null {
  const tokens = tokenizeShellSegment(segment);
  if (tokens.length < 2) {
    return null;
  }
  const command = tokens[0]?.split("/").at(-1)?.toLowerCase();
  if (!command || !SHELL_REFERENCE_COMMANDS.has(command)) {
    return null;
  }
  for (let index = tokens.length - 1; index > 0; index -= 1) {
    const candidate = tokens[index];
    if (!candidate || NON_PATH_SHELL_ARGUMENT_PATTERN.test(candidate)) {
      continue;
    }
    return candidate;
  }
  return null;
}

export function extractShellReferencePaths(command: string): string[] {
  return command
    .split(SHELL_CHAIN_PATTERN)
    .map(extractShellSegmentReference)
    .filter((path): path is string => Boolean(path));
}

export function selectCurrentTaskItems(items: readonly StreamItem[]): readonly StreamItem[] {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.kind === "user_message") {
      return items.slice(index);
    }
  }
  return items;
}

export function inferTaskTodos(
  items: readonly StreamItem[],
  options: { isRunning?: boolean } = {},
): InferredTaskTodo[] {
  const userMessage = items.toReversed().find((item) => item.kind === "user_message");
  if (!userMessage || userMessage.kind !== "user_message") {
    return [];
  }
  return extractTodoLabels(userMessage.text).map((text, index) => ({
    id: `inferred-todo:${userMessage.id}:${index}`,
    text,
    completed: options.isRunning === false,
  }));
}

export function inferUserMessageReferences(
  item: Extract<StreamItem, { kind: "user_message" }>,
): InferredTaskReference[] {
  const references: InferredTaskReference[] = extractUrls(item.text).map((url) => ({
    kind: "link",
    label: url,
    target: url,
  }));
  for (const attachment of item.attachments ?? []) {
    references.push(...attachmentReferences(attachment));
  }
  return references;
}
