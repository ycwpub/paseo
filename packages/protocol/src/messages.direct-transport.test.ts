import { describe, expect, test } from "vitest";
import { WSOutboundMessageSchema } from "./messages.js";

describe("LAN direct transport protocol", () => {
  test("accepts a Relay-delivered direct connection offer", () => {
    expect(
      WSOutboundMessageSchema.parse({
        type: "transport.direct_offer",
        candidates: [
          "ws://192.168.1.10:43210/ws?directToken=one-time-token",
          "ws://10.0.0.5:43210/ws?directToken=one-time-token",
        ],
        expiresAt: "2026-07-30T04:00:00.000Z",
      }),
    ).toEqual({
      type: "transport.direct_offer",
      candidates: [
        "ws://192.168.1.10:43210/ws?directToken=one-time-token",
        "ws://10.0.0.5:43210/ws?directToken=one-time-token",
      ],
      expiresAt: "2026-07-30T04:00:00.000Z",
    });
  });

  test("rejects empty or non-WebSocket candidate lists", () => {
    expect(
      WSOutboundMessageSchema.safeParse({
        type: "transport.direct_offer",
        candidates: [],
        expiresAt: "2026-07-30T04:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      WSOutboundMessageSchema.safeParse({
        type: "transport.direct_offer",
        candidates: ["not-a-url"],
        expiresAt: "2026-07-30T04:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
