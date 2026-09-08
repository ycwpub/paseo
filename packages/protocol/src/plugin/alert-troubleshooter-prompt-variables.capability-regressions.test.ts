import { describe, expect, it } from "vitest";
import {
  ALERT_TROUBLESHOOTER_PROMPT_VARIABLES,
  alertTroubleshooterPromptVariableName,
  normalizeAlertTroubleshooterPromptTemplate,
} from "./alert-troubleshooter-prompt-variables.js";
import { AlertTroubleshooterConfigSchema } from "./alert-troubleshooter-types.js";

describe("alert troubleshooter prompt variables", () => {
  it("publishes only underscore-separated built-in variable names", () => {
    expect(ALERT_TROUBLESHOOTER_PROMPT_VARIABLES).toContain("project_id");
    expect(ALERT_TROUBLESHOOTER_PROMPT_VARIABLES).toContain("troubleshooting_sop_doc");
    expect(ALERT_TROUBLESHOOTER_PROMPT_VARIABLES.every((name) => !/[A-Z.-]/u.test(name))).toBe(
      true,
    );
  });

  it("normalizes built-in and Project custom variables to underscore names", () => {
    expect(alertTroubleshooterPromptVariableName("projectName")).toBe("project_name");
    expect(alertTroubleshooterPromptVariableName("service.ownerName")).toBe("service_owner_name");
    expect(alertTroubleshooterPromptVariableName("SOPDocument")).toBe("sop_document");
    expect(
      normalizeAlertTroubleshooterPromptTemplate(
        "处理 {{ recordId }}，负责人 {{serviceOwnerName}}，结果 {{result_id}}",
      ),
    ).toBe("处理 {{record_id}}，负责人 {{service_owner_name}}，结果 {{result_id}}");
  });

  it("migrates saved legacy prompt templates when parsing plugin configuration", () => {
    const parsed = AlertTroubleshooterConfigSchema.parse({
      botId: "bot-1",
      chats: [{ chatId: "oc_alerts", name: "报警群" }],
      target: { kind: "default" },
      troubleshootingSopDoc: "https://example.com/wiki/sop",
      attributionRecordRoot: "https://example.com/wiki/records",
      promptTemplate:
        "项目={{projectName}} 记录={{recordId}} SOP={{troubleshootingSopDoc}} owner={{ownerName}}",
      schedule: {
        enabled: false,
        intervalMinutes: 30,
        lookbackMinutes: 120,
        excludeRecentMinutes: 0,
      },
    });

    expect(parsed.promptTemplate).toBe(
      "项目={{project_name}} 记录={{record_id}} SOP={{troubleshooting_sop_doc}} owner={{owner_name}}",
    );
  });
});
