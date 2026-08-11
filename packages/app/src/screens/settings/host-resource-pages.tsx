import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { useHosts } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { AssistantsSection } from "./assistants/assistants-section";
import { LarkChannelSection } from "./channels/lark-channel-section";
import { McpSection } from "./mcp/mcp-section";
import { SkillsSection } from "./skills/skills-section";
import { TeamsSection } from "./teams/teams-section";

function HostResourcePage({ serverId, children }: { serverId: string; children: ReactNode }) {
  const { t } = useTranslation();
  const hosts = useHosts();
  if (!hosts.some((host) => host.serverId === serverId)) {
    return (
      <View>
        <View style={[settingsStyles.card, styles.emptyCard]}>
          <Text style={styles.emptyText}>{t("settings.host.notFound")}</Text>
        </View>
      </View>
    );
  }
  return <View>{children}</View>;
}

export function HostAssistantsPage({ serverId }: { serverId: string }) {
  return (
    <HostResourcePage serverId={serverId}>
      <AssistantsSection serverId={serverId} />
      <TeamsSection serverId={serverId} />
    </HostResourcePage>
  );
}

export function HostMcpPage({ serverId }: { serverId: string }) {
  return (
    <HostResourcePage serverId={serverId}>
      <McpSection serverId={serverId} />
    </HostResourcePage>
  );
}

export function HostSkillsPage({ serverId }: { serverId: string }) {
  return (
    <HostResourcePage serverId={serverId}>
      <SkillsSection serverId={serverId} />
    </HostResourcePage>
  );
}

export function HostChannelsPage({ serverId }: { serverId: string }) {
  return (
    <HostResourcePage serverId={serverId}>
      <LarkChannelSection serverId={serverId} />
    </HostResourcePage>
  );
}

const styles = StyleSheet.create((theme) => ({
  emptyCard: {
    padding: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
