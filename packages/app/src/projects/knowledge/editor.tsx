import { useCallback, useMemo } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ChevronDown, Plus, X } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { SettingsGroup } from "@/screens/settings/settings-group";
import { SettingsSection } from "@/screens/settings/settings-section";
import { settingsStyles } from "@/styles/settings";
import {
  createProjectKnowledgeResourceDraft,
  PROJECT_KNOWLEDGE_SECTIONS,
  type ProjectKnowledgeDraft,
  type ProjectKnowledgeResourceDraft,
  type ProjectKnowledgeResourceType,
  type ProjectKnowledgeSection,
} from "./model";
import { CloudKnowledgeCacheControl, type CloudKnowledgeCacheTarget } from "./cloud-cache-control";

const ICON_SIZE = 14;

const SECTION_META: Record<
  ProjectKnowledgeSection,
  { title: string; description: string; empty: string }
> = {
  general: {
    title: "通用知识",
    description:
      "提供可按需查阅的背景资料。Agent 根据当前任务决定是否加载和采纳，支持本地目录、本地文档和云文档。",
    empty: "尚未配置通用知识",
  },
  standards: {
    title: "规范知识",
    description:
      "所有内容都会提供给 Agent，并要求 Agent 完整读取和严格遵守。支持本地文档和云文档。",
    empty: "尚未配置规范知识",
  },
  projectSpecific: {
    title: "项目专有知识",
    description:
      "所有内容都会提供给 Agent，Agent 根据任务相关性决定如何采纳。支持本地文档和云文档。",
    empty: "尚未配置项目专有知识",
  },
};

const TYPE_LABELS: Record<ProjectKnowledgeResourceType, string> = {
  "local-directory": "本地目录",
  "local-document": "本地文档",
  "cloud-document": "云文档",
};

const GENERAL_TYPES = ["local-directory", "local-document", "cloud-document"] as const;
const DOCUMENT_TYPES = ["local-document", "cloud-document"] as const;

function ProjectKnowledgeTypeOption({
  option,
  selected,
  onChange,
}: {
  option: ProjectKnowledgeResourceType;
  selected: boolean;
  onChange: (value: ProjectKnowledgeResourceType) => void;
}) {
  const select = useCallback(() => onChange(option), [onChange, option]);
  return (
    <DropdownMenuItem selected={selected} onSelect={select}>
      {TYPE_LABELS[option]}
    </DropdownMenuItem>
  );
}

