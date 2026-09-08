function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function parseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function unwrapCard(value: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["json_card", "user_dsl"]) {
    const serialized = nonEmptyString(value[key]);
    const parsed = serialized ? parseJsonRecord(serialized) : null;
    if (parsed) return unwrapCard(parsed);
  }
  const card = asRecord(value.card);
  return card ? unwrapCard(card) : value;
}

const TEXT_KEYS = new Set(["content", "text", "title", "placeholder", "url", "href"]);
const CHILD_KEYS = new Set([
  "actions",
  "alt",
  "body",
  "columns",
  "elements",
  "extra",
  "fields",
  "header",
  "items",
  "multi_url",
  "options",
  "property",
  "title",
]);
const SELECT_TAGS = new Set(["select_static", "multi_select_static", "overflow"]);

function firstNestedText(value: unknown): string | null {
  const parts: string[] = [];
  collectCardText(value, parts);
  return parts.find((part) => part.trim().length > 0)?.trim() ?? null;
}

function appendTaggedCardText(record: Record<string, unknown>, parts: string[]): Set<string> {
  const handledKeys = new Set<string>();
  const tag = nonEmptyString(record.tag);
  if (tag === "button") {
    const label = firstNestedText(record.text);
    if (label) parts.push(`[${label}]`);
    handledKeys.add("text");
  } else if (tag === "input" || (tag && SELECT_TAGS.has(tag))) {
    const placeholder = firstNestedText(record.placeholder);
    if (placeholder) {
      parts.push(`[${tag === "input" ? "input" : "select"}: ${placeholder}]`);
    }
    handledKeys.add("placeholder");
  } else if (tag === "img" || tag === "image") {
    const alt = firstNestedText(record.alt);
    parts.push(alt ? `[image: ${alt}]` : "[image]");
    handledKeys.add("alt");
  }
  return handledKeys;
}

function collectCardText(value: unknown, parts: string[], parentKey: string | null = null): void {
  if (Array.isArray(value)) {
    for (const child of value) collectCardText(child, parts, parentKey);
    return;
  }
  if (typeof value === "string") {
    if (parentKey && TEXT_KEYS.has(parentKey)) parts.push(value);
    return;
  }
  const record = asRecord(value);
  if (!record) return;
  const handledKeys = appendTaggedCardText(record, parts);

  for (const [key, child] of Object.entries(record)) {
    if (handledKeys.has(key)) continue;
    if (TEXT_KEYS.has(key) || CHILD_KEYS.has(key)) {
      collectCardText(child, parts, key);
    }
  }
}

export function parseLarkInteractiveCardText(rawContent: string | null): string {
  if (!rawContent) return "[interactive]";
  const parsed = parseJsonRecord(rawContent);
  if (!parsed) return "[interactive]";

  const parts: string[] = [];
  collectCardText(unwrapCard(parsed), parts);
  const unique = parts
    .map((part) => part.trim())
    .filter((part, index, all) => part.length > 0 && all.indexOf(part) === index);
  return unique.join("\n") || "[interactive]";
}
