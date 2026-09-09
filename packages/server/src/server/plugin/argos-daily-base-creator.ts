import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { ensureArgosAttributionTable } from "./argos-attribution-table.js";

const MOVE_POLL_INTERVAL_MS = 500;
const MOVE_POLL_ATTEMPTS = 20;

export interface ArgosDailyBase {
  appToken: string;
  tableId: string;
  nodeToken: string;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function waitForMovedNode(input: {
  api: LarkAlertTroubleshooterApi;
  taskId: string;
  appToken: string;
  wait: (delayMs: number) => Promise<void>;
}): Promise<string> {
  for (let attempt = 1; attempt <= MOVE_POLL_ATTEMPTS; attempt += 1) {
    const result = await input.api.request(
      () =>
        input.api.client.wiki.v2.task.get({
          path: { task_id: input.taskId },
          params: { task_type: "move" },
        }),
      { identity: "bot", requiredScopes: ["wiki:node:create"] },
    );
    const moveResult = result.data?.task.move_result?.[0];
    if (moveResult?.node.node_token) return moveResult.node.node_token;
    if (moveResult?.status_msg && /(?:fail|error|失败|拒绝)/iu.test(moveResult.status_msg)) {
      throw new Error(`移动 Argos 日报到 Wiki 失败：${moveResult.status_msg}`);
    }
    if (attempt < MOVE_POLL_ATTEMPTS) await input.wait(MOVE_POLL_INTERVAL_MS);
  }
  throw new Error("移动 Argos 日报到 Wiki 超时，请稍后重试");
}

export async function createArgosDailyBase(input: {
  api: LarkAlertTroubleshooterApi;
  spaceId: string;
  parentNodeToken: string;
  title: string;
  wait?: (delayMs: number) => Promise<void>;
}): Promise<ArgosDailyBase> {
  const created = await input.api.request(
    () =>
      input.api.client.bitable.v1.app.create({
        data: { name: input.title, time_zone: "Asia/Shanghai" },
      }),
    { identity: "bot", requiredScopes: ["base:app:create"] },
  );
  const appToken = created.data?.app?.app_token;
  if (!appToken) throw new Error(`创建 Argos 日报多维表格后未返回 app_token：${input.title}`);
  const tableId = await ensureArgosAttributionTable(input.api, appToken);
  const moved = await input.api.request(
    () =>
      input.api.client.wiki.v2.spaceNode.moveDocsToWiki({
        path: { space_id: input.spaceId },
        data: {
          obj_type: "bitable",
          obj_token: appToken,
          parent_wiki_token: input.parentNodeToken,
        },
      }),
    { identity: "bot", requiredScopes: ["wiki:node:create"] },
  );
  if (moved.data?.applied) throw new Error("移动 Argos 日报到 Wiki 需要审批，请完成审批后重试");
  const nodeToken =
    moved.data?.wiki_token ??
    (moved.data?.task_id
      ? await waitForMovedNode({
          api: input.api,
          taskId: moved.data.task_id,
          appToken,
          wait: input.wait ?? sleep,
        })
      : null);
  if (!nodeToken) throw new Error(`移动 Argos 日报到 Wiki 后未返回 node_token：${input.title}`);
  return { appToken, tableId, nodeToken };
}
