import type { PaseoInstructionTemplate } from "@getpaseo/protocol/messages";

export interface RenderInstructionTemplateResult {
  text: string;
  missingVariables: string[];
}

export function renderInstructionTemplate(
  content: string,
  variables: Readonly<Record<string, string>>,
): RenderInstructionTemplateResult {
  const missing = new Set<string>();
  const text = content.replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/gu,
    (placeholder, name: string) => {
      const value = variables[name];
      if (value === undefined) {
        missing.add(name);
        return placeholder;
      }
      return value;
    },
  );
  return { text, missingVariables: Array.from(missing) };
}

export function appendInstructionTemplate(current: string, rendered: string): string {
  if (!current.trim()) return rendered;
  if (!rendered.trim()) return current;
  return `${current.replace(/\s+$/u, "")}\n\n${rendered.replace(/^\s+/u, "")}`;
}

export function mergeInstructionTemplates(
  ...templateLists: Array<readonly PaseoInstructionTemplate[] | null | undefined>
): PaseoInstructionTemplate[] {
  const seenIds = new Set<string>();
  const merged: PaseoInstructionTemplate[] = [];
  for (const templates of templateLists) {
    for (const template of templates ?? []) {
      const id = template.id.trim();
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      merged.push(template);
    }
  }
  return merged;
}
