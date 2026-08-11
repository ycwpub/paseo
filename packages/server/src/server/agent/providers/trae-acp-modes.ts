import type { AgentProviderModeDefinition } from "@getpaseo/protocol/provider-manifest";

export const TRAE_DEFAULT_MODE_ID = "default";

export const TRAE_MODES: AgentProviderModeDefinition[] = [
  {
    id: TRAE_DEFAULT_MODE_ID,
    label: "Always Ask",
    description: "Ask for approval before running tools that require permission.",
    icon: "Shield",
    colorTier: "safe",
  },
  {
    id: "bypass_permissions",
    label: "Bypass Permissions",
    description: "Run tools without approval prompts.",
    icon: "ShieldOff",
    colorTier: "dangerous",
    isUnattended: true,
  },
  {
    id: "plan",
    label: "Plan Mode",
    description: "Analyze and plan without making changes.",
    icon: "ShieldEllipsis",
    colorTier: "planning",
  },
];
