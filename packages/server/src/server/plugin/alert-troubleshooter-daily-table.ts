import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";
import { ensureBambooAttributionTable } from "./bamboo-attribution-table.js";
import { createBambooDailyBase } from "./bamboo-daily-base-creator.js";
import { isStaleAlertTroubleshooterTableLocation } from "./alert-troubleshooter-table-location-error.js";

export interface AlertTroubleshooterTableLocation {
  appToken: string;
  tableId: string;
  spaceId: string;
  nodeToken: string;
  dateKey: string;
  title: string;
}

export interface AlertTroubleshooterWikiRoot {
  spaceId: string;
  nodeToken: string;
}

interface DailyNode {
  appToken: string;
  nodeToken: string;
  tableId?: string;
}

function wikiToken(value: string): string {
  const url = new URL(value);
  const segments = url.pathname.split("/").filter(Boolean);
  const wikiIndex = segments.findIndex((segment) => segment === "wiki");
  const token = wikiIndex >= 0 ? segments[wikiIndex + 1] : undefined;
  if (!token) {
    throw new Error("归因记录根目录必须是飞书 Wiki 目录链接");
  }
  return token;
}

function dailyTitle(pluginId: string, dateKey: string): string {
  return pluginId.includes("bamboo")
    ? `${dateKey}-bamboo对账归因记录`
    : `${dateKey}-argos报警归因记录`;
}

