import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import { settingsStyles } from "@/styles/settings";

function resourceSummary(plugin: PluginSummary): string[] {
  const resources: string[] = [];
  if (plugin.skills.length > 0) resources.push(`Skills: ${plugin.skills.join(", ")}`);
  if (plugin.mcpServers.length > 0) resources.push(`MCP: ${plugin.mcpServers.join(", ")}`);
  if (plugin.apps.length > 0)
    resources.push(`Apps: ${plugin.apps.map((app) => app.id).join(", ")}`);
  return resources;
}

export function PluginDetailsSurface({ plugin }: { plugin: PluginSummary }) {
  const resources = resourceSummary(plugin);
  return (
    <View style={styles.container}>
      <Text style={styles.description}>{plugin.description}</Text>
      <View style={[settingsStyles.card, styles.cardContent]}>
        <Text style={styles.metadata}>
          v{plugin.version} · {plugin.enabled ? "Enabled" : "Disabled"}
        </Text>
        {resources.map((resource) => (
          <Text key={resource} selectable style={styles.resourceText}>
            {resource}
          </Text>
        ))}
        {resources.length === 0 && plugin.httpServices.length === 0 ? (
          <Text style={styles.hint}>This plugin does not provide an interactive app.</Text>
        ) : null}
      </View>
      {plugin.httpServices.map((service) => (
        <View key={service.name} style={[settingsStyles.card, styles.cardContent]}>
          <View style={styles.serviceHeader}>
            <Text style={styles.serviceName}>{service.name}</Text>
            <Text style={styles.metadata}>{service.status}</Text>
          </View>
          <Text selectable style={styles.resourceText}>
            {service.submitUrl ?? `http://${service.host}:${service.configuredPort}${service.path}`}
          </Text>
          <Text selectable style={styles.pathText}>
            {service.workflowPath}
          </Text>
          {service.error ? <Text style={styles.errorText}>{service.error}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  description: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  cardContent: {
    padding: theme.spacing[4],
    gap: theme.spacing[2],
  },
  serviceHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  serviceName: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  metadata: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  resourceText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  pathText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
}));
