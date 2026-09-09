import type { AlertTroubleshooterRecord } from "./alert-troubleshooter-record-store.js";
import type { BambooPreparedAgentData } from "./bamboo-agent-runner.js";

export interface BambooPreparedRecordMetadata {
  resultId: string;
  alarmRecordDetailId: string;
  taskId: string;
  ruleId: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function positiveIntegerString(value: unknown): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[1-9]\d*$/u.test(normalized) ? normalized : null;
}

function assertMatchingId(label: string, expected: string, candidate: string | null): void {
  if (candidate && candidate !== expected) {
    throw new Error(`${label} 不一致：期望 ${expected}，实际 ${candidate}`);
  }
}

export function resolveBambooPreparedRecordMetadata(input: {
  resultId: string;
  record: AlertTroubleshooterRecord;
  prepared: BambooPreparedAgentData;
}): BambooPreparedRecordMetadata {
  const expectedResultId = positiveIntegerString(input.resultId);
  if (!expectedResultId) throw new Error(`Bamboo result_id 无效：${input.resultId}`);

  const preparedRecord = objectValue(input.prepared);
  const inspectResult = objectValue(preparedRecord.inspect_result);
  const bambooResult = objectValue(inspectResult.result);
  assertMatchingId(
    "Bamboo prepared result_id",
    expectedResultId,
    positiveIntegerString(preparedRecord.result_id),
  );
  assertMatchingId(
    "Bamboo inspect result_id",
    expectedResultId,
    positiveIntegerString(inspectResult.resultId),
  );
  assertMatchingId(
    "Bamboo result detail id",
    expectedResultId,
    positiveIntegerString(bambooResult.id),
  );
  assertMatchingId(
    "Bamboo 记录 result_id",
    expectedResultId,
    positiveIntegerString(input.record.resultId),
  );

  const preparedRuleId = positiveIntegerString(preparedRecord.rule_id);
  const bambooRuleId = positiveIntegerString(bambooResult.rules_id);
  const workItemRuleId = positiveIntegerString(objectValue(preparedRecord.work_item).rule_id);
  const ruleId = preparedRuleId ?? bambooRuleId ?? workItemRuleId;
  if (!ruleId) {
    throw new Error(`Bamboo result_id=${expectedResultId} 的准备结果缺少有效 rules_id`);
  }
  for (const candidate of [preparedRuleId, bambooRuleId, workItemRuleId]) {
    assertMatchingId("Bamboo rules_id", ruleId, candidate);
  }
  assertMatchingId("Bamboo 记录 rule_id", ruleId, positiveIntegerString(input.record.ruleId));
  assertMatchingId("Bamboo 记录 task_id", ruleId, positiveIntegerString(input.record.taskId));

  const preparedAlarmRecordDetailId =
    positiveIntegerString(bambooResult.alarm_record_detail_id) ??
    positiveIntegerString(bambooResult.alarm_detail_id);
  const recordAlarmRecordDetailId = positiveIntegerString(input.record.alarmRecordDetailId);
  const alarmRecordDetailId = preparedAlarmRecordDetailId ?? recordAlarmRecordDetailId;
  if (!alarmRecordDetailId) {
    throw new Error(
      `Bamboo result_id=${expectedResultId} 的准备结果缺少有效 alarm_record_detail_id`,
    );
  }
  assertMatchingId(
    "Bamboo 记录 alarm_record_detail_id",
    alarmRecordDetailId,
    recordAlarmRecordDetailId,
  );

  return {
    resultId: expectedResultId,
    alarmRecordDetailId,
    taskId: ruleId,
    ruleId,
  };
}

export function applyBambooPreparedRecordMetadata(
  record: AlertTroubleshooterRecord,
  metadata: BambooPreparedRecordMetadata,
): AlertTroubleshooterRecord {
  return {
    ...record,
    resultId: metadata.resultId,
    alarmRecordDetailId: metadata.alarmRecordDetailId,
    taskId: metadata.taskId,
    ruleId: metadata.ruleId,
    extra: {
      ...record.extra,
      rule_id: metadata.ruleId,
      rules_id: metadata.ruleId,
    },
  };
}
