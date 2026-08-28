import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("feature_paseo integration parity", () => {
  test("keeps workflow, plugin, and memory routes connected to the app shell", () => {
    const layout = source("../app/_layout.tsx");

    expect(layout).toContain('<Stack.Screen name="workflows"');
    expect(layout).toContain('name="settings/hosts/[serverId]/memories/index"');
    expect(layout).toContain('name="settings/hosts/[serverId]/memories/[memoryId]"');
    expect(layout).toContain(
      'name="settings/hosts/[serverId]/projects/[projectId]/memories/index"',
    );
    expect(layout).toContain("<DesktopPluginContentHost>");
    expect(layout).toContain("<PluginAppPanelHost compact");
  });

  test("keeps workflow and installed plugins reachable from the sidebar", () => {
    const sidebar = source("../components/left-sidebar.tsx");

    expect(sidebar).toContain('testID="sidebar-workflows"');
    expect(sidebar).toContain("<InstalledPluginSidebarSection");
    expect(sidebar).toContain("closePluginPanel()");
    expect(sidebar).toContain("buildWorkflowsRoute()");
  });

  test("keeps restored host resources and memory management reachable", () => {
    const settings = source("./settings-screen.tsx");

    for (const component of [
      "HostConnectionsPage",
      "PairDeviceSection",
      "HostAssistantsPage",
      "HostMemoryPage",
      "KnowledgeManagementSection",
      "HostMcpPage",
      "HostSkillsPage",
      "HostChannelsPage",
      "HostPluginsPage",
      "ProjectSettingsScreen",
      "MemoryManagementScreen",
    ]) {
      expect(settings).toContain(`<${component}`);
    }
    expect(settings).toContain('view.kind === "memory"');
  });

  test("keeps host appearance, relay, and instruction templates visible", () => {
    const hostPage = source("./settings/host-page.tsx");

    expect(hostPage).toContain("<HostAppearanceSection");
    expect(hostPage).not.toContain("<HostKnowledgeSection");
    expect(hostPage).toContain("<RelayConfigurationSection");
    expect(hostPage).toContain("<InstructionTemplatesSection");
  });

  test("keeps global and Project knowledge in the standalone knowledge manager", () => {
    const knowledgeManager = source("./settings/knowledge/knowledge-management-section.tsx");

    expect(knowledgeManager).toContain("<HostKnowledgeSection");
    expect(knowledgeManager).toContain("<ProjectKnowledgeEditor");
    expect(knowledgeManager).toContain("knowledge-scope-global");
    expect(knowledgeManager).toContain("knowledge-scope-project");
  });

  test("keeps project memory, Lark context, plugins, and parent navigation visible", () => {
    const projectSettings = source("./project-settings-screen.tsx");

    expect(projectSettings).toContain("<ProjectMemoryCard");
    expect(projectSettings).not.toContain("<ProjectKnowledgeEditor");
    expect(projectSettings).toContain("<ProjectLarkContextEditor");
    expect(projectSettings).toContain("<ProjectLinkedPluginProjects");
    expect(projectSettings).toContain("<ProjectParentLink");
    expect(projectSettings).toContain("projectDirectoryMode");
    expect(projectSettings).toContain("projectVariables");
  });

  test("keeps all four Explorer feature entries registered", () => {
    const manifest = source("../panels/panel-manifest.ts");
    const registry = source("../panels/register-panels.ts");
    const catalog = source("../workspace-tabs/launcher/internal/catalog.ts");
    const explorer = source("../components/compact-explorer-sidebar.tsx");

    for (const kind of ["files", "changes_tree", "task_summary", "pull_request"]) {
      expect(manifest).toContain(`${kind}: {`);
    }
    expect(registry).toContain("registerPanel(taskSummaryPanelRegistration)");
    expect(registry).toContain("registerPanel(pullRequestPanelRegistration)");
    expect(registry).toContain("registerPanel(changesTreePanelRegistration)");
    expect(catalog).toContain('"taskSummary"');
    expect(catalog).toContain('"pullRequest"');
    expect(explorer).toContain('tab="task-summary"');
  });

  test("keeps assistant and team selection connected to every chat composer", () => {
    const composer = source("../composer/index.tsx");
    const agentPanel = source("../panels/agent-panel.tsx");
    const workspaceDraft = source("../composer/draft/workspace-tab.tsx");
    const newWorkspace = source("./new-workspace-screen.tsx");

    expect(composer).toContain(
      'import { AssistantSelector } from "@/composer/assistant-selector/assistant-selector"',
    );
    expect(composer).toContain("<AssistantSelector");
    expect(composer).toContain("selectedTeamId={args.teamId ?? null}");
    expect(composer).toContain("onSelectTeam={args.onTeamSelect}");

    for (const chatSurface of [agentPanel, workspaceDraft, newWorkspace]) {
      expect(chatSurface).toContain("assistantId=");
      expect(chatSurface).toContain("onAssistantSelect=");
      expect(chatSurface).toContain("teamId=");
    }
    expect(workspaceDraft).toContain("onTeamSelect=");
    expect(newWorkspace).toContain("onTeamSelect=");
  });

  test("keeps Dock attention connected to completed tasks and permission requests", () => {
    const sessionContext = source("../contexts/session-context.tsx");

    expect(sessionContext).toContain(
      'import { signalDesktopAttention } from "@/desktop/attention/desktop-attention"',
    );
    expect(sessionContext).toContain(
      'import { getAgentAttentionRouting } from "@/utils/agent-attention"',
    );
    expect(sessionContext).toContain('signalDesktopAttention("finished")');
    expect(sessionContext).toContain('signalDesktopAttention("intervention")');
  });
});
