import { z } from "zod";

export const PluginRuntimeSummarySchema = z.object({
  path: z.string(),
  enabled: z.boolean(),
  status: z.enum(["running", "disabled", "failed"]),
  source: z.enum(["directory", "git"]).optional(),
  remote: z.string().optional(),
  ref: z.string().optional(),
  commit: z.string().optional(),
  error: z.string().optional(),
});
export type PluginRuntimeSummary = z.infer<typeof PluginRuntimeSummarySchema>;
