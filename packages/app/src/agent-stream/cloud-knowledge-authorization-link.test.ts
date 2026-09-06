import { describe, expect, it } from "vitest";
import { resolveCloudKnowledgeAuthorizationUrl } from "./cloud-knowledge-authorization-link";

describe("resolveCloudKnowledgeAuthorizationUrl", () => {
  it("returns the structured cloud knowledge authorization link", () => {
    expect(
      resolveCloudKnowledgeAuthorizationUrl({
        permissionType: "cloud-knowledge-auth",
        source: "https://bytedance.larkoffice.com/wiki/document",
        loginUrl: "https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=flow&user_code=ABCD",
      }),
    ).toBe("https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=flow&user_code=ABCD");
  });

  it("does not present the cloud document itself as an authorization link", () => {
    const source = "https://bytedance.larkoffice.com/wiki/document";
    expect(
      resolveCloudKnowledgeAuthorizationUrl({
        permissionType: "cloud-knowledge-auth",
        source,
        loginUrl: source,
      }),
    ).toBeNull();
  });
});
