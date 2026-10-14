import type {
  ProjectCallPermissions,
  ProjectHttpPermissionRule,
  ProjectRpcPermissionRule,
} from "@getpaseo/protocol/messages";

export interface ProjectRpcPermissionRuleDraft extends ProjectRpcPermissionRule {
  rowId: string;
}

export interface ProjectHttpPermissionRuleDraft extends ProjectHttpPermissionRule {
  rowId: string;
}

export interface ProjectCallPermissionsDraft {
  configured: boolean;
  enabled: boolean;
  defaultAction: "allow" | "deny";
  enforcement: "managed" | "strict";
  rpcRules: ProjectRpcPermissionRuleDraft[];
  httpRules: ProjectHttpPermissionRuleDraft[];
}

let permissionDraftCounter = 0;

function nextPermissionDraftId(prefix: string): string {
  permissionDraftCounter += 1;
  return `${prefix}-${permissionDraftCounter}`;
}

export function projectCallPermissionsToDraft(
  permissions: ProjectCallPermissions | null | undefined,
): ProjectCallPermissionsDraft {
  return {
    configured: permissions !== null && permissions !== undefined,
    enabled: permissions?.enabled === true,
    defaultAction: permissions?.defaultAction ?? "deny",
    enforcement: permissions?.enforcement ?? "strict",
    rpcRules: (permissions?.rpcRules ?? []).map((rule) =>
      Object.assign({}, rule, {
        enabled: rule.enabled !== false,
        rowId: nextPermissionDraftId("rpc-rule"),
      }),
    ),
    httpRules: (permissions?.httpRules ?? []).map((rule) =>
      Object.assign({}, rule, {
        enabled: rule.enabled !== false,
        rowId: nextPermissionDraftId("http-rule"),
      }),
    ),
  };
}

export function createEnabledProjectCallPermissionsDraft(): ProjectCallPermissionsDraft {
  return {
    configured: true,
    enabled: true,
    defaultAction: "deny",
    enforcement: "strict",
    rpcRules: [],
    httpRules: [],
  };
}

export function projectCallPermissionsDraftToConfig(
  draft: ProjectCallPermissionsDraft,
): ProjectCallPermissions | undefined {
  if (!draft.configured) return undefined;
  return {
    enabled: draft.enabled,
    defaultAction: draft.defaultAction,
    enforcement: draft.enforcement,
    rpcRules: draft.rpcRules.map(({ rowId: _rowId, ...rule }) => ({
      ...rule,
      enabled: rule.enabled !== false,
    })),
    httpRules: draft.httpRules.map(({ rowId: _rowId, ...rule }) => ({
      ...rule,
      enabled: rule.enabled !== false,
    })),
  };
}

export function createProjectRpcPermissionRuleDraft(): ProjectRpcPermissionRuleDraft {
  const rowId = nextPermissionDraftId("rpc-rule");
  return {
    rowId,
    id: rowId,
    action: "allow",
    target: { type: "exact", value: "" },
    enabled: true,
  };
}

export function createProjectHttpPermissionRuleDraft(): ProjectHttpPermissionRuleDraft {
  const rowId = nextPermissionDraftId("http-rule");
  return {
    rowId,
    id: rowId,
    action: "allow",
    protocols: ["https"],
    hosts: [{ type: "exact", value: "" }],
    methods: ["GET"],
    path: { type: "prefix", value: "/" },
    enabled: true,
  };
}
