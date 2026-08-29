import { useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native-unistyles";

import { useHosts } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import type { Assistant, McpServer, Skill, Team } from "@getpaseo/protocol/messages";
import { AssistantEditorPage, AssistantsSection } from "./assistants/assistants-section";
import {
  InstructionTemplateEditorPage,
  InstructionTemplatesListPage,
} from "./agents/instruction-templates-section";
import {
  LarkChannelSection,
  type LarkChannelDetailNavigation,
} from "./channels/lark-channel-section";
import { McpEditorPage, McpSection } from "./mcp/mcp-section";
import { MemorySection } from "./memory/memory-section";
import { MemorySettingsPage } from "./memory/memory-settings-page";
import { PluginsSection } from "./plugins/plugins-section";
import { SkillEditorPage, SkillsSection } from "./skills/skills-section";
import { TeamEditorPage, TeamsSection } from "./teams/teams-section";
import {
  buildAssistantSettingsRoute,
  buildInstructionTemplateSettingsRoute,
  buildMcpServerSettingsRoute,
  buildSkillSettingsRoute,
  buildTeamSettingsRoute,
  type HostMemorySettingsPage,
} from "@/utils/host-routes";

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
  const router = useRouter();
  const createAssistant = useCallback(
    () => router.push(buildAssistantSettingsRoute(serverId)),
    [router, serverId],
  );
  const editAssistant = useCallback(
    (assistant: Assistant) => router.push(buildAssistantSettingsRoute(serverId, assistant.id)),
    [router, serverId],
  );
  const createTeam = useCallback(
    () => router.push(buildTeamSettingsRoute(serverId)),
    [router, serverId],
  );
  const editTeam = useCallback(
    (team: Team) => router.push(buildTeamSettingsRoute(serverId, team.id)),
    [router, serverId],
  );
  return (
    <HostResourcePage serverId={serverId}>
      <AssistantsSection serverId={serverId} onCreate={createAssistant} onEdit={editAssistant} />
      <TeamsSection serverId={serverId} onCreate={createTeam} onEdit={editTeam} />
    </HostResourcePage>
  );
}

export function HostAssistantEditorPage({
  serverId,
  assistantId,
  onDone,
}: {
  serverId: string;
  assistantId?: string;
  onDone: () => void;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <AssistantEditorPage serverId={serverId} assistantId={assistantId} onDone={onDone} />
    </HostResourcePage>
  );
}

export function HostTeamEditorPage({
  serverId,
  teamId,
  onDone,
}: {
  serverId: string;
  teamId?: string;
  onDone: () => void;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <TeamEditorPage serverId={serverId} teamId={teamId} onDone={onDone} />
    </HostResourcePage>
  );
}

export function HostInstructionTemplatesPage({ serverId }: { serverId: string }) {
  const router = useRouter();
  const createTemplate = useCallback(
    () => router.push(buildInstructionTemplateSettingsRoute(serverId)),
    [router, serverId],
  );
  const editTemplate = useCallback(
    (templateId: string) =>
      router.push(buildInstructionTemplateSettingsRoute(serverId, templateId)),
    [router, serverId],
  );

  return (
    <HostResourcePage serverId={serverId}>
      <InstructionTemplatesListPage
        serverId={serverId}
        onCreate={createTemplate}
        onEdit={editTemplate}
      />
    </HostResourcePage>
  );
}

export function HostInstructionTemplateEditorPage({
  serverId,
  templateId,
  onDone,
}: {
  serverId: string;
  templateId?: string;
  onDone: () => void;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <InstructionTemplateEditorPage serverId={serverId} templateId={templateId} onDone={onDone} />
    </HostResourcePage>
  );
}

export function HostMcpPage({ serverId }: { serverId: string }) {
  const router = useRouter();
  const createServer = useCallback(
    () => router.push(buildMcpServerSettingsRoute(serverId)),
    [router, serverId],
  );
  const editServer = useCallback(
    (server: McpServer) => router.push(buildMcpServerSettingsRoute(serverId, server.id)),
    [router, serverId],
  );
  return (
    <HostResourcePage serverId={serverId}>
      <McpSection serverId={serverId} onCreate={createServer} onEdit={editServer} />
    </HostResourcePage>
  );
}

export function HostMcpEditorPage({
  serverId,
  mcpServerId,
  onDone,
}: {
  serverId: string;
  mcpServerId?: string;
  onDone: () => void;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <McpEditorPage serverId={serverId} mcpServerId={mcpServerId} onDone={onDone} />
    </HostResourcePage>
  );
}

export function HostMemoryPage({ serverId }: { serverId: string }) {
  return (
    <HostResourcePage serverId={serverId}>
      <MemorySection serverId={serverId} />
    </HostResourcePage>
  );
}

export function HostMemorySettingsPage({
  serverId,
  page,
}: {
  serverId: string;
  page: HostMemorySettingsPage;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <MemorySettingsPage serverId={serverId} page={page} />
    </HostResourcePage>
  );
}

export function HostSkillsPage({ serverId }: { serverId: string }) {
  const router = useRouter();
  const createSkill = useCallback(
    () => router.push(buildSkillSettingsRoute(serverId)),
    [router, serverId],
  );
  const editSkill = useCallback(
    (skill: Skill) => router.push(buildSkillSettingsRoute(serverId, skill.id)),
    [router, serverId],
  );
  return (
    <HostResourcePage serverId={serverId}>
      <SkillsSection serverId={serverId} onCreate={createSkill} onEdit={editSkill} />
    </HostResourcePage>
  );
}

export function HostSkillEditorPage({
  serverId,
  skillId,
  onDone,
}: {
  serverId: string;
  skillId?: string;
  onDone: () => void;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <SkillEditorPage serverId={serverId} skillId={skillId} onDone={onDone} />
    </HostResourcePage>
  );
}

export function HostPluginsPage({ serverId }: { serverId: string }) {
  return (
    <HostResourcePage serverId={serverId}>
      <PluginsSection serverId={serverId} />
    </HostResourcePage>
  );
}

export function HostChannelsPage({
  serverId,
  onDetailNavigationChange,
}: {
  serverId: string;
  onDetailNavigationChange?: (navigation: LarkChannelDetailNavigation | null) => void;
}) {
  return (
    <HostResourcePage serverId={serverId}>
      <LarkChannelSection serverId={serverId} onDetailNavigationChange={onDetailNavigationChange} />
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
