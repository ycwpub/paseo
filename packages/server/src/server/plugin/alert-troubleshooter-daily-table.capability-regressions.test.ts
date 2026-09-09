import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";

const mocks = vi.hoisted(() => ({
  createBambooDailyBase: vi.fn(async () => ({
    appToken: "app_replacement",
    tableId: "tbl_replacement",
    nodeToken: "node_replacement",
  })),
  ensureBambooAttributionTable: vi.fn(async () => "tbl_existing"),
}));

vi.mock("./bamboo-daily-base-creator.js", () => ({
  createBambooDailyBase: mocks.createBambooDailyBase,
}));

vi.mock("./bamboo-attribution-table.js", () => ({
  ensureBambooAttributionTable: mocks.ensureBambooAttributionTable,
}));

import {
  resolveDailyAlertTable,
  resolveExistingDailyAlertTable,
} from "./alert-troubleshooter-daily-table.js";

function createApi(tableList: () => Promise<object>): LarkAlertTroubleshooterApi {
  const client = {
    wiki: {
      v2: {
        space: {
          getNode: vi.fn(async () => ({
            code: 0,
            data: { node: { space_id: "space_1", node_token: "node_root" } },
          })),
        },
        spaceNode: {
          list: vi.fn(async () => ({
            code: 0,
            data: {
              items: [
                {
                  title: "20260909-bamboo对账归因记录",
                  obj_token: "app_deleted",
                  obj_type: "bitable",
                  node_token: "node_deleted",
                },
              ],
              has_more: false,
            },
          })),
        },
      },
    },
    bitable: {
      v1: {
        appTable: {
          list: vi.fn(tableList),
        },
      },
    },
  };
  return {
    client,
    request: async <T>(operation: () => Promise<T>) => operation(),
  } as unknown as LarkAlertTroubleshooterApi;
}

describe("daily alert table recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a replacement Base when the matching Wiki node has been deleted", async () => {
    const api = createApi(async () => {
      throw new Error("Lark API error: note has been deleted (code: 1002)");
    });

    await expect(
      resolveDailyAlertTable({
        api,
        rootUrl: "https://example.com/wiki/root",
        pluginId: "bamboo-reconciliation-troubleshooter",
        dateKey: "20260909",
      }),
    ).resolves.toEqual({
      appToken: "app_replacement",
      tableId: "tbl_replacement",
      spaceId: "space_1",
      nodeToken: "node_replacement",
      dateKey: "20260909",
      title: "20260909-bamboo对账归因记录",
    });

    expect(mocks.createBambooDailyBase).toHaveBeenCalledWith({
      api,
      spaceId: "space_1",
      parentNodeToken: "node_root",
      title: "20260909-bamboo对账归因记录",
    });
    expect(mocks.ensureBambooAttributionTable).not.toHaveBeenCalled();
  });

  it("treats a deleted matching Wiki node as absent during read-only discovery", async () => {
    const api = createApi(async () => {
      throw new Error("Lark API error: note has been deleted (code: 1002)");
    });

    await expect(
      resolveExistingDailyAlertTable({
        api,
        rootUrl: "https://example.com/wiki/root",
        pluginId: "bamboo-reconciliation-troubleshooter",
        dateKey: "20260909",
      }),
    ).resolves.toBeNull();

    expect(mocks.createBambooDailyBase).not.toHaveBeenCalled();
  });

  it("does not create a replacement Base for permission failures", async () => {
    const api = createApi(async () => {
      throw new Error("飞书机器人应用身份权限不足（缺少 base:table:read；code: 99991679）");
    });

    await expect(
      resolveDailyAlertTable({
        api,
        rootUrl: "https://example.com/wiki/root",
        pluginId: "bamboo-reconciliation-troubleshooter",
        dateKey: "20260909",
      }),
    ).rejects.toThrow("base:table:read");

    expect(mocks.createBambooDailyBase).not.toHaveBeenCalled();
  });
});
