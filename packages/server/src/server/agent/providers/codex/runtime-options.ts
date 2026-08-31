import { z } from "zod";
import { CodexProviderOptionsSchema } from "./options.js";

export const CodexRuntimeOptionsSchema = CodexProviderOptionsSchema.extend({
  compact_prompt: z.string().optional(),
});

export type CodexRuntimeOptions = z.infer<typeof CodexRuntimeOptionsSchema>;