function ProjectKnowledgeTypeSelector({
  section,
  value,
  onChange,
}: {
  section: ProjectKnowledgeSection;
  value: ProjectKnowledgeResourceType;
  onChange: (value: ProjectKnowledgeResourceType) => void;
}) {
  const options = section === "general" ? GENERAL_TYPES : DOCUMENT_TYPES;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityLabel={`知识类型：${TYPE_LABELS[value]}`}
        style={styles.typeTrigger}
      >
        <Text style={styles.typeTriggerText}>{TYPE_LABELS[value]}</Text>
        <ChevronDown size={ICON_SIZE} color={styles.iconColor.color} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" width={160}>
        {options.map((option) => (
          <ProjectKnowledgeTypeOption
            key={option}
            option={option}
            selected={value === option}
            onChange={onChange}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ProjectKnowledgeRow({
  section,
  resource,
  onChange,
  onRemove,
  cloudCacheTarget,
}: {
  section: ProjectKnowledgeSection;
  resource: ProjectKnowledgeResourceDraft;
  onChange: (resource: ProjectKnowledgeResourceDraft) => void;
  onRemove: () => void;
  cloudCacheTarget?: CloudKnowledgeCacheTarget;
}) {
  const handleTypeChange = useCallback(
    (type: ProjectKnowledgeResourceType) => onChange({ ...resource, type }),
    [onChange, resource],
  );
  const handleSourceChange = useCallback(
    (source: string) => onChange({ ...resource, source }),
    [onChange, resource],
  );
  const handleEnabledChange = useCallback(
    (enabled: boolean) => onChange({ ...resource, enabled }),
    [onChange, resource],
  );
  const placeholder =
    resource.type === "cloud-document" ? "https://example.com/document" : "./path/to/resource";
  return (
    <View style={styles.row}>
      <Switch value={resource.enabled} onValueChange={handleEnabledChange} />
      <ProjectKnowledgeTypeSelector
        section={section}
        value={resource.type}
        onChange={handleTypeChange}
      />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        value={resource.source}
        onChangeText={handleSourceChange}
        placeholder={placeholder}
        placeholderTextColor={styles.placeholderColor.color}
        style={styles.sourceInput}
      />
      <Pressable
        accessibilityLabel={`删除${TYPE_LABELS[resource.type]}`}
        onPress={onRemove}
        style={styles.removeButton}
      >
        <X size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
      {resource.type === "cloud-document" && cloudCacheTarget ? (
        <CloudKnowledgeCacheControl target={cloudCacheTarget} source={resource.source} />
      ) : null}
    </View>
  );
}

function ProjectKnowledgeBoundRow({
  section,
  resource,
  values,
  onChange,
  cloudCacheTarget,
}: {
  section: ProjectKnowledgeSection;
  resource: ProjectKnowledgeResourceDraft;
  values: ProjectKnowledgeResourceDraft[];
  onChange: (values: ProjectKnowledgeResourceDraft[]) => void;
  cloudCacheTarget?: CloudKnowledgeCacheTarget;
}) {
  const update = useCallback(
    (next: ProjectKnowledgeResourceDraft) => {
      onChange(values.map((entry) => (entry.id === resource.id ? next : entry)));
    },
    [onChange, resource.id, values],
  );
  const remove = useCallback(() => {
    onChange(values.filter((entry) => entry.id !== resource.id));
  }, [onChange, resource.id, values]);
  return (
    <ProjectKnowledgeRow
      section={section}
      resource={resource}
      onChange={update}
      onRemove={remove}
      cloudCacheTarget={cloudCacheTarget}
    />
  );
}

function ProjectKnowledgeSectionEditor({
  section,
  values,
  onChange,
  flush,
  cloudCacheTarget,
}: {
  section: ProjectKnowledgeSection;
  values: ProjectKnowledgeResourceDraft[];
  onChange: (values: ProjectKnowledgeResourceDraft[]) => void;
  flush?: boolean;
  cloudCacheTarget?: CloudKnowledgeCacheTarget;
}) {
  const meta = SECTION_META[section];
  const add = useCallback(
    () => onChange([...values, createProjectKnowledgeResourceDraft({ section })]),
    [onChange, section, values],
  );
  const trailing = useMemo(
    () => (
      <Pressable
        accessibilityLabel={`添加${meta.title}`}
        hitSlop={8}
        onPress={add}
        style={settingsStyles.sectionHeaderLink}
      >
        <Plus size={ICON_SIZE} color={styles.iconColor.color} />
      </Pressable>
    ),
    [add, meta.title],
  );
  return (
    <SettingsSection title={meta.title} flush={flush} trailing={trailing}>
      <Text style={styles.description}>{meta.description}</Text>
      <View style={styles.list}>
        {values.length === 0 ? (
          <Text style={styles.emptyText}>{meta.empty}</Text>
        ) : (
          values.map((resource) => (
            <ProjectKnowledgeBoundRow
              key={resource.id}
              section={section}
              resource={resource}
              values={values}
              onChange={onChange}
              cloudCacheTarget={cloudCacheTarget}
            />
          ))
        )}
      </View>
    </SettingsSection>
  );
}

export function ProjectKnowledgeEditor({
  value,
  error,
  onChange,
  sections = PROJECT_KNOWLEDGE_SECTIONS,
  title = "Project 知识",
  info = "按加载方式和约束强度管理 Agent 使用的 Project 资料",
  testID = "project-knowledge-group",
  cloudCacheTarget,
}: {
  value: ProjectKnowledgeDraft;
  error: string | null;
  onChange: (value: ProjectKnowledgeDraft) => void;
  sections?: readonly ProjectKnowledgeSection[];
  title?: string;
  info?: string;
  testID?: string;
  cloudCacheTarget?: CloudKnowledgeCacheTarget;
}) {
  const updateSection = useCallback(
    (section: ProjectKnowledgeSection, values: ProjectKnowledgeResourceDraft[]) => {
      onChange({ ...value, [section]: values });
    },
    [onChange, value],
  );
  const updateGeneral = useCallback(
    (values: ProjectKnowledgeResourceDraft[]) => updateSection("general", values),
    [updateSection],
  );
  const updateStandards = useCallback(
    (values: ProjectKnowledgeResourceDraft[]) => updateSection("standards", values),
    [updateSection],
  );
  const updateProjectSpecific = useCallback(
    (values: ProjectKnowledgeResourceDraft[]) => updateSection("projectSpecific", values),
    [updateSection],
  );
  return (
    <SettingsGroup title={title} info={info} testID={testID}>
      {sections.includes("general") ? (
        <ProjectKnowledgeSectionEditor
          section="general"
          values={value.general}
          onChange={updateGeneral}
          flush={sections.at(-1) === "general"}
          cloudCacheTarget={cloudCacheTarget}
        />
      ) : null}
      {sections.includes("standards") ? (
        <ProjectKnowledgeSectionEditor
          section="standards"
          values={value.standards}
          onChange={updateStandards}
          flush={sections.at(-1) === "standards"}
          cloudCacheTarget={cloudCacheTarget}
        />
      ) : null}
      {sections.includes("projectSpecific") ? (
        <ProjectKnowledgeSectionEditor
          section="projectSpecific"
          values={value.projectSpecific}
          onChange={updateProjectSpecific}
          flush={sections.at(-1) === "projectSpecific"}
          cloudCacheTarget={cloudCacheTarget}
        />
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </SettingsGroup>
  );
}

const styles = StyleSheet.create((theme) => ({
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.5,
    marginBottom: theme.spacing[3],
  },
  list: {
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  typeTrigger: {
    minWidth: 120,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  typeTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  sourceInput: {
    flex: 1,
    minWidth: 180,
    minHeight: 36,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    fontSize: theme.fontSize.sm,
  },
  removeButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[4],
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
}));
