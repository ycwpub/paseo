const PROMPT_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/gu;

export const ALERT_TROUBLESHOOTER_PROMPT_VARIABLES = [
  "project_id",
  "project_name",
  "project_directory",
  "plugin_id",
  "app_id",
  "record_id",
  "message_id",
  "chat_id",
  "unique_id",
  "result_id",
  "chat_name",
  "message_text",
  "message_time",
  "trigger",
  "troubleshooting_sop_doc",
  "attribution_record_root",
] as const;

export type AlertTroubleshooterPromptVariable =
  (typeof ALERT_TROUBLESHOOTER_PROMPT_VARIABLES)[number];

export function alertTroubleshooterPromptVariableName(name: string): string {
  return name
    .trim()
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[.\-\s]+/gu, "_")
    .replace(/_+/gu, "_")
    .toLowerCase();
}

export function normalizeAlertTroubleshooterPromptTemplate(template: string): string {
  return template.replace(PROMPT_VARIABLE_PATTERN, (_match, name: string) => {
    return `{{${alertTroubleshooterPromptVariableName(name)}}}`;
  });
}
