import { describe, expect, it } from "vitest";
import { ServerInfoStatusPayloadSchema } from "../messages.js";

describe("workflow command result protocol capability", () => {
  it("accepts daemon support for fd 3 command results", () => {
    const current = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "current",
      features: {
        workflowCommandResultFd3: true,
        workflowProtocolVersion: 1,
        workflowProtocolRevision: 1,
      },
    });
    const older = ServerInfoStatusPayloadSchema.parse({
      status: "server_info",
      serverId: "older",
    });

    expect(current.features?.workflowCommandResultFd3).toBe(true);
    expect(current.features?.workflowProtocolVersion).toBe(1);
    expect(current.features?.workflowProtocolRevision).toBe(1);
    expect(older.features?.workflowCommandResultFd3).toBeUndefined();
    expect(older.features?.workflowProtocolVersion).toBeUndefined();
    expect(older.features?.workflowProtocolRevision).toBeUndefined();
  });
});
