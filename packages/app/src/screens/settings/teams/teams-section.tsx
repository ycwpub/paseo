import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentModelDefinition, ProviderSnapshotEntry } from "@getpaseo/protocol/agent-types";
import type { Assistant, Team, TeamMemberSettings } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { Switch } from "@/components/ui/switch";
import { formatThinkingOptionLabel } from "@/composer/agent-controls/utils";
import { useAssistants } from "@/hooks/use-assistants";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useTeams } from "@/hooks/use-teams";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  buildTeamMemberSettingsInput,
  canSubmitTeamForm,
  openCreateTeamForm,
  openEditTeamForm,
  setTeamLeader,
  setTeamMemberSettings,
  toggleTeamAssistant,
  type TeamFormState,
} from "@/teams/team-form-model";
import { resolveTeamAssistantIds, resolveTeamLeader } from "@/teams/team-members";

const INHERIT_LEADER_VALUE = "__inherit_leader__";
const EMPTY_MEMBER_SETTINGS: TeamMemberSettings = {};

function optionDisplay(option: SelectFieldOption<string> | undefined): SelectFieldDisplay | null {
  return option ? { label: option.label, description: option.description } : null;
}

function buildMemberProviderOptions(
  entries: ProviderSnapshotEntry[],
  configuredProvider: string | undefined,
): SelectFieldOption<string>[] {
  const options: SelectFieldOption<string>[] = [
    {
      id: INHERIT_LEADER_VALUE,
      value: INHERIT_LEADER_VALUE,
      label: "与负责人一致",
      description: "使用负责人的当前模型提供方。",
    },
    ...entries
      .filter((entry) => entry.enabled !== false)
      .map((entry) => ({
        id: entry.provider,
        value: entry.provider,
        label: entry.label ?? entry.provider,
        description: entry.description ?? entry.provider,
      })),
  ];
  if (configuredProvider && !options.some((option) => option.value === configuredProvider)) {
    options.push({
      id: configuredProvider,
      value: configuredProvider,
      label: configuredProvider,
      description: "已保存的模型提供方",
    });
  }
  return options;
}

function buildMemberModelOptions(
  entries: ProviderSnapshotEntry[],
  configuredProvider: string | undefined,
  configuredModel: string | undefined,
): SelectFieldOption<string>[] {
  const inherited: SelectFieldOption<string> = {
    id: INHERIT_LEADER_VALUE,
    value: INHERIT_LEADER_VALUE,
    label: "与负责人一致",
    description: "使用负责人的当前模型。",
  };
  const options: SelectFieldOption<string>[] = [inherited];
  const modelIds = new Set<string>();
  for (const entry of entries) {
    if (entry.enabled === false || (configuredProvider && entry.provider !== configuredProvider)) {
      continue;
    }
    for (const model of entry.models ?? []) {
      if (modelIds.has(model.id)) {
        continue;
      }
      modelIds.add(model.id);
      options.push({
        id: `${entry.provider}/${model.id}`,
        value: model.id,
        label: model.label,
        description: `${entry.label ?? entry.provider} · ${model.description ?? model.id}`,
      });
    }
  }
  if (configuredModel && !options.some((option) => option.value === configuredModel)) {
    options.push({
      id: configuredModel,
      value: configuredModel,
      label: configuredModel,
      description: "已保存的模型",
    });
  }
  return options;
}

function resolveConfiguredModel(
  entries: ProviderSnapshotEntry[],
  configuredProvider: string | undefined,
  configuredModel: string | undefined,
): AgentModelDefinition | null {
  if (!configuredModel) {
    return null;
  }
  const separatorIndex = configuredModel.indexOf("/");
  const provider =
    configuredProvider ??
    (separatorIndex >= 0 ? configuredModel.slice(0, separatorIndex) : undefined);
  const modelId = separatorIndex >= 0 ? configuredModel.slice(separatorIndex + 1) : configuredModel;
  return (
    entries
      .find((entry) => !provider || entry.provider === provider)
      ?.models?.find((model) => model.id === modelId) ?? null
  );
}

