import { describe, expect, it } from "vitest";
import { createLarkRecordClientToken } from "./lark-record-client-token.js";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

describe("createLarkRecordClientToken", () => {
  it("returns a standard UUID v4 for long Lark message identities", () => {
    const token = createLarkRecordClientToken({
      pluginId: "bamboo-reconciliation-troubleshooter",
      projectId: "prj_4491f78e4a562498",
      uniqueId: "om_x100b66c9d98f48a8c2c5152968ce2c7:om_x100b66dc4fc1c8a0b36e38fcccb3ce9",
    });

    expect(token).toMatch(UUID_V4_PATTERN);
    expect(token).toHaveLength(36);
  });

  it("is stable for retries and distinct for different records", () => {
    const input = {
      pluginId: "bamboo-reconciliation-troubleshooter",
      projectId: "prj_1",
      uniqueId: "result_id:123456",
    };

    expect(createLarkRecordClientToken(input)).toBe(createLarkRecordClientToken(input));
    expect(createLarkRecordClientToken(input)).not.toBe(
      createLarkRecordClientToken({ ...input, uniqueId: "result_id:654321" }),
    );
  });
});
