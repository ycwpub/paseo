import { describe, expect, it } from "vitest";
import type { AlertTroubleshooterRecord } from "./alert-troubleshooter-record-store.js";
import {
  applyBambooPreparedRecordMetadata,
  resolveBambooPreparedRecordMetadata,
} from "./bamboo-prepared-record-metadata.js";

const RECORD: AlertTroubleshooterRecord = {
  recordId: "recvuGHvu5oYNh",
  uniqueId: "19626626",
  resultId: "19626626",
  alarmRecordDetailId: "0",
  taskId: "",
  tableDate: "20260909",
  messageId: null,
  chatId: null,
  chatName: null,
  messageText: "",
  messageTime: null,
  trigger: "table",
  extra: { trigger: "table" },
};

describe("Bamboo prepared record metadata", () => {
  it("extracts the real alarm detail and rule IDs from prepared Bamboo data", () => {
    const metadata = resolveBambooPreparedRecordMetadata({
      resultId: "19626626",
      record: RECORD,
      prepared: {
        result_id: "19626626",
        rule_id: "4086",
        work_item: { result_id: "19626626", rule_id: "4086" },
        inspect_result: {
          resultId: "19626626",
          result: {
            id: 19626626,
            alarm_detail_id: 77762173,
            rules_id: 4086,
            result_id: 0,
          },
        },
      },
    });

    expect(metadata).toEqual({
      resultId: "19626626",
      alarmRecordDetailId: "77762173",
      taskId: "4086",
      ruleId: "4086",
    });
    expect(applyBambooPreparedRecordMetadata(RECORD, metadata)).toMatchObject({
      alarmRecordDetailId: "77762173",
      taskId: "4086",
      ruleId: "4086",
      extra: {
        trigger: "table",
        rule_id: "4086",
        rules_id: "4086",
      },
    });
  });

  it("rejects a prepared rule ID that conflicts with the Bamboo result", () => {
    expect(() =>
      resolveBambooPreparedRecordMetadata({
        resultId: "19626626",
        record: RECORD,
        prepared: {
          result_id: "19626626",
          rule_id: "9999",
          inspect_result: {
            resultId: "19626626",
            result: {
              id: 19626626,
              alarm_detail_id: 77762173,
              rules_id: 4086,
            },
          },
        },
      }),
    ).toThrow("Bamboo rules_id 不一致");
  });

  it("rejects prepared IDs that conflict with an existing Base record", () => {
    expect(() =>
      resolveBambooPreparedRecordMetadata({
        resultId: "19626626",
        record: {
          ...RECORD,
          alarmRecordDetailId: "77760000",
        },
        prepared: {
          result_id: "19626626",
          rule_id: "4086",
          inspect_result: {
            resultId: "19626626",
            result: {
              id: 19626626,
              alarm_detail_id: 77762173,
              rules_id: 4086,
            },
          },
        },
      }),
    ).toThrow("Bamboo 记录 alarm_record_detail_id 不一致");
  });
});
