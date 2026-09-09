import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { ensureBambooAttributionTable } from "./bamboo-attribution-table.js";

const DEFAULT_MOVE_POLL_INTERVAL_MS = 500;
const DEFAULT_MOVE_POLL_ATTEMPTS = 20;

export interface BambooDailyBase {
  appToken: string;
  tableId: string;
  nodeToken: string;
}

interface BambooDailyBaseCreatorOptions {
  api: LarkAlertTroubleshooterApi;
  spaceId: string;
  parentNodeToken: string;
  title: string;
  wait?: (delayMs: number) => Promise<void>;
  movePollAttempts?: number;
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function waitForMovedNode(input: {
  api: LarkAlertTroubleshooterApi;
  taskId: string;
  appToken: string;
  wait: (delayMs: number) => Promise<void>;
  attempts: number;
}): Promise<string> {
  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    const result = await input.api.request(
      () =>
        input.api.client.wiki.v2.task.get({
          path: { task_id: input.taskId },
          params: { task_type: "move" },
        }),
      { identity: "bot", requiredScopes: ["wiki:node:create"] },
    );
    const moveResult =
      result.data?.task.move_result?.find(
        (item) => !item.node.obj_token || item.node.obj_token === input.appToken,
      ) ?? result.data?.task.move_result?.[0];
    const nodeToken = moveResult?.node.node_token;
    if (nodeToken) return nodeToken;
    if (
      moveResult &&
      moveResult.status_msg &&
      /(?:fail|error|失败|拒绝)/iu.test(moveResult.status_msg)
    ) {
      throw new Error(`移动 Bamboo 日报到 Wiki 失败：${moveResult.status_msg}`);
    }
    if (attempt < input.attempts) {
      await input.wait(DEFAULT_MOVE_POLL_INTERVAL_MS);
    }
  }
  throw new Error("移动 Bamboo 日报到 Wiki 超时，请稍后重试");
}

/**
 * Create the canonical Base in Drive first, then move it into Wiki.
 *
 * Creating a bitable directly through the Wiki node API may provision example
 * tables named table/workflow/dashboard. Drive Base creation only provisions
 * one blank table, which can be replaced deterministically before publication.
 */
export async function createBambooDailyBase(
  options: BambooDailyBaseCreatorOptions,
): Promise<BambooDailyBase> {
  const createResult = await options.api.request(
    () =>
      options.api.client.bitable.v1.app.create({
        data: {
          name: options.title,
          time_zone: "Asia/Shanghai",
        },
      }),
    { identity: "bot", requiredScopes: ["base:app:create"] },
  );
  const appToken = createResult.data?.app?.app_token;
  if (!appToken) {
    throw new Error(`创建 Bamboo 日报多维表格后未返回 app_token：${options.title}`);
  }

  const tableId = await ensureBambooAttributionTable(options.api, appToken);
  const moveResult = await options.api.request(
    () =>
      options.api.client.wiki.v2.spaceNode.moveDocsToWiki({
        path: { space_id: options.spaceId },
        data: {
          obj_type: "bitable",
          obj_token: appToken,
          parent_wiki_token: options.parentNodeToken,
        },
      }),
    { identity: "bot", requiredScopes: ["wiki:node:create"] },
  );
  if (moveResult.data?.applied) {
    throw new Error("移动 Bamboo 日报到 Wiki 需要审批，请完成审批后重新执行");
  }
  const nodeToken =
    moveResult.data?.wiki_token ??
    (moveResult.data?.task_id
      ? await waitForMovedNode({
          api: options.api,
          taskId: moveResult.data.task_id,
          appToken,
          wait: options.wait ?? sleep,
          attempts: Math.max(1, options.movePollAttempts ?? DEFAULT_MOVE_POLL_ATTEMPTS),
        })
      : null);
  if (!nodeToken) {
    throw new Error(`移动 Bamboo 日报到 Wiki 后未返回 node_token：${options.title}`);
  }
  return { appToken, tableId, nodeToken };
}
