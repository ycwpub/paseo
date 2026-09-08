import type { AlertTroubleshooterTask } from "@getpaseo/protocol/messages";

interface TaskRequest {
  pluginId: string;
  appId: string;
  projectId: string;
}

interface TaskActionClient {
  enqueueAlertTroubleshooterRecord(
    input: TaskRequest & {
      uniqueId?: string;
      resultId?: string;
    },
  ): Promise<{
    queued: boolean;
    error: string | null;
  }>;
  deleteAlertTroubleshooterTasks(
    input: TaskRequest & {
      taskIds: string[];
    },
  ): Promise<{
    tasks: AlertTroubleshooterTask[];
    error: string | null;
  }>;
}

const DELETE_BATCH_SIZE = 500;

export async function retryAlertTroubleshooterTask(
  client: TaskActionClient,
  request: TaskRequest,
  task: AlertTroubleshooterTask,
): Promise<AlertTroubleshooterTask[]> {
  const uniqueId = task.uniqueId.startsWith("record_id:")
    ? `record_id:${task.tableDate}:${task.recordId}`
    : task.uniqueId;
  const enqueueResponse = await client.enqueueAlertTroubleshooterRecord({
    ...request,
    ...(task.resultId ? { resultId: task.resultId } : { uniqueId }),
  });
  if (enqueueResponse.error) throw new Error(enqueueResponse.error);
  if (!enqueueResponse.queued) throw new Error("任务未能重新进入执行队列");

  const deleteResponse = await client.deleteAlertTroubleshooterTasks({
    ...request,
    taskIds: [task.id],
  });
  if (deleteResponse.error) throw new Error(deleteResponse.error);
  return deleteResponse.tasks;
}

export async function deleteAllAlertTroubleshooterTasks(
  client: TaskActionClient,
  request: TaskRequest,
  tasks: readonly AlertTroubleshooterTask[],
): Promise<AlertTroubleshooterTask[]> {
  let remaining = [...tasks];
  const taskIds = tasks.map((task) => task.id);
  for (let index = 0; index < taskIds.length; index += DELETE_BATCH_SIZE) {
    const response = await client.deleteAlertTroubleshooterTasks({
      ...request,
      taskIds: taskIds.slice(index, index + DELETE_BATCH_SIZE),
    });
    if (response.error) throw new Error(response.error);
    remaining = response.tasks;
  }
  return remaining;
}
