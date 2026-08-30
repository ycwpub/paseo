import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const featureOverrideManifest = source("../../feature-paseo-source-overrides.txt");

function runtimeSource(relativePath: string): string {
  const baseUrl = new URL(relativePath, import.meta.url);
  const extensionMatch = baseUrl.pathname.match(/(\.[^.]+)$/);
  if (!extensionMatch) {
    return readFileSync(baseUrl, "utf8");
  }

  const featureUrl = new URL(
    baseUrl.href.replace(extensionMatch[0], `.feature-paseo${extensionMatch[0]}`),
  );
  const featurePath = fileURLToPath(featureUrl);
  const marker = featureUrl.pathname.split("/packages/app/")[1];
  const isRuntimeOverride =
    marker != null &&
    featureOverrideManifest.includes(` -> packages/app/${decodeURIComponent(marker)}`);

  return readFileSync(isRuntimeOverride && existsSync(featurePath) ? featureUrl : baseUrl, "utf8");
}

describe("feature_paseo integration parity", () => {
  test("keeps workflow, plugin, and memory routes connected to the app shell", () => {
    const layout = source("../app/_layout.tsx");

    expect(layout).toContain('<Stack.Screen name="workflows"');
    expect(layout).toContain('name="settings/hosts/[serverId]/memories/index"');
    expect(layout).toContain('name="settings/hosts/[serverId]/memories/[memoryId]"');
    expect(layout).toContain('name="settings/hosts/[serverId]/assistants/[assistantId]"');
    expect(layout).toContain('name="settings/hosts/[serverId]/assistants/[assistantId]/memory"');
    expect(layout).toContain('name="settings/hosts/[serverId]/teams/[teamId]"');
    expect(layout).toContain('name="settings/hosts/[serverId]/instruction-templates/index"');
    expect(layout).toContain('name="settings/hosts/[serverId]/instruction-templates/[templateId]"');
    expect(layout).toContain('name="settings/hosts/[serverId]/mcp-servers/[mcpServerId]"');
    expect(layout).toContain('name="settings/hosts/[serverId]/skills/[skillId]"');
    expect(layout).toContain('name="settings/hosts/[serverId]/memory/[memoryPage]"');
    expect(layout).toContain(
      'name="settings/hosts/[serverId]/projects/[projectId]/memories/index"',
    );
    expect(layout).toContain("<DesktopPluginContentHost>");
    expect(layout).toContain("<PluginAppPanelHost compact");
  });

  test("keeps workflow and installed plugins reachable from the sidebar", () => {
    const sidebar = runtimeSource("../components/left-sidebar.tsx");

    expect(sidebar).toContain('testID="sidebar-workflows"');
    expect(sidebar).toContain("<InstalledPluginSidebarSection");
    expect(sidebar).toContain("closePluginPanel()");
    expect(sidebar).toContain("buildWorkflowsRoute()");
  });

  test("keeps restored host resources and memory management reachable", () => {
    const settings = runtimeSource("./settings-screen.tsx");
    const featureRoutes = source("./settings/settings-feature-routes.tsx");
    const hostResources = source("./settings/host-resource-pages.tsx");
    const settingsRouting = `${settings}\n${featureRoutes}`;

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
      expect(settingsRouting).toContain(`<${component}`);
    }
    expect(settings).not.toContain('from "@/screens/settings/plugins-page"');
    expect(hostResources).toContain("<PluginsSection");
    expect(hostResources).not.toContain("<RuntimePluginsSection");
    expect(settings).toContain('view.kind === "memory"');
  });

  test("keeps host appearance, relay, and instruction templates visible", () => {
    const hostPage = runtimeSource("./settings/host-page.tsx");
    const instructionTemplates = source("./settings/agents/instruction-templates-section.tsx");

    expect(hostPage).toContain("<HostAppearanceSection");
    expect(hostPage).not.toContain("<HostKnowledgeSection");
    expect(hostPage).toContain("<RelayConfigurationSection");
    expect(hostPage).toContain("<InstructionTemplatesEntrySection");
    expect(instructionTemplates).toContain("InstructionTemplatesListPage");
    expect(instructionTemplates).toContain("InstructionTemplateEditorPage");
  });

  test("keeps bundled skill lifecycle and the unified skill catalog on one page", () => {
    const hostPage = runtimeSource("./settings/host-page.tsx");
    const hostResources = source("./settings/host-resource-pages.tsx");

    expect(hostPage).not.toContain("<AgentSkillsSection");
    expect(hostResources).toContain("<AgentSkillsSection");
    expect(hostResources).toContain("<SkillsSection");
  });

  test("keeps global, Project, and Assistant knowledge in the standalone knowledge manager", () => {
    const knowledgeManager = source("./settings/knowledge/knowledge-management-section.tsx");

    expect(knowledgeManager).toContain("<HostKnowledgeSection");
    expect(knowledgeManager).toContain("<ProjectKnowledgeEditor");
    expect(knowledgeManager).toContain("knowledge-scope-global");
    expect(knowledgeManager).toContain("knowledge-scope-project");
    expect(knowledgeManager).toContain("knowledge-scope-assistant");
  });

  test("keeps project memory, Lark context, plugins, and parent navigation visible", () => {
    const projectSettings = runtimeSource("./project-settings-screen.tsx");
    const projectMemory = source("./settings/memory/project-memory-card.tsx");

    expect(projectSettings).toContain("<ProjectKnowledgeCard");
    expect(projectSettings).toContain("<ProjectMemoryCard");
    expect(projectSettings).not.toContain("<ProjectKnowledgeEditor");
    expect(projectSettings).toContain("<ProjectLarkGroupsEntry");
    expect(projectSettings).toContain("配置知识");
    expect(projectMemory).toContain("配置记忆");
    expect(projectSettings).toContain("<ProjectLinkedPluginProjects");
    expect(projectSettings).toContain("<ProjectParentLink");
    expect(projectSettings).toContain("projectDirectoryMode");
    expect(projectSettings).toContain("projectVariables");
  });

  test("keeps all four Explorer feature entries registered", () => {
    const manifest = runtimeSource("../panels/panel-manifest.ts");
    const registry = runtimeSource("../panels/register-panels.ts");
    const catalog = runtimeSource("../workspace-tabs/launcher/internal/catalog.ts");
    const explorer = runtimeSource("../components/compact-explorer-sidebar.tsx");

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
    const identityControls = source(
      "../composer/assistant-selector/composer-agent-identity-controls.tsx",
    );
    const agentPanel = runtimeSource("../panels/agent-panel.tsx");
    const workspaceDraft = runtimeSource("../composer/draft/workspace-tab.tsx");
    const newWorkspace = runtimeSource("./new-workspace-screen.tsx");

    expect(composer).toContain(
      'import { ComposerAgentIdentityControls } from "@/composer/assistant-selector/composer-agent-identity-controls"',
    );
    expect(composer).toContain("<ComposerAgentIdentityControls");
    expect(identityControls).toContain(
      'import { AssistantSelector } from "@/composer/assistant-selector/assistant-selector"',
    );
    expect(identityControls).toContain("<AssistantSelector");
    expect(identityControls).toContain("selectedTeamId={teamId ?? null}");
    expect(identityControls).toContain("onSelectTeam={onTeamSelect}");

    for (const chatSurface of [agentPanel, workspaceDraft, newWorkspace]) {
      expect(chatSurface).toContain("assistantId=");
      expect(chatSurface).toContain("onAssistantSelect=");
      expect(chatSurface).toContain("teamId=");
    }
    expect(workspaceDraft).toContain("onTeamSelect=");
    expect(newWorkspace).toContain("onTeamSelect=");
  });

  test("keeps Dock attention connected to completed tasks and permission requests", () => {
    const sessionContext = runtimeSource("../contexts/session-context.tsx");

    expect(sessionContext).toContain(
      'import { signalDesktopAttention } from "@/desktop/attention/desktop-attention"',
    );
    expect(sessionContext).toContain("getAgentAttentionRouting");
    expect(sessionContext).toContain("getDesktopAgentAttentionDecision");
    expect(sessionContext).toContain('signalDesktopAttention("finished", {');
    expect(sessionContext).toContain('signalDesktopAttention("intervention")');
  });
});
