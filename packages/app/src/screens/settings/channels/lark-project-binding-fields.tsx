import { Field, FormTextInput } from "@/components/ui/form-field";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";

export type LarkProjectBindingMode = "existing" | "create";

const PROJECT_MODE_OPTIONS: SelectFieldOption<LarkProjectBindingMode>[] = [
  {
    id: "existing",
    value: "existing",
    label: "选择已有项目",
    description: "绑定到当前主机已有的 Project",
  },
  {
    id: "create",
    value: "create",
    label: "创建新项目",
    description: "保存时自动创建无目录 Project",
  },
];

const PROJECT_MODE_DISPLAYS: Record<LarkProjectBindingMode, SelectFieldDisplay> = {
  existing: { label: "选择已有项目" },
  create: { label: "创建新项目" },
};

export function LarkProjectBindingFields(props: {
  mode: LarkProjectBindingMode;
  cwd: string;
  newProjectName: string;
  newProjectNameRevision: number;
  supportsDirectorylessProjects: boolean;
  projectOptions: SelectFieldOption<string>[];
  selectedProjectDisplay: SelectFieldDisplay | null;
  defaultNameDescription: string;
  testIDPrefix: string;
  onModeChange: (value: LarkProjectBindingMode) => void;
  onCwdChange: (value: string) => void;
  onNewProjectNameChange: (value: string) => void;
}) {
  return (
    <>
      <SelectField
        label="项目配置方式"
        value={props.mode}
        selectedDisplay={PROJECT_MODE_DISPLAYS[props.mode]}
        options={PROJECT_MODE_OPTIONS}
        onChange={props.onModeChange}
        placeholder="选择项目配置方式"
        emptyText="没有可用的项目配置方式"
        testID={`${props.testIDPrefix}-project-mode`}
      />
      {props.mode === "existing" ? (
        <SelectField
          label="已有项目"
          value={props.cwd || null}
          selectedDisplay={props.selectedProjectDisplay}
          options={props.projectOptions}
          onChange={props.onCwdChange}
          placeholder="选择项目"
          emptyText="该主机没有已打开的项目"
          searchable
          testID={`${props.testIDPrefix}-project-path`}
          hint="后续会话将在该项目中创建。"
        />
      ) : (
        <Field
          label="新项目名称"
          hint={
            props.supportsDirectorylessProjects
              ? `${props.defaultNameDescription}；保存时自动创建并绑定。`
              : "当前主机不支持自动创建 Project，请更新并重启 daemon。"
          }
          testID={`${props.testIDPrefix}-new-project-name`}
        >
          <FormTextInput
            initialValue={props.newProjectName}
            resetKey={`new-project-name:${props.testIDPrefix}:${props.newProjectNameRevision}`}
            onChangeText={props.onNewProjectNameChange}
            placeholder="新项目名称"
            editable={props.supportsDirectorylessProjects}
          />
        </Field>
      )}
    </>
  );
}
