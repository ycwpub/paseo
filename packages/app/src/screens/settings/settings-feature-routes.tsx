import type { ComponentType, ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Brain,
  MessageCircle,
  RefreshCw,
  Sparkles,
  Wrench,
} from "lucide-react-native";
import type { SettingsView } from "@/navigation/settings-feature-navigation";
import ProjectSettingsScreen from "@/screens/project-settings-screen";
import ProjectLarkGroupScreen from "@/screens/project-lark-group-screen";
import ProjectLarkGroupsScreen from "@/screens/project-lark-groups-screen";
import { KnowledgeManagementSection } from "@/screens/settings/knowledge/knowledge-management-section";
import { MemoryManagementScreen } from "@/screens/settings/memory/memory-management-screen";
import {
  HostAssistantEditorPage,
  HostAssistantMemoryEditorPage,
  HostInstructionTemplateEditorPage,
  HostInstructionTemplatesPage,
  HostMemorySettingsPage,
  HostMcpEditorPage,
  HostSkillEditorPage,
  HostTeamEditorPage,
} from "@/screens/settings/host-page";
import { HostResourceSyncPage } from "@/screens/settings/shared/host-resource-sync-page";
import { HOST_RESOURCE_SYNC_PAGE_TITLES } from "@/screens/settings/shared/host-resource-sync-model";

export interface SettingsDetailHeader {
  title: string;
  Icon: ComponentType<{ size: number; color: string }>;
  titleAccessory?: ReactNode;
  onBack?: () => void;
}

export function renderNestedSettingsContent(
  view: SettingsView,
  onDone: () => void,
): ReactNode | undefined {
  switch (view.kind) {
    case "project":
      return (
        <ProjectSettingsScreen
          serverId={view.serverId}
          projectId={view.projectId}
          onBackToProjects={onDone}
          showBackToProjects={false}
        />
      );
    case "project-lark-groups":
      return <ProjectLarkGroupsScreen serverId={view.serverId} projectId={view.projectId} />;
    case "project-lark-group":
      return (
        <ProjectLarkGroupScreen
          serverId={view.serverId}
          projectId={view.projectId}
          groupId={view.groupId}
          onDone={onDone}
        />
      );
    case "project-knowledge":
      return (
        <KnowledgeManagementSection
          serverId={view.serverId}
          initialScope="project"
          initialProjectId={view.projectId}
        />
      );
    case "memory":
      return (
        <MemoryManagementScreen
          serverId={view.serverId}
          projectId={view.projectId}
          memoryId={view.memoryId}
          embedded
        />
      );
    case "memory-page":
      return <HostMemorySettingsPage serverId={view.serverId} page={view.page} />;
    case "resource-sync":
      return <HostResourceSyncPage serverId={view.serverId} page={view.page} />;
    case "assistant":
      return (
        <HostAssistantEditorPage
          serverId={view.serverId}
          assistantId={view.assistantId}
          onDone={onDone}
        />
      );
    case "assistant-memory":
      return (
        <HostAssistantMemoryEditorPage serverId={view.serverId} assistantId={view.assistantId} />
      );
    case "team":
      return <HostTeamEditorPage serverId={view.serverId} teamId={view.teamId} onDone={onDone} />;
    case "instruction-templates":
      return <HostInstructionTemplatesPage serverId={view.serverId} />;
    case "instruction-template":
      return (
        <HostInstructionTemplateEditorPage
          serverId={view.serverId}
          templateId={view.templateId}
          onDone={onDone}
        />
      );
    case "mcp-server":
      return (
        <HostMcpEditorPage
          serverId={view.serverId}
          mcpServerId={view.mcpServerId}
          onDone={onDone}
        />
      );
    case "skill":
      return (
        <HostSkillEditorPage serverId={view.serverId} skillId={view.skillId} onDone={onDone} />
      );
    default:
      return undefined;
  }
}

export function getResourceDetailHeader(
  view: SettingsView,
  onBack: () => void,
): SettingsDetailHeader | null {
  switch (view.kind) {
    case "assistant":
      return { title: view.assistantId ? "编辑助手" : "创建助手", Icon: Bot, onBack };
    case "assistant-memory":
      return { title: "助手记忆", Icon: Brain, onBack };
    case "team":
      return { title: view.teamId ? "编辑团队" : "创建团队", Icon: Bot, onBack };
    case "instruction-templates":
      return { title: "全局指令模板", Icon: Bot, onBack };
    case "instruction-template":
      return {
        title: view.templateId ? "编辑指令模板" : "创建指令模板",
        Icon: Bot,
        onBack,
      };
    case "mcp-server":
      return {
        title: view.mcpServerId ? "编辑 MCP 服务" : "创建 MCP 服务",
        Icon: Wrench,
        onBack,
      };
    case "skill":
      return { title: view.skillId ? "编辑技能" : "创建技能", Icon: Sparkles, onBack };
    case "project-lark-groups":
      return { title: "飞书群上下文", Icon: MessageCircle, onBack };
    case "project-lark-group":
      return {
        title: view.groupId ? "编辑飞书群" : "创建飞书群",
        Icon: MessageCircle,
        onBack,
      };
    case "project-knowledge":
      return { title: "Project 知识", Icon: BookOpen, onBack };
    case "resource-sync":
      return {
        title: HOST_RESOURCE_SYNC_PAGE_TITLES[view.page],
        Icon: RefreshCw,
        onBack,
      };
    default:
      return null;
  }
}
