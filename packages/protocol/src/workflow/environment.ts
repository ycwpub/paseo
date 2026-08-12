import { z } from "zod";

export const WorkflowEnvironmentSchema = z.object({
  inherit: z.enum(["daemon", "login-shell"]).optional(),
  variables: z
    .record(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/), z.string().max(20_000))
    .refine((variables) => Object.keys(variables).length <= 200, {
      message: "Workflow environment variables cannot exceed 200 entries",
    })
    .optional(),
});
export type WorkflowEnvironment = z.infer<typeof WorkflowEnvironmentSchema>;