export function alertTableDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}`;
}

export async function resolveAlertTroubleshooterWikiRoot(
  api: LarkAlertTroubleshooterApi,
  rootUrl: string,
): Promise<AlertTroubleshooterWikiRoot> {
  const token = wikiToken(rootUrl);
  const result = await api.request(
    () => api.client.wiki.v2.space.getNode({ params: { token, obj_type: "wiki" } }),
    { identity: "bot", requiredScopes: ["wiki:wiki:readonly"] },
  );
  const node = result.data?.node;
  if (!node?.space_id || !node.node_token) {
    throw new Error("无法解析归因记录根目录，请确认机器人可访问该 Wiki 目录");
  }
  return { spaceId: node.space_id, nodeToken: node.node_token };
}

async function findDailyNode(
  api: LarkAlertTroubleshooterApi,
  root: AlertTroubleshooterWikiRoot,
  title: string,
): Promise<DailyNode | null> {
  let pageToken: string | undefined;
  const matches: Array<{
    objToken: string;
    objType: string;
    nodeToken: string;
  }> = [];
  do {
    const result = await api.request(
      () =>
        api.client.wiki.v2.spaceNode.list({
          path: { space_id: root.spaceId },
          params: {
            parent_node_token: root.nodeToken,
            page_size: 50,
            ...(pageToken ? { page_token: pageToken } : {}),
          },
        }),
      { identity: "bot", requiredScopes: ["wiki:wiki:readonly"] },
    );
    for (const node of result.data?.items ?? []) {
      if (node.title === title && node.obj_token && node.node_token) {
        matches.push({
          objToken: node.obj_token,
          objType: node.obj_type,
          nodeToken: node.node_token,
        });
      }
    }
    pageToken = result.data?.has_more ? result.data.page_token : undefined;
  } while (pageToken);

  const availableMatches: typeof matches = [];
  for (const match of matches) {
    if (match.objType !== "bitable") {
      throw new Error(`归因记录根目录下的同名节点不是多维表格：${title}`);
    }
    try {
      await api.request(
        () =>
          api.client.bitable.v1.appTable.list({
            path: { app_token: match.objToken },
            params: { page_size: 1 },
          }),
        { identity: "bot", requiredScopes: ["base:table:read"] },
      );
      availableMatches.push(match);
    } catch (error) {
      if (!isStaleAlertTroubleshooterTableLocation(error)) throw error;
    }
  }

  if (availableMatches.length > 1) {
    throw new Error(`归因记录根目录下存在多个同名节点：${title}`);
  }
  const match = availableMatches[0];
  if (!match) return null;
  return { appToken: match.objToken, nodeToken: match.nodeToken };
}

async function createDailyNode(
  api: LarkAlertTroubleshooterApi,
  root: AlertTroubleshooterWikiRoot,
  title: string,
  pluginId: string,
): Promise<DailyNode> {
  if (pluginId.includes("bamboo")) {
    return createBambooDailyBase({
      api,
      spaceId: root.spaceId,
      parentNodeToken: root.nodeToken,
      title,
    });
  }
  const result = await api.request(
    () =>
      api.client.wiki.v2.spaceNode.create({
        path: { space_id: root.spaceId },
        data: {
          obj_type: "bitable",
          node_type: "origin",
          parent_node_token: root.nodeToken,
          title,
        },
      }),
    { identity: "bot", requiredScopes: ["wiki:node:create"] },
  );
  const appToken = result.data?.node?.obj_token;
  const nodeToken = result.data?.node?.node_token;
  if (!appToken || !nodeToken) {
    throw new Error(`创建日报多维表格后未返回 app_token 或 node_token：${title}`);
  }
  return { appToken, nodeToken };
}

async function resolveDefaultTableId(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
): Promise<string> {
  const result = await api.request(
    () =>
      api.client.bitable.v1.appTable.list({
        path: { app_token: appToken },
        params: { page_size: 1 },
      }),
    { identity: "bot", requiredScopes: ["base:table:read"] },
  );
  const tableId = result.data?.items?.[0]?.table_id;
  if (!tableId) throw new Error("日报多维表格中未找到默认数据表");
  return tableId;
}

function resolveTableId(
  api: LarkAlertTroubleshooterApi,
  appToken: string,
  pluginId: string,
): Promise<string> {
  return pluginId.includes("bamboo")
    ? ensureBambooAttributionTable(api, appToken)
    : resolveDefaultTableId(api, appToken);
}

export async function resolveDailyAlertTable(input: {
  api: LarkAlertTroubleshooterApi;
  rootUrl: string;
  pluginId: string;
  dateKey: string;
}): Promise<AlertTroubleshooterTableLocation> {
  const root = await resolveAlertTroubleshooterWikiRoot(input.api, input.rootUrl);
  const title = dailyTitle(input.pluginId, input.dateKey);
  let node = await findDailyNode(input.api, root, title);
  let tableId: string | undefined;
  if (node) {
    try {
      tableId = await resolveTableId(input.api, node.appToken, input.pluginId);
    } catch (error) {
      if (!isStaleAlertTroubleshooterTableLocation(error)) throw error;
      node = null;
    }
  }
  if (!node) {
    node = await createDailyNode(input.api, root, title, input.pluginId);
    tableId = node.tableId;
  }
  return {
    appToken: node.appToken,
    tableId: tableId ?? (await resolveTableId(input.api, node.appToken, input.pluginId)),
    spaceId: root.spaceId,
    nodeToken: node.nodeToken,
    dateKey: input.dateKey,
    title,
  };
}

export async function resolveExistingDailyAlertTable(input: {
  api: LarkAlertTroubleshooterApi;
  rootUrl: string;
  pluginId: string;
  dateKey: string;
}): Promise<AlertTroubleshooterTableLocation | null> {
  const root = await resolveAlertTroubleshooterWikiRoot(input.api, input.rootUrl);
  const title = dailyTitle(input.pluginId, input.dateKey);
  const node = await findDailyNode(input.api, root, title);
  if (!node) return null;
  let tableId: string;
  try {
    tableId = await resolveTableId(input.api, node.appToken, input.pluginId);
  } catch (error) {
    if (isStaleAlertTroubleshooterTableLocation(error)) return null;
    throw error;
  }
  return {
    appToken: node.appToken,
    tableId,
    spaceId: root.spaceId,
    nodeToken: node.nodeToken,
    dateKey: input.dateKey,
    title,
  };
}
