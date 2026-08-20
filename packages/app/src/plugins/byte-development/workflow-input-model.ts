const BYTE_DEVELOPMENT_WORKFLOW_INPUT_KEYS = [
  "flow_title",
  "projectId",
  "sourceProjectId",
  "prd",
  "prd_source",
  "meego_url",
  "meego_project_key",
  "meego_work_item_id",
  "meego_title",
  "repository_path",
  "lark_document_links",
  "approve_development",
  "bits_dev_task_id",
  "bits_psm",
  "bits_project_type",
  "bits_phase",
  "target_branch",
  "control_plane",
  "release_ticket_id",
  "approve_deploy",
  "approve_test",
  "approve_release",
  "memory_global",
  "memory_project",
  "memory_assistant",
  "assistant_id",
  "memory_instructions",
] as const;

/**
 * Keep the development console submission aligned with the strict Workflow
 * input schema. Persisted plugin app documents can outlive a plugin update and
 * may still contribute fields removed by a newer workflow definition.
 */
export function sanitizeByteDevelopmentWorkflowInput(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of BYTE_DEVELOPMENT_WORKFLOW_INPUT_KEYS) {
    if (Object.hasOwn(input, key) && input[key] !== undefined) {
      result[key] = input[key];
    }
  }
  return result;
}
