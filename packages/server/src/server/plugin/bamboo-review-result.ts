import { z } from "zod";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function structuredText(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeBlocker(value: unknown): unknown {
  if (typeof value === "string") return value;
  const record = objectValue(value);
  if (!record) return structuredText(value);
  const code = nonEmptyString(record.code);
  const detail =
    nonEmptyString(record.detail) ??
    nonEmptyString(record.message) ??
    nonEmptyString(record.reason);
  const file = nonEmptyString(record.file) ?? nonEmptyString(record.path);
  const description = [code, detail].filter((part): part is string => Boolean(part)).join(": ");
  return file && description
    ? `${description} (${file})`
    : (nonEmptyString(description) ?? file ?? structuredText(value));
}

function normalizeCheckedFile(value: unknown): unknown {
  if (typeof value === "string") return value;
  const record = objectValue(value);
  if (!record) return structuredText(value);
  return nonEmptyString(record.path) ?? nonEmptyString(record.file) ?? structuredText(value);
}

export const BambooReviewResultSchema = z
  .object({
    review_passed: z.boolean(),
    blockers: z.preprocess(
      (value) => (Array.isArray(value) ? value.map(normalizeBlocker) : value),
      z.array(z.string()),
    ),
    required_rework_prompt: z.preprocess(structuredText, z.string()),
    checked_files: z.preprocess(
      (value) => (Array.isArray(value) ? value.map(normalizeCheckedFile) : value),
      z.array(z.string()).min(1),
    ),
    validation_command: z.preprocess(structuredText, z.string().min(1)),
    review_summary: z.preprocess(structuredText, z.string().min(1)),
  })
  .passthrough();

export type BambooReviewResult = z.infer<typeof BambooReviewResultSchema>;
