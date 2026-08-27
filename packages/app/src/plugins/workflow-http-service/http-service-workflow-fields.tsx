import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WorkflowScriptSummary } from "@getpaseo/protocol/workflow/types";
import type { SelectFieldOption } from "@/components/ui/select-field";
import { SelectField } from "@/components/ui/select-field";
import type { WorkflowRunTarget } from "@/workflows/run-targets";

export interface HttpServiceWorkflowFieldsProps {
  workflowPath: string;
  targetNodeId?: string;
  workflows: WorkflowScriptSummary[];
  workflowsLoading: boolean;
  workflowsError: string | null;
  inspectWorkflowTargets: (workflowPath: string) => Promise<WorkflowRunTarget[]>;
  onWorkflowPathChange: (workflowPath: string) => void;
  onTargetNodeIdChange: (targetNodeId: string | undefined) => void;
}

function workflowLabel(script: WorkflowScriptSummary): string {
  return script.name.trim() ? script.name : script.path;
}

export function HttpServiceWorkflowFields({
  workflowPath,
  targetNodeId,
  workflows,
  workflowsLoading,
  workflowsError,
  inspectWorkflowTargets,
  onWorkflowPathChange,
  onTargetNodeIdChange,
}: HttpServiceWorkflowFieldsProps) {
  const [targets, setTargets] = useState<WorkflowRunTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const inspectGeneration = useRef(0);

  useEffect(() => {
    const generation = ++inspectGeneration.current;
    if (!workflowPath) {
      setTargets([]);
      setTargetsLoading(false);
      setTargetsError(null);
      return;
    }
    setTargetsLoading(true);
    setTargetsError(null);
    void inspectWorkflowTargets(workflowPath)
      .then((nextTargets) => {
        if (generation === inspectGeneration.current) setTargets(nextTargets);
        return undefined;
      })
      .catch((error: unknown) => {
        if (generation !== inspectGeneration.current) return;
        setTargets([]);
        setTargetsError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (generation === inspectGeneration.current) setTargetsLoading(false);
      });
  }, [inspectWorkflowTargets, workflowPath]);

  const workflowOptions = useMemo<SelectFieldOption<string>[]>(() => {
    const options = workflows.map((script) => ({
      id: script.path,
      value: script.path,
      label: workflowLabel(script),
      description: script.description ?? `${script.stepCount} 个节点 · ${script.path}`,
    }));
    if (workflowPath && !options.some((option) => option.value === workflowPath)) {
      options.unshift({
        id: `current:${workflowPath}`,
        value: workflowPath,
        label: workflowPath.split("/").at(-1) ?? workflowPath,
        description: workflowPath,
      });
    }
    return options;
  }, [workflowPath, workflows]);
  const selectedWorkflow = workflowOptions.find((option) => option.value === workflowPath);
  const selectedWorkflowDisplay = useMemo(
    () =>
      selectedWorkflow
        ? {
            label: selectedWorkflow.label,
            description: selectedWorkflow.description,
          }
        : null,
    [selectedWorkflow],
  );

  const nodeOptions = useMemo<SelectFieldOption<string>[]>(() => {
    const options: SelectFieldOption<string>[] = [
      {
        id: "entire-workflow",
        value: "",
        label: "运行完整 Workflow",
        description: "不指定处理节点，从 Workflow 入口开始执行。",
      },
      ...targets.map((target) => ({
        id: target.id,
        value: target.id,
        label: target.name ? `${target.name}（${target.id}）` : target.id,
        description: target.type,
      })),
    ];
    if (targetNodeId && !options.some((option) => option.value === targetNodeId)) {
      options.push({
        id: `current:${targetNodeId}`,
        value: targetNodeId,
        label: targetNodeId,
        description: targetsError
          ? "暂时无法读取节点列表，保留当前节点。"
          : "当前 Workflow 中未找到该节点。",
      });
    }
    return options;
  }, [targetNodeId, targets, targetsError]);
  const selectedNode = nodeOptions.find((option) => option.value === (targetNodeId ?? ""));
  const selectedNodeDisplay = useMemo(
    () =>
      selectedNode
        ? {
            label: selectedNode.label,
            description: selectedNode.description,
          }
        : null,
    [selectedNode],
  );
  const handleWorkflowChange = useCallback(
    (path: string) => onWorkflowPathChange(path),
    [onWorkflowPathChange],
  );
  const handleNodeChange = useCallback(
    (nodeId: string) => onTargetNodeIdChange(nodeId || undefined),
    [onTargetNodeIdChange],
  );

  return (
    <>
      <SelectField
        label="Workflow 文件"
        value={workflowPath || null}
        selectedDisplay={selectedWorkflowDisplay}
        options={workflowOptions}
        onChange={handleWorkflowChange}
        placeholder="选择 Workflow"
        emptyText="当前 Host 没有可用的 Workflow"
        loading={workflowsLoading}
        disabled={workflowsLoading || workflowOptions.length === 0}
        searchable
        searchPlaceholder="搜索 Workflow 名称或路径"
        hint="从当前 Host 已发现的 Workflow 中选择。"
        error={workflowsError}
      />
      <SelectField
        label="处理节点 ID"
        value={targetNodeId ?? ""}
        selectedDisplay={selectedNodeDisplay}
        options={nodeOptions}
        onChange={handleNodeChange}
        placeholder="运行完整 Workflow"
        emptyText="当前 Workflow 没有可执行节点"
        loading={targetsLoading}
        disabled={!workflowPath || targetsLoading}
        searchable
        searchPlaceholder="搜索节点名称或 ID"
        hint="选择“运行完整 Workflow”时不指定节点。"
        error={targetsError}
      />
    </>
  );
}
