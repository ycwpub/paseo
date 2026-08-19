export type DevelopmentPrdSourceType = "manual" | "meego";

export interface DevelopmentPrdSourceValue {
  type: DevelopmentPrdSourceType;
  prd: string;
  meegoUrl: string;
  meegoProjectKey: string;
  meegoWorkItemId: string;
  meegoTitle: string;
}

export interface DevelopmentMeegoItem {
  id: string;
  title: string;
  url: string;
  projectKey: string;
  workItemId: string;
  status: string;
  workItemType: string;
}

export const EMPTY_DEVELOPMENT_PRD_SOURCE: DevelopmentPrdSourceValue = {
  type: "manual",
  prd: "",
  meegoUrl: "",
  meegoProjectKey: "",
  meegoWorkItemId: "",
  meegoTitle: "",
};

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function resultData(value: unknown): Record<string, unknown> {
  const result = asRecord(value);
  const data = asRecord(result?.data);
  return data ?? result ?? {};
}

export function developmentPrdSourceFromInput(value: unknown): DevelopmentPrdSourceValue {
  const input = asRecord(value) ?? {};
  const meegoUrl = readString(input, "meego_url");
  const meegoWorkItemId = readString(input, "meego_work_item_id");
  const explicitType = readString(input, "prd_source");
  return {
    type:
      explicitType === "meego" || meegoUrl.trim() || meegoWorkItemId.trim() ? "meego" : "manual",
    prd: readString(input, "prd"),
    meegoUrl,
    meegoProjectKey: readString(input, "meego_project_key"),
    meegoWorkItemId,
    meegoTitle: readString(input, "meego_title"),
  };
}

export function serializeDevelopmentPrdSource(
  value: DevelopmentPrdSourceValue,
): Record<string, unknown> {
  return {
    prd_source: value.type,
    prd: value.prd.trim(),
    meego_url: value.type === "meego" ? value.meegoUrl.trim() : "",
    meego_project_key: value.type === "meego" ? value.meegoProjectKey.trim() : "",
    meego_work_item_id: value.type === "meego" ? value.meegoWorkItemId.trim() : "",
    meego_title: value.type === "meego" ? value.meegoTitle.trim() : "",
  };
}

export function parseDevelopmentMeegoItems(value: unknown): DevelopmentMeegoItem[] {
  const data = resultData(value);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  return rawItems.flatMap((entry, index) => {
    const item = asRecord(entry);
    if (!item) return [];
    const workItemId = readString(item, "workItemId");
    const projectKey = readString(item, "projectKey");
    const url = readString(item, "url");
    const title = readString(item, "title");
    if (!title || (!workItemId && !url)) return [];
    return [
      {
        id: readString(item, "id") || `${projectKey}:${workItemId || url}:${index}`,
        title,
        url,
        projectKey,
        workItemId,
        status: readString(item, "status"),
        workItemType: readString(item, "workItemType"),
      },
    ];
  });
}

export function parseResolvedDevelopmentPrd(
  value: unknown,
): Pick<
  DevelopmentPrdSourceValue,
  "prd" | "meegoUrl" | "meegoProjectKey" | "meegoWorkItemId" | "meegoTitle"
> {
  const data = resultData(value);
  return {
    prd: readString(data, "prd"),
    meegoUrl: readString(data, "url"),
    meegoProjectKey: readString(data, "projectKey"),
    meegoWorkItemId: readString(data, "workItemId"),
    meegoTitle: readString(data, "title"),
  };
}
