export interface ArgosMessage {
  chat_id?: string;
  message_id?: string;
  message_app_link?: string;
  create_time?: string;
  msg_type?: string;
  content?: string;
}

export interface ArgosIdentifiers {
  resultId: string;
  ruleId: string;
  problemId: string;
  alertGroupId: string;
  sendItemId: string;
}

export interface ArgosAlert {
  unique_id: string;
  result_id: string;
  alarm_record_detail_id?: string;
  rule_id: string;
  psm: string;
  level: string;
  rule_name: string;
  result_time: string;
  message_create_time: string;
  alarm_date: string;
  rule_url: string;
  result_url: string;
  rule_content: string;
  result_content: string;
  extra: Record<string, unknown>;
}

export function normalizeArgosRuleName(ruleName: unknown): string;

export function extractArgosIdentifiers(text: unknown): ArgosIdentifiers;

export function extractArgosAlertFromMessage(message: ArgosMessage): ArgosAlert | null;

export function buildArgosBaseRecord(
  alert: ArgosAlert,
  fieldNames?: string[],
  status?: string,
): Record<string, unknown>;

export function isValidFeishuDocumentUrl(value: unknown): boolean;
