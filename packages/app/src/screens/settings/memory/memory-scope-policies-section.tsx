import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PaseoMemoryScope, PaseoMemoryState } from "@getpaseo/protocol/messages";
import { SelectField, type SelectFieldOption } from "@/components/ui/select-field";
import { useAssistants } from "@/hooks/use-assistants";
import { useProjects } from "@/hooks/use-projects";
import { MemoryScopePolicyEditor } from "@/memory/scope-policy-editor";
import { useHostFeature } from "@/runtime/host-features";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  buildMemoryScopePolicyOptions,
  type MemoryScopeEntity,
  type MemoryScopePolicyOption,
} from "./memory-scope-policy-options";

type ManagedScopeType = PaseoMemoryScope["type"];

const SCOPE_TYPES: ManagedScopeType[] = ["global", "project", "workspace", "assistant"];
const EMPTY_TARGET_OPTIONS: MemoryScopePolicyOption[] = [];

function memoryScopeOptionKey(option: MemoryScopePolicyOption): string {
  return `${option.scope.type}:${option.scope.id}`;
}

export function MemoryScopePoliciesSection({
  serverId,
  memory,
}: {
  serverId: string;
  memory: PaseoMemoryState;
}) {
  const { t } = useTranslation();
  const supported = useHostFeature(serverId, "memoryScopePolicies");
  const { projects } = useProjects({ enabled: supported });
  const assistants = useAssistants(serverId, { enabled: supported });
  const [scopeType, setScopeType] = useState<ManagedScopeType>("global");
  const [selectedIds, setSelectedIds] = useState<
    Partial<Record<Exclude<ManagedScopeType, "global">, string>>
  >({});

  const entities = useMemo(() => {
    const projectEntities: MemoryScopeEntity[] = [];
    const workspaceEntities: MemoryScopeEntity[] = [];
    for (const project of projects) {
      for (const host of project.hosts) {
        if (host.serverId !== serverId) continue;
        projectEntities.push({
          id: host.projectId,
          label: host.projectCustomName ?? host.projectName,
          description: host.repoRoot,
        });
        for (const workspace of host.workspaces) {
          workspaceEntities.push({
            id: workspace.id,
            label: workspace.title?.trim() || workspace.name,
            description: host.projectCustomName ?? host.projectName,
          });
        }
      }
    }
    return {
      projects: projectEntities,
      workspaces: workspaceEntities,
      assistants: assistants.assistants.map((assistant) => ({
        id: assistant.id,
        label: assistant.name.trim() || assistant.id,
        description: assistant.description.trim() || undefined,
      })),
    };
  }, [assistants.assistants, projects, serverId]);

  const options = useMemo(
    () =>
      buildMemoryScopePolicyOptions({
        ...entities,
        // COMPAT(memoryScopePolicies): added in v0.3.2, remove fallback after 2027-02-18.
        policies: memory.scopePolicies ?? [],
      }),
    [entities, memory.scopePolicies],
  );
  const scopeTypeOptions = useMemo<SelectFieldOption<ManagedScopeType>[]>(
    () =>
      SCOPE_TYPES.map((type) => ({
        id: type,
        value: type,
        label: t(`memoryPolicies.scopeManager.types.${type}`),
      })),
    [t],
  );
  const selectedTypeDisplay = useMemo(
    () => ({
      label: t(`memoryPolicies.scopeManager.types.${scopeType}`),
    }),
    [scopeType, t],
  );
  const targetOptions = useMemo(
    () => (scopeType === "global" ? EMPTY_TARGET_OPTIONS : options[scopeType]),
    [options, scopeType],
  );
  const selectedTarget = useMemo(
    () =>
      scopeType === "global"
        ? null
        : (targetOptions.find((option) => option.scope.id === selectedIds[scopeType]) ??
          targetOptions[0] ??
          null),
    [scopeType, selectedIds, targetOptions],
  );
  const selectedScope = useMemo<PaseoMemoryScope | null>(
    () => (scopeType === "global" ? { type: "global" } : (selectedTarget?.scope ?? null)),
    [scopeType, selectedTarget],
  );
  const targetSelectOptions = useMemo<SelectFieldOption<MemoryScopePolicyOption>[]>(
    () =>
      targetOptions.map((option) => ({
        id: `${option.scope.type}:${option.scope.id}`,
        value: option,
        label: option.label,
        description: option.description,
      })),
    [targetOptions],
  );
  const selectedTargetDisplay = useMemo(
    () =>
      selectedTarget
        ? { label: selectedTarget.label, description: selectedTarget.description }
        : null,
    [selectedTarget],
  );
  const handleTargetChange = useCallback((option: MemoryScopePolicyOption) => {
    if (option.scope.type === "global" || !option.scope.id) return;
    setSelectedIds((current) => ({ ...current, [option.scope.type]: option.scope.id }));
  }, []);
  const copy = useMemo(
    () => ({
      enabledTitle: t("memoryPolicies.scopeManager.enabledTitle", {
        scope: t(`memoryPolicies.scopeManager.types.${scopeType}`),
      }),
      enabledHint: t("memoryPolicies.scopeManager.enabledHint"),
      instructionsTitle: t("memoryPolicies.scopeManager.instructionsTitle"),
      instructionsHint: t("memoryPolicies.scopeManager.instructionsHint"),
      instructionsPlaceholder: t("memoryPolicies.scopeManager.instructionsPlaceholder"),
      save: t("memoryPolicies.scopeManager.save"),
      saving: t("memoryPolicies.scopeManager.saving"),
      saved: t("memoryPolicies.scopeManager.saved"),
      saveError: t("memoryPolicies.scopeManager.saveError"),
    }),
    [scopeType, t],
  );

  if (!supported) return null;

  return (
    <SettingsSection title={t("memoryPolicies.scopeManager.title")}>
      <Text style={settingsStyles.rowHint}>{t("memoryPolicies.scopeManager.description")}</Text>
      <View style={settingsStyles.card}>
        <View style={styles.selectors}>
          <View style={styles.selector}>
            <SelectField
              label={t("memoryPolicies.scopeManager.scopeType")}
              value={scopeType}
              selectedDisplay={selectedTypeDisplay}
              options={scopeTypeOptions}
              onChange={setScopeType}
              placeholder={t("memoryPolicies.scopeManager.selectScopeType")}
              emptyText={t("memoryPolicies.scopeManager.noScopes")}
            />
          </View>
          {scopeType !== "global" ? (
            <View style={styles.selector}>
              <SelectField
                label={t("memoryPolicies.scopeManager.target")}
                value={selectedTarget}
                selectedDisplay={selectedTargetDisplay}
                options={targetSelectOptions}
                onChange={handleTargetChange}
                getValueKey={memoryScopeOptionKey}
                searchable
                placeholder={t("memoryPolicies.scopeManager.selectTarget")}
                emptyText={t("memoryPolicies.scopeManager.noTargets")}
                loading={scopeType === "assistant" && assistants.isLoading}
              />
            </View>
          ) : null}
        </View>
      </View>
      {selectedScope ? (
        <MemoryScopePolicyEditor
          key={`${selectedScope.type}:${selectedScope.id ?? ""}`}
          serverId={serverId}
          scope={selectedScope}
          copy={copy}
          testID={`memory-scope-policy-${selectedScope.type}`}
        />
      ) : (
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <Text style={settingsStyles.rowHint}>{t("memoryPolicies.scopeManager.noTargets")}</Text>
          </View>
        </View>
      )}
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  selectors: {
    padding: theme.spacing[4],
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[3],
  },
  selector: {
    flex: 1,
    minWidth: 220,
  },
}));
