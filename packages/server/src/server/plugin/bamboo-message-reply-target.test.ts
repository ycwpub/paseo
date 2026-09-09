import { describe, expect, it } from "vitest";
import { resolveBambooMessageReplyTarget } from "./bamboo-message-reply-target.js";

describe("resolveBambooMessageReplyTarget", () => {
  it("uses the visible parent for a merged-forward child identity", () => {
    expect(resolveBambooMessageReplyTarget("om_parent:om_child")).toBe("om_parent");
  });

  it("keeps a normal Lark message ID unchanged", () => {
    expect(resolveBambooMessageReplyTarget("om_message")).toBe("om_message");
  });
});
