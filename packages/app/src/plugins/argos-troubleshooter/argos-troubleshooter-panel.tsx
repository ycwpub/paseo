import {
  ARGOS_TROUBLESHOOTER_APP_ID,
  ARGOS_TROUBLESHOOTER_CONFIG_DATA_KEY,
  ARGOS_TROUBLESHOOTER_PLUGIN_ID,
  ARGOS_TROUBLESHOOTER_RUNTIME_DATA_KEY,
  ArgosTroubleshooterConfigSchema,
  ArgosTroubleshooterRuntimeSchema,
  type PluginAppDefinition,
  type PluginSummary,
} from "@getpaseo/protocol/messages";
import {
  AlertTroubleshooterPanel,
  type AlertTroubleshooterPanelSpec,
} from "@/plugins/alert-troubleshooter/alert-troubleshooter-panel";

export { ARGOS_TROUBLESHOOTER_PLUGIN_ID };

const SPEC: AlertTroubleshooterPanelSpec = {
  pluginId: ARGOS_TROUBLESHOOTER_PLUGIN_ID,
  appId: ARGOS_TROUBLESHOOTER_APP_ID,
  configDataKey: ARGOS_TROUBLESHOOTER_CONFIG_DATA_KEY,
  runtimeDataKey: ARGOS_TROUBLESHOOTER_RUNTIME_DATA_KEY,
  productName: "Argos",
  allowAgentAutoArchive: true,
  showRunnerOptions: true,
  configSchema: ArgosTroubleshooterConfigSchema,
  runtimeSchema: ArgosTroubleshooterRuntimeSchema,
};

export function ArgosTroubleshooterPanel(props: {
  active: boolean;
  serverId: string;
  plugin: PluginSummary;
  appDefinition: PluginAppDefinition;
  initialProjectId?: string;
}) {
  return <AlertTroubleshooterPanel {...props} spec={SPEC} />;
}
