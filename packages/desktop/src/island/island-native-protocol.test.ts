import { describe, expect, it } from "vitest";
import { parseNativeIslandHostMessage } from "./island-native-protocol";

describe("parseNativeIslandHostMessage", () => {
  it("parses helper readiness and expansion events", () => {
    expect(parseNativeIslandHostMessage('{"type":"ready"}')).toEqual({ type: "ready" });
    expect(parseNativeIslandHostMessage('{"type":"setExpanded","expanded":true}')).toEqual({
      type: "setExpanded",
      expanded: true,
    });
  });

  it("parses actions without trusting invalid ids", () => {
    expect(
      parseNativeIslandHostMessage('{"type":"action","action":"open","id":"agent-1"}'),
    ).toEqual({
      type: "action",
      action: "open",
      id: "agent-1",
    });
    expect(parseNativeIslandHostMessage('{"type":"action","action":"dismiss","id":42}')).toEqual({
      type: "action",
      action: "dismiss",
    });
    expect(parseNativeIslandHostMessage('{"type":"action","action":"clear"}')).toEqual({
      type: "action",
      action: "clear",
    });
  });

  it("parses native coordinates and drops non-finite values", () => {
    expect(
      parseNativeIslandHostMessage(
        '{"type":"positioned","displayId":1,"x":654,"top":0,"width":420,"height":64}',
      ),
    ).toEqual({
      type: "positioned",
      displayId: 1,
      x: 654,
      top: 0,
      width: 420,
      height: 64,
    });
  });

  it("rejects malformed and unknown helper messages", () => {
    expect(parseNativeIslandHostMessage("not json")).toBeNull();
    expect(parseNativeIslandHostMessage("[]")).toBeNull();
    expect(parseNativeIslandHostMessage('{"type":"unknown"}')).toBeNull();
  });
});
