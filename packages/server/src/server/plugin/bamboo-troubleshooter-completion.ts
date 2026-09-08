import { z } from "zod";

const BambooCompletionSchema = z
  .object({
    status: z.enum(["succeeded", "pending", "not_support"]),
    summary: z.string().trim().min(1),
    feishu_doc_url: z.string().trim().url().optional(),
  })
  .superRefine((value, context) => {
    if (value.status === "succeeded" && !value.feishu_doc_url?.includes("/wiki/")) {
      context.addIssue({
        code: "custom",
        path: ["feishu_doc_url"],
        message: "succeeded 必须提供归因记录根目录下的 Wiki 排查文档链接",
      });
    }
  });

export type BambooTroubleshooterCompletion = z.infer<typeof BambooCompletionSchema>;

function jsonCandidates(text: string): string[] {
  const candidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/giu)]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
  return candidates;
}

export function parseBambooTroubleshooterCompletion(
  message: string | null | undefined,
): BambooTroubleshooterCompletion {
  if (!message?.trim()) {
    throw new Error("排查 Agent 未返回结构化终态，不能直接把记录标记为 succeeded");
  }
  for (const candidate of jsonCandidates(message)) {
    try {
      const parsed = BambooCompletionSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // Continue to the next JSON candidate.
    }
  }
  throw new Error(
    "排查 Agent 的最终结果不符合契约；必须返回 status、summary，并在 succeeded 时返回 feishu_doc_url",
  );
}
