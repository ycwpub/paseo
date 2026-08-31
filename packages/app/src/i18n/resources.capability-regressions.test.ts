import { describe, expect, it } from "vitest";
import { ar, en, es, fr, ja, ko, ptBR, ru, zhCN } from "./resources/resolved-resources";
function flattenStrings(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") {
    return { [prefix]: value };
  }
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, child]) =>
      Object.entries(flattenStrings(child, prefix ? `${prefix}.${key}` : key)),
    ),
  );
}
function countMatchingEnglishStrings(resource: unknown): number {
  const englishStrings = flattenStrings(en);
  const localeStrings = flattenStrings(resource);
  return Object.entries(englishStrings).filter(([key, value]) => localeStrings[key] === value)
    .length;
}
describe("translation resources", () => {
  it("provides Chinese labels for the complete workflow editor", () => {
    expect(zhCN.workflows.title).toBe("本地工作流");
    expect(zhCN.workflows.editor.workflowTimeout).toBe("工作流超时（秒）");
    expect(zhCN.workflows.nodes.bash.initialCommand).toBe("初始命令");
    expect(zhCN.workflows.nodes.contract.inputs).toBe("input.data 映射（可选）");
    expect(zhCN.workflows.nodes.contract.inputsHint).toBe(
      "在节点执行前生成本节点的 input.data。留空时沿用上一个节点的 output.data；可用于筛选、重命名或组合字段。例如：{{nodes.scan.outputs.items}}。",
    );
    expect(zhCN.workflows.nodes.contract.inputSchema).toBe("input.data 结构校验");
    expect(zhCN.workflows.nodes.contract.outputSchema).toBe("output.data 结构校验（可选）");
    expect(zhCN.workflows.nodes.contractHints.inputSchema).toBe(
      "校验完成映射后，本节点实际接收的 input.data",
    );
    expect(zhCN.workflows.nodes.contractHints.outputSchema).toBe(
      "校验本节点生成的 output.data，用于及时定位输出格式错误；不替代下游节点的 input.data 结构校验。",
    );
    expect(zhCN.workflows.nodes.schemaCompatibility.title).toBe("data 结构兼容性提示");
    expect(zhCN.workflows.nodes.common.bashInputVariableHint).toBe(
      "Bash 命令中接收完整节点输入 JSON 字符串的变量名。以默认变量 input 为例：映射数据位于 input.data，Workflow 原始输入位于 input.origin_input，Workflow 变量位于 input.workflow.var，最内层 For 变量位于 input.loop.var，节点常量位于 input.node.var。",
    );
    expect(zhCN.workflows.nodes.common.pythonInputVariableHint).toBe(
      'Python 代码中接收解析后完整节点输入对象的变量名。以默认变量 input 为例：映射数据位于 input["data"]，Workflow 原始输入位于 input["origin_input"]，Workflow 变量位于 input["workflow"]["var"]，最内层 For 变量位于 input["loop"]["var"]，节点常量位于 input["node"]["var"]。',
    );
    expect(zhCN.workflows.nodes.common.bashOutputVariableHint).toBe(
      "命令执行成功前，需将包含必填 JSON 对象 data 的结果字符串赋值给此变量。",
    );
    expect(zhCN.workflows.nodes.common.pythonOutputVariableHint).toBe(
      "代码执行成功前，需将包含必填 JSON 对象 data 的结果对象赋值给此变量。",
    );
    expect(zhCN.workflows.nodes.variables.examplesTitle).toBe("变量使用范例");
    expect(zhCN.workflows.nodes.variables.agentTitle).toBe("智能体输入变量");
    expect(zhCN.workflows.nodes.variables.agentDescription).toContain("project.var.*");
    expect(zhCN.workflows.nodes.variables.agentDescription).toContain("node.var.*");
    expect(zhCN.workflows.nodes.agent.selectProvider).toBe("选择模型提供方");
    expect(zhCN.workflows.nodes.agent.lifecycle).toBe("智能体生命周期");
    expect(zhCN.workflows.nodes.agent.lifecycleOptions.workflow).toBe("整个 Workflow");
    expect(zhCN.workflows.nodes.agent.archiveAtLifecycleEnd).toBe("智能体生命周期结束后自动归档");
    expect(zhCN.workflows.nodes.for.loopBody).toBe("循环体");
    expect(zhCN.workflows.nodes.for.executionMode).toBe("执行模式");
    expect(zhCN.workflows.nodes.for.executionParallel).toBe("并行");
    expect(zhCN.workflows.nodes.for.breakWhen).toBe("结束条件");
    expect(zhCN.workflows.nodes.for.parallelLoopVariablesHint).toContain(
      "不允许通过 modify.loop.var 修改",
    );
    expect(zhCN.settings.project.backToProjects).toBe("返回项目列表");
    expect(zhCN.settings.project.projectId).toBe("项目 ID");
    expect(zhCN.settings.project.projectPath).toBe("项目路径");
    expect(zhCN.settings.project.memory.title).toBe("项目记忆");
    expect(zhCN.settings.project.memory.policyTitle).toBe("记忆规范");
    expect(zhCN.settings.project.memory.enabledTitle).toBe("为当前项目开启记忆");
    expect(zhCN.settings.project.memory.content.title).toBe("记忆内容");
    expect(zhCN.settings.host.skills.unsupported).toBe(
      "当前主机版本暂不支持编排技能管理，请更新 Paseo 守护进程",
    );
    expect(zhCN.sidebar.project.confirmations.removeMessage).toBe(
      "从 Paseo 中删除「{{projectName}}」及其所有工作区？\n\n仅会删除每台关联主机上的 Paseo 项目数据（~/.paseo/projects/<projectId> 下的全部内容）。不会删除或修改该项目关联的外部代码目录及其中任何文件。Paseo 项目数据删除后无法恢复。",
    );
  });
  it("keeps non-English supported languages translated beyond fallback labels", () => {
    const totalStrings = Object.keys(flattenStrings(en)).length;
    // Workflow editing currently falls back to English outside zh-CN. Keep the
    // global fallback ceiling strict enough to catch regressions while allowing
    // that intentionally shared section to grow.
    const maxFallbackStrings = Math.ceil(totalStrings * 0.32);
    expect(countMatchingEnglishStrings(ar)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(es)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(fr)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(ja)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(ko)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(ptBR)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(ru)).toBeLessThanOrEqual(maxFallbackStrings);
    expect(countMatchingEnglishStrings(zhCN)).toBeLessThanOrEqual(maxFallbackStrings);
  });
  it("keeps model count labels spaced around the count", () => {
    expect(ar.modelSelector.modelCountPlural).toBe("{{count}} نماذج");
    expect(es.modelSelector.modelCountPlural).toBe("{{count}} modelos");
    expect(fr.modelSelector.modelCountPlural).toBe("{{count}} modèles");
    expect(ja.modelSelector.modelCountPlural).toBe("{{count}}つのモデル");
    expect(ko.modelSelector.modelCountPlural).toBe("모델 {{count}}개");
    expect(ptBR.modelSelector.modelCountPlural).toBe("{{count}} modelos");
    expect(ru.modelSelector.modelCountPlural).toBe("{{count}} моделей");
    expect(zhCN.modelSelector.modelCountPlural).toBe("{{count}} 个模型");
    expect(ar.settings.providers.models.many).toBe("{{count}} نماذج");
    expect(es.settings.providers.models.many).toBe("{{count}} modelos");
    expect(fr.settings.providers.models.many).toBe("{{count}} modèles");
    expect(ja.settings.providers.models.many).toBe("{{count}}つのモデル");
    expect(ptBR.settings.providers.models.many).toBe("{{count}} modelos");
    expect(ru.settings.providers.models.many).toBe("{{count}} моделей");
    expect(zhCN.settings.providers.models.many).toBe("{{count}} 个模型");
  });
  it("includes Settings expansion keys for the Batch 3A migration", () => {
    expect(en.settings.diagnostics.title).toBe("Diagnostics");
    expect(en.settings.diagnostics.legacyTerminalRenderer.label).toBe(
      "Use legacy terminal renderer",
    );
    expect(en.settings.about.title).toBe("About");
    expect(en.settings.about.releaseChannel.label).toBe("Release channel");
    expect(en.settings.appearance.theme.title).toBe("Theme");
    expect(en.settings.appearance.fonts.interfaceFont).toBe("Interface font");
    expect(en.settings.shortcuts.actions.rebind).toBe("Rebind");
    expect(en.settings.integrations.commandLine.title).toBe("Command line");
    expect(en.settings.notifications.enabled).toBe("Send system notifications");
    expect(en.settings.notifications.playSound).toBe("Play sound");
    expect(en.settings.notifications.permission).toBe("Notification permission");
    expect(en.settings.notifications.sentTitle).toBe("Test notification sent");
    expect(en.settings.permissions.actions.request).toBe("Request");
  });
  it("includes sidebar and workspace creation keys for the Batch 4C migration", () => {
    expect(en.sidebar.workspace.actions.copyPath).toBe("Copy path");
    expect(en.sidebar.project.confirmations.removeTitle).toBe("Delete project?");
    expect(en.sidebar.project.toasts.updateHostToRemove).toBe(
      "Update the host to delete projects.",
    );
    expect(en.newWorkspace.title).toBe("New workspace");
    expect(en.newWorkspace.refPicker.searchPlaceholder).toBe("Search branches and PRs");
    expect(en.openProject.tiles.addProject.title).toBe("Add a project");
  });
  it("includes remaining small utility chrome keys for the Batch 4O migration", () => {
    expect(en.workspace.route.loading).toBe("Loading workspace");
    expect(en.workspace.route.connecting).toBe("Connecting");
    expect(en.workspace.route.hostOffline).toBe("{{hostName}} is offline");
    expect(en.workspace.route.cannotReachHost).toBe("Cannot reach {{hostName}}");
    expect(en.workspace.route.hostStatus).toBe("Host status: {{status}}");
    expect(en.workspace.route.recovery.archivedTitle).toBe("Workspace archived");
    expect(en.workspace.route.recovery.unavailableTitle).toBe("Workspace unavailable");
    expect(en.message.compaction.loading).toBe("Compacting...");
    expect(en.message.compaction.auto).toBe("Context automatically compacted");
    expect(en.message.compaction.manual).toBe("Context manually compacted");
    expect(en.message.compaction.withTokens).toBe("Context compacted ({{tokens}}K tokens)");
    expect(en.message.compaction.completed).toBe("Context compacted");
    expect(en.agentPanel.archived.callout).toBe("This agent is archived");
    expect(en.agentPanel.archived.unarchive).toBe("Unarchive");
    expect(en.desktop.quitting.title).toBe("Quitting Paseo...");
    expect(en.desktop.quitting.detail).toBe("Stopping the local daemon.");
    expect(en.composer.attachments.dropImagesHere).toBe("Drop images here");
  });
});
