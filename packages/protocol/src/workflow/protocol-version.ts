export const WORKFLOW_PROTOCOL_API_VERSION = "paseo.sh/workflow/v1" as const;
export const WORKFLOW_PROTOCOL_KIND = "Workflow" as const;
export const WORKFLOW_PROTOCOL_VERSION = 1 as const;

/**
 * Increment this value whenever Workflow v1 gains or changes observable
 * execution semantics without changing its major version.
 */
export const WORKFLOW_PROTOCOL_REVISION = 3 as const;