function buildMemberThinkingOptions(
  entries: ProviderSnapshotEntry[],
  settings: TeamMemberSettings,
): SelectFieldOption<string>[] {
  const selectedModel = resolveConfiguredModel(entries, settings.provider, settings.model);
  const models = selectedModel
    ? [selectedModel]
    : entries
        .filter((entry) => !settings.provider || entry.provider === settings.provider)
        .flatMap((entry) => entry.models ?? []);
  const options = new Map<string, SelectFieldOption<string>>();
  options.set(INHERIT_LEADER_VALUE, {
    id: INHERIT_LEADER_VALUE,
    value: INHERIT_LEADER_VALUE,
    label: "与负责人一致",
    description: "使用负责人的当前思考模式。",
  });
  for (const model of models) {
    for (const option of model.thinkingOptions ?? []) {
      if (!options.has(option.id)) {
        options.set(option.id, {
          id: option.id,
          value: option.id,
          label: formatThinkingOptionLabel(option),
          description: option.description ?? option.id,
        });
      }
    }
  }
  if (settings.thinkingOptionId && !options.has(settings.thinkingOptionId)) {
    options.set(settings.thinkingOptionId, {
      id: settings.thinkingOptionId,
      value: settings.thinkingOptionId,
      label: formatThinkingOptionLabel({ id: settings.thinkingOptionId }),
      description: settings.thinkingOptionId,
    });
  }
  return [...options.values()];
}

function TeamsUpgradeCard() {
  return (
    <SettingsSection title="团队">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>团队功能需要更新主机</Text>
            <Text style={settingsStyles.rowHint}>
              请更新所选主机的 Paseo 服务后再创建和使用团队。
            </Text>
          </View>
        </View>
      </View>
    </SettingsSection>
  );
}

function TeamRow({
  team,
  leaderName,
  memberCount,
  onEdit,
  onDelete,
}: {
  team: Team;
  leaderName: string;
  memberCount: number;
  onEdit: (team: Team) => void;
  onDelete: (team: Team) => void;
}) {
  const handleEdit = useCallback(() => onEdit(team), [onEdit, team]);
  const handleDelete = useCallback(() => onDelete(team), [onDelete, team]);
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{team.name}</Text>
        <Text style={settingsStyles.rowHint}>
          负责人：{leaderName} · {memberCount} 个助手
        </Text>
      </View>
      <View style={styles.actions}>
        <Button size="sm" variant="outline" onPress={handleEdit}>
          编辑
        </Button>
        <Button size="sm" variant="outline" onPress={handleDelete}>
          删除
        </Button>
      </View>
    </View>
  );
}

function TeamMemberRow({
  assistant,
  selected,
  isLeader,
  onToggle,
  onSetLeader,
  settings,
  providerEntries,
  providersLoading,
  onSettingsChange,
}: {
  assistant: Assistant;
  selected: boolean;
  isLeader: boolean;
  onToggle: (assistantId: string) => void;
  onSetLeader: (assistantId: string) => void;
  settings: TeamMemberSettings;
  providerEntries: ProviderSnapshotEntry[];
  providersLoading: boolean;
  onSettingsChange: (
    assistantId: string,
    settings: {
      provider?: string | null;
      model?: string | null;
      thinkingOptionId?: string | null;
    },
  ) => void;
}) {
  const handleToggle = useCallback(() => onToggle(assistant.id), [assistant.id, onToggle]);
  const handleSetLeader = useCallback(() => onSetLeader(assistant.id), [assistant.id, onSetLeader]);
  const providerOptions = useMemo(
    () => buildMemberProviderOptions(providerEntries, settings.provider),
    [providerEntries, settings.provider],
  );
  const modelOptions = useMemo(
    () => buildMemberModelOptions(providerEntries, settings.provider, settings.model),
    [providerEntries, settings.model, settings.provider],
  );
  const thinkingOptions = useMemo(
    () => buildMemberThinkingOptions(providerEntries, settings),
    [providerEntries, settings],
  );
  const providerValue = settings.provider ?? INHERIT_LEADER_VALUE;
  const modelValue = settings.model ?? INHERIT_LEADER_VALUE;
  const thinkingValue = settings.thinkingOptionId ?? INHERIT_LEADER_VALUE;
  const selectedProviderDisplay = useMemo(
    () => optionDisplay(providerOptions.find((option) => option.value === providerValue)),
    [providerOptions, providerValue],
  );
  const selectedModelDisplay = useMemo(
    () => optionDisplay(modelOptions.find((option) => option.value === modelValue)),
    [modelOptions, modelValue],
  );
  const selectedThinkingDisplay = useMemo(
    () => optionDisplay(thinkingOptions.find((option) => option.value === thinkingValue)),
    [thinkingOptions, thinkingValue],
  );
  const handleProviderChange = useCallback(
    (value: string) =>
      onSettingsChange(assistant.id, {
        provider: value === INHERIT_LEADER_VALUE ? null : value,
        model: null,
        thinkingOptionId: null,
      }),
    [assistant.id, onSettingsChange],
  );
  const handleModelChange = useCallback(
    (value: string) =>
      onSettingsChange(assistant.id, {
        model: value === INHERIT_LEADER_VALUE ? null : value,
      }),
    [assistant.id, onSettingsChange],
  );
  const handleThinkingChange = useCallback(
    (value: string) =>
      onSettingsChange(assistant.id, {
        thinkingOptionId: value === INHERIT_LEADER_VALUE ? null : value,
      }),
    [assistant.id, onSettingsChange],
  );
  return (
    <View style={styles.memberBlock}>
      <View style={styles.memberRow}>
        <Switch
          value={selected}
          onValueChange={handleToggle}
          accessibilityLabel={`Include ${assistant.name || "assistant"} in team`}
        />
        <View style={styles.memberContent}>
          <Text style={settingsStyles.rowTitle}>{assistant.name || "未命名助手"}</Text>
          {assistant.description ? (
            <Text style={settingsStyles.rowHint}>{assistant.description}</Text>
          ) : null}
        </View>
        {selected ? (
          <Button size="sm" variant={isLeader ? "default" : "outline"} onPress={handleSetLeader}>
            {isLeader ? "负责人" : "设为负责人"}
          </Button>
        ) : null}
      </View>
      {selected && !isLeader ? (
        <View style={styles.memberSettings}>
          <SelectField
            label="模型提供方"
            value={providerValue}
            selectedDisplay={selectedProviderDisplay}
            options={providerOptions}
            onChange={handleProviderChange}
            placeholder="与负责人一致"
            emptyText="该主机没有可用模型提供方"
            loading={providersLoading}
            searchable
            size="sm"
            testID={`team-member-provider-${assistant.id}`}
          />
          <SelectField
            label="模型"
            value={modelValue}
            selectedDisplay={selectedModelDisplay}
            options={modelOptions}
            onChange={handleModelChange}
            placeholder="与负责人一致"
            emptyText="该主机没有可用模型"
            loading={providersLoading}
            searchable
            size="sm"
            testID={`team-member-model-${assistant.id}`}
          />
          <SelectField
            label="思考模式"
            value={thinkingValue}
            selectedDisplay={selectedThinkingDisplay}
            options={thinkingOptions}
            onChange={handleThinkingChange}
            placeholder="与负责人一致"
            emptyText="该主机没有可用思考模式"
            loading={providersLoading}
            size="sm"
            testID={`team-member-thinking-${assistant.id}`}
          />
        </View>
      ) : null}
    </View>
  );
}

