import { describe, expect, it } from "vitest";

import {
  ProjectCallPermissionsSchema,
  evaluateProjectCallPermission,
} from "./project-call-permissions.js";

describe("Project call permissions", () => {
  it("keeps Projects without a policy compatible", () => {
    expect(
      evaluateProjectCallPermission(undefined, {
        kind: "rpc",
        target: "mcp:paseo/create_agent",
      }),
    ).toEqual({
      allowed: true,
      reason: "policy_disabled",
      matchedRuleId: null,
      enforcement: "managed",
    });
  });

  it("uses deny precedence even when an allow rule also matches", () => {
    const policy = ProjectCallPermissionsSchema.parse({
      enabled: true,
      defaultAction: "deny",
      rpcRules: [
        {
          id: "allow-paseo",
          action: "allow",
          target: { type: "prefix", value: "mcp:paseo/" },
        },
        {
          id: "deny-delete",
          action: "deny",
          target: { type: "glob", value: "mcp:paseo/delete_*" },
        },
      ],
    });

    expect(
      evaluateProjectCallPermission(policy, {
        kind: "rpc",
        target: "mcp:paseo/delete_agent",
      }),
    ).toEqual({
      allowed: false,
      reason: "matched_deny",
      matchedRuleId: "deny-delete",
      enforcement: "managed",
    });
  });

  it("supports exact, prefix, glob, and regular-expression RPC targets", () => {
    const policy = ProjectCallPermissionsSchema.parse({
      enabled: true,
      defaultAction: "deny",
      rpcRules: [
        {
          id: "exact",
          action: "allow",
          target: { type: "exact", value: "mcp:alpha/read" },
        },
        {
          id: "prefix",
          action: "allow",
          target: { type: "prefix", value: "plugin-rpc:calendar/" },
        },
        {
          id: "glob",
          action: "allow",
          target: { type: "glob", value: "workflow:daily-*/run" },
        },
        {
          id: "regex",
          action: "allow",
          target: { type: "regex", value: "^paseo-rpc:channel\\.lark\\.[^.]+\\.request$" },
        },
      ],
    });

    for (const target of [
      "mcp:alpha/read",
      "plugin-rpc:calendar/create",
      "workflow:daily-settlement/run",
      "paseo-rpc:channel.lark.scan.request",
    ]) {
      expect(evaluateProjectCallPermission(policy, { kind: "rpc", target }).allowed).toBe(true);
    }
    expect(
      evaluateProjectCallPermission(policy, {
        kind: "rpc",
        target: "mcp:alpha/write",
      }),
    ).toMatchObject({ allowed: false, reason: "default_deny" });
  });

  it("matches HTTP protocol, host, port, method, and path together", () => {
    const policy = ProjectCallPermissionsSchema.parse({
      enabled: true,
      defaultAction: "deny",
      enforcement: "strict",
      httpRules: [
        {
          id: "allow-bamboo-read",
          action: "allow",
          protocols: ["https"],
          hosts: [{ type: "glob", value: "*.bytedance.net" }],
          ports: [443],
          methods: ["GET"],
          path: { type: "prefix", value: "/api/bamboo/" },
        },
      ],
    });

    expect(
      evaluateProjectCallPermission(policy, {
        kind: "http",
        url: "https://quality.bytedance.net/api/bamboo/results?id=1",
        method: "GET",
      }),
    ).toEqual({
      allowed: true,
      reason: "matched_allow",
      matchedRuleId: "allow-bamboo-read",
      enforcement: "strict",
    });
    expect(
      evaluateProjectCallPermission(policy, {
        kind: "http",
        url: "https://quality.bytedance.net/api/bamboo/results",
        method: "POST",
      }),
    ).toMatchObject({ allowed: false, reason: "default_deny" });
  });
});
