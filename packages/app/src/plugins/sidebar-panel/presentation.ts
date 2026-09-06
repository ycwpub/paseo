import type { PluginSummary } from "@getpaseo/protocol/messages";
import { resolvePluginIcon } from "@/plugins/icons";

const ICON_RULES: ReadonlyArray<{ icon: string; terms: readonly string[] }> = [
  { icon: "Siren", terms: ["argos", "alert", "alarm", "报警", "告警"] },
  { icon: "ScanSearch", terms: ["bamboo", "troubleshoot", "排查"] },
  { icon: "Scale", terms: ["reconciliation", "finance", "settle", "对账", "结算"] },
  { icon: "Webhook", terms: ["http", "webhook", "service", "接口", "服务"] },
  { icon: "PanelsTopLeft", terms: ["web app", "web-app", "网页", "页面"] },
  { icon: "Workflow", terms: ["workflow", "流程"] },
  { icon: "Code2", terms: ["development", "developer", "code", "研发", "开发"] },
  { icon: "MessageSquare", terms: ["lark", "feishu", "飞书", "消息"] },
  { icon: "Bot", terms: ["agent", "assistant", "助手", "智能体"] },
  { icon: "BookOpen", terms: ["knowledge", "document", "知识", "文档"] },
  { icon: "Plug", terms: ["mcp", "integration", "集成"] },
];

function searchablePluginText(plugin: PluginSummary): string {
  return [
    plugin.pluginId,
    plugin.name,
    plugin.displayName,
    plugin.description,
    plugin.category,
    ...(plugin.keywords ?? []),
    ...(plugin.skills ?? []),
    ...(plugin.mcpServers ?? []),
    ...(plugin.httpServices ?? []).flatMap((service) => [service.name, service.path]),
    ...(plugin.apps ?? []).flatMap((app) => [app.id, app.category]),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLocaleLowerCase();
}

export function resolvePluginLauncherIcon(plugin: PluginSummary): string {
  const configuredIcon = plugin.apps?.[0]?.icon?.trim();
  if (configuredIcon) {
    try {
      resolvePluginIcon(configuredIcon);
      return configuredIcon;
    } catch {
      // Fall back to capability-based presentation for invalid third-party icon names.
    }
  }

  const searchable = searchablePluginText(plugin);
  return (
    ICON_RULES.find(({ terms }) =>
      terms.some((term) => searchable.includes(term.toLocaleLowerCase())),
    )?.icon ?? "Puzzle"
  );
}