export function TeamEditorPage({
  serverId,
  teamId,
  onDone,
}: {
  serverId: string;
  teamId?: string;
  onDone: () => void;
}) {
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const assistants = useAssistants(serverId, { enabled: supportsTeams });
  const providersSnapshot = useProvidersSnapshot(serverId, { enabled: supportsTeams });
  const editingTeam = useMemo(
    () => (teamId ? (teams.teams.find((team) => team.id === teamId) ?? null) : null),
    [teamId, teams.teams],
  );
  const [form, setForm] = useState<TeamFormState>(() => openCreateTeamForm());
  const initializedTeamIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editingTeam || initializedTeamIdRef.current === editingTeam.id) return;
    initializedTeamIdRef.current = editingTeam.id;
    setForm(openEditTeamForm(editingTeam));
  }, [editingTeam]);
  const handleNameChange = useCallback(
    (name: string) => setForm((current) => ({ ...current, name })),
    [],
  );
  const handleToggleAssistant = useCallback(
    (assistantId: string) => setForm((current) => toggleTeamAssistant(current, assistantId)),
    [],
  );
  const handleSetLeader = useCallback(
    (assistantId: string) => setForm((current) => setTeamLeader(current, assistantId)),
    [],
  );
  const handleMemberSettingsChange = useCallback(
    (
      assistantId: string,
      settings: {
        provider?: string | null;
        model?: string | null;
        thinkingOptionId?: string | null;
      },
    ) => setForm((current) => setTeamMemberSettings(current, assistantId, settings)),
    [],
  );

  const handleSave = useCallback(async () => {
    if (!canSubmitTeamForm(form) || !form.leaderAssistantId) return;
    if (form.mode === "create") {
      await teams.createTeam({
        name: form.name.trim(),
        assistantIds: form.assistantIds,
        leaderAssistantId: form.leaderAssistantId,
        memberSettings: buildTeamMemberSettingsInput(form),
      });
    } else if (form.teamId) {
      await teams.updateTeam({
        id: form.teamId,
        name: form.name.trim(),
        assistantIds: form.assistantIds,
        leaderAssistantId: form.leaderAssistantId,
        memberSettings: buildTeamMemberSettingsInput(form),
      });
    }
    onDone();
  }, [form, onDone, teams]);

  if (!supportsTeams) {
    return <TeamsUpgradeCard />;
  }
  if (teamId && teams.isLoading) {
    return <Text style={settingsStyles.rowHint}>正在加载团队…</Text>;
  }
  if (teamId && !editingTeam) {
    return (
      <View style={settingsStyles.card}>
        <View style={settingsStyles.row}>
          <Text style={settingsStyles.rowHint}>找不到要编辑的团队。</Text>
        </View>
      </View>
    );
  }

  return (
    <SettingsSection title={teamId ? "编辑团队" : "创建团队"}>
      <View style={settingsStyles.card} testID="team-editor-page">
        <View style={styles.form}>
          <Field label="团队名称">
            <FormTextInput
              initialValue={form.name}
              resetKey={`team-name:${form.mode}:${form.teamId ?? "new"}`}
              onChangeText={handleNameChange}
              placeholder="团队名称"
            />
          </Field>
          <View style={styles.memberHeader}>
            <Text style={settingsStyles.rowTitle}>助手</Text>
            <Text style={settingsStyles.rowHint}>至少选择两个助手，并指定一名负责人。</Text>
          </View>
          {assistants.assistants.map((assistant) => {
            const selected = form.assistantIds.includes(assistant.id);
            const isLeader = form.leaderAssistantId === assistant.id;
            return (
              <TeamMemberRow
                key={assistant.id}
                assistant={assistant}
                selected={selected}
                isLeader={isLeader}
                onToggle={handleToggleAssistant}
                onSetLeader={handleSetLeader}
                settings={form.memberSettings[assistant.id] ?? EMPTY_MEMBER_SETTINGS}
                providerEntries={providersSnapshot.entries ?? []}
                providersLoading={providersSnapshot.isLoading || providersSnapshot.isFetching}
                onSettingsChange={handleMemberSettingsChange}
              />
            );
          })}
          {assistants.assistants.length < 2 ? (
            <Text style={settingsStyles.rowHint}>创建团队前，请先创建至少两个助手。</Text>
          ) : null}
          {teams.mutationError ? (
            <Text style={settingsStyles.rowError}>{teams.mutationError.message}</Text>
          ) : null}
          <View style={styles.actions}>
            <Button variant="outline" onPress={onDone} disabled={teams.isMutating}>
              取消
            </Button>
            <Button
              variant="default"
              onPress={handleSave}
              disabled={!canSubmitTeamForm(form) || !teams.isConnected}
              loading={teams.isMutating}
            >
              {form.mode === "create" ? "创建团队" : "保存团队"}
            </Button>
          </View>
        </View>
      </View>
      {teams.error ? <Text style={settingsStyles.rowError}>{teams.error.message}</Text> : null}
    </SettingsSection>
  );
}

