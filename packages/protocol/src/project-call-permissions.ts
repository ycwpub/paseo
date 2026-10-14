import { z } from "zod";

export const ProjectCallPermissionActionSchema = z.enum(["allow", "deny"]);
export const ProjectCallPermissionEnforcementSchema = z.enum(["managed", "strict"]);
export const ProjectCallPermissionMatcherTypeSchema = z.enum(["exact", "prefix", "glob", "regex"]);

export const ProjectCallPermissionStringMatcherSchema = z
  .object({
    type: ProjectCallPermissionMatcherTypeSchema,
    value: z.string().trim().min(1),
  })
  .strict()
  .superRefine((matcher, context) => {
    if (matcher.type !== "regex") return;
    try {
      RegExp(matcher.value, "u").test("");
    } catch {
      context.addIssue({
        code: "custom",
        message: "Invalid regular expression",
        path: ["value"],
      });
    }
  });

export const ProjectRpcPermissionRuleSchema = z
  .object({
    id: z.string().trim().min(1),
    action: ProjectCallPermissionActionSchema,
    target: ProjectCallPermissionStringMatcherSchema,
    enabled: z.boolean().optional(),
  })
  .strict();

export const ProjectHttpPermissionRuleSchema = z
  .object({
    id: z.string().trim().min(1),
    action: ProjectCallPermissionActionSchema,
    protocols: z.array(z.enum(["http", "https"])).optional(),
    hosts: z.array(ProjectCallPermissionStringMatcherSchema).optional(),
    ports: z.array(z.number().int().min(1).max(65_535)).optional(),
    methods: z.array(z.string().trim().min(1)).optional(),
    path: ProjectCallPermissionStringMatcherSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export const ProjectCallPermissionsSchema = z
  .object({
    enabled: z.boolean().optional(),
    defaultAction: ProjectCallPermissionActionSchema.optional(),
    enforcement: ProjectCallPermissionEnforcementSchema.optional(),
    rpcRules: z.array(ProjectRpcPermissionRuleSchema).optional(),
    httpRules: z.array(ProjectHttpPermissionRuleSchema).optional(),
  })
  .strict();

export type ProjectCallPermissions = z.infer<typeof ProjectCallPermissionsSchema>;
export type ProjectRpcPermissionRule = z.infer<typeof ProjectRpcPermissionRuleSchema>;
export type ProjectHttpPermissionRule = z.infer<typeof ProjectHttpPermissionRuleSchema>;
export type ProjectCallPermissionStringMatcher = z.infer<
  typeof ProjectCallPermissionStringMatcherSchema
>;

export type ProjectCallRequest =
  | {
      kind: "rpc";
      target: string;
    }
  | {
      kind: "http";
      url: string;
      method: string;
    };

export type ProjectCallPermissionDecisionReason =
  | "policy_disabled"
  | "matched_deny"
  | "matched_allow"
  | "default_deny"
  | "default_allow";

export interface ProjectCallPermissionDecision {
  allowed: boolean;
  reason: ProjectCallPermissionDecisionReason;
  matchedRuleId: string | null;
  enforcement: "managed" | "strict";
}

function globPattern(value: string): RegExp {
  const source = value
    .split("*")
    .map((part) => part.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}$`, "u");
}

export function projectPermissionStringMatches(
  matcher: ProjectCallPermissionStringMatcher,
  value: string,
): boolean {
  switch (matcher.type) {
    case "exact":
      return value === matcher.value;
    case "prefix":
      return value.startsWith(matcher.value);
    case "glob":
      return globPattern(matcher.value).test(value);
    case "regex":
      return new RegExp(matcher.value, "u").test(value);
  }
}

function rpcRuleMatches(rule: ProjectRpcPermissionRule, target: string): boolean {
  return rule.enabled !== false && projectPermissionStringMatches(rule.target, target);
}

function normalizedUrlPort(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

function httpRuleMatches(
  rule: ProjectHttpPermissionRule,
  request: Extract<ProjectCallRequest, { kind: "http" }>,
): boolean {
  if (rule.enabled === false) return false;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  const protocol = url.protocol.replace(/:$/u, "");
  if (rule.protocols?.length && !rule.protocols.includes(protocol as "http" | "https")) {
    return false;
  }
  if (
    rule.hosts?.length &&
    !rule.hosts.some((matcher) =>
      projectPermissionStringMatches(matcher, url.hostname.toLowerCase()),
    )
  ) {
    return false;
  }
  if (rule.ports?.length && !rule.ports.includes(normalizedUrlPort(url))) {
    return false;
  }
  if (
    rule.methods?.length &&
    !rule.methods.some((method) => method.toUpperCase() === request.method.toUpperCase())
  ) {
    return false;
  }
  return rule.path ? projectPermissionStringMatches(rule.path, url.pathname) : true;
}

export function evaluateProjectCallPermission(
  policy: ProjectCallPermissions | null | undefined,
  request: ProjectCallRequest,
): ProjectCallPermissionDecision {
  const enforcement = policy?.enforcement ?? "managed";
  if (policy?.enabled !== true) {
    return {
      allowed: true,
      reason: "policy_disabled",
      matchedRuleId: null,
      enforcement,
    };
  }

  const matchingRules =
    request.kind === "rpc"
      ? (policy.rpcRules ?? []).filter((rule) => rpcRuleMatches(rule, request.target))
      : (policy.httpRules ?? []).filter((rule) => httpRuleMatches(rule, request));
  const denied = matchingRules.find((rule) => rule.action === "deny");
  if (denied) {
    return {
      allowed: false,
      reason: "matched_deny",
      matchedRuleId: denied.id,
      enforcement,
    };
  }
  const allowed = matchingRules.find((rule) => rule.action === "allow");
  if (allowed) {
    return {
      allowed: true,
      reason: "matched_allow",
      matchedRuleId: allowed.id,
      enforcement,
    };
  }
  const defaultAction = policy.defaultAction ?? "deny";
  return {
    allowed: defaultAction === "allow",
    reason: defaultAction === "allow" ? "default_allow" : "default_deny",
    matchedRuleId: null,
    enforcement,
  };
}
