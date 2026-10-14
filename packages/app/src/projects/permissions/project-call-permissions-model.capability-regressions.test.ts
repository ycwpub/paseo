import { describe, expect, it } from "vitest";

import {
  createEnabledProjectCallPermissionsDraft,
  projectCallPermissionsDraftToConfig,
  projectCallPermissionsToDraft,
} from "./project-call-permissions-model";

describe("Project call permissions editor model", () => {
  it("keeps an unconfigured legacy Project free of permission fields", () => {
    const draft = projectCallPermissionsToDraft(undefined);

    expect(draft).toMatchObject({
      configured: false,
      enabled: false,
      defaultAction: "deny",
      enforcement: "strict",
    });
    expect(projectCallPermissionsDraftToConfig(draft)).toBeUndefined();
  });

  it("defaults a newly enabled policy to strict default-deny", () => {
    expect(createEnabledProjectCallPermissionsDraft()).toMatchObject({
      configured: true,
      enabled: true,
      defaultAction: "deny",
      enforcement: "strict",
      rpcRules: [],
      httpRules: [],
    });
  });

  it("round-trips RPC and HTTP rule rows into Project config", () => {
    const draft = projectCallPermissionsToDraft({
      enabled: true,
      defaultAction: "deny",
      enforcement: "managed",
      rpcRules: [
        {
          id: "allow-read",
          action: "allow",
          target: { type: "prefix", value: "mcp:paseo/read_" },
        },
      ],
      httpRules: [
        {
          id: "allow-api",
          action: "allow",
          protocols: ["https"],
          hosts: [{ type: "exact", value: "api.example.com" }],
          methods: ["GET"],
          path: { type: "prefix", value: "/v1/" },
        },
      ],
    });

    expect(projectCallPermissionsDraftToConfig(draft)).toEqual({
      enabled: true,
      defaultAction: "deny",
      enforcement: "managed",
      rpcRules: [
        {
          id: "allow-read",
          action: "allow",
          target: { type: "prefix", value: "mcp:paseo/read_" },
          enabled: true,
        },
      ],
      httpRules: [
        {
          id: "allow-api",
          action: "allow",
          protocols: ["https"],
          hosts: [{ type: "exact", value: "api.example.com" }],
          methods: ["GET"],
          path: { type: "prefix", value: "/v1/" },
          enabled: true,
        },
      ],
    });
  });
});