export function TeamsSection({
  serverId,
  onCreate,
  onEdit,
}: {
  serverId: string;
  onCreate: () => void;
  onEdit: (team: Team) => void;
}) {
  const supportsTeams = useHostFeature(serverId, "teams");
  const teams = useTeams(serverId, { enabled: supportsTeams });
  const assistants = useAssistants(serverId, { enabled: supportsTeams });
  const handleDelete = useCallback(
    (team: Team) => {
      Alert.alert("删除团队？", `将移除“${team.name}”。`, [
        { text: "取消", style: "cancel" },
        {
          text: "删除",
          style: "destructive",
          onPress: () => {
            void teams.deleteTeam(team.id);
          },
        },
      ]);
    },
    [teams],
  );
  const createAction = useMemo(
    () => (
      <Button size="sm" variant="default" onPress={onCreate}>
        创建团队
      </Button>
    ),
    [onCreate],
  );

  if (!supportsTeams) return <TeamsUpgradeCard />;

  return (
    <SettingsSection title="团队" trailing={createAction}>
      <View style={settingsStyles.card}>
        {teams.teams.length > 0 ? (
          teams.teams.map((team) => (
            <TeamRow
              key={team.id}
              team={team}
              leaderName={resolveTeamLeader(team, assistants.assistants)?.name || "助手不存在"}
              memberCount={resolveTeamAssistantIds(team).length}
              onEdit={onEdit}
              onDelete={handleDelete}
            />
          ))
        ) : (
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>暂无团队。点击“创建团队”开始配置。</Text>
          </View>
        )}
      </View>
      {teams.error ? <Text style={settingsStyles.rowError}>{teams.error.message}</Text> : null}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  form: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  memberHeader: {
    gap: theme.spacing[1],
  },
  memberBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  memberRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  memberContent: {
    flex: 1,
    gap: theme.spacing[1],
  },
  memberSettings: {
    paddingLeft: 48,
    paddingBottom: theme.spacing[3],
    gap: theme.spacing[2],
  },
}));
