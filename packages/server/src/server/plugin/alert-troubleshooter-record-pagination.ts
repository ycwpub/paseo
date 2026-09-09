export interface AlertTroubleshooterRecordPage<T> {
  items?: T[];
  has_more?: boolean;
  page_token?: string;
}

export async function collectAlertTroubleshooterRecordPages<T>(input: {
  fetchPage(pageToken?: string): Promise<AlertTroubleshooterRecordPage<T>>;
  shouldStop?(items: readonly T[]): boolean;
  maxPages?: number;
}): Promise<T[]> {
  const items: T[] = [];
  const seenTokens = new Set<string>();
  let pageToken: string | undefined;
  const maxPages = input.maxPages ?? 100;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await input.fetchPage(pageToken);
    items.push(...(result.items ?? []));
    if (input.shouldStop?.(items)) return items;
    const nextToken = result.page_token?.trim();
    if (!result.has_more) return items;
    if (!nextToken) {
      throw new Error("飞书多维表格分页声明 has_more=true，但未返回 page_token");
    }
    if (seenTokens.has(nextToken)) {
      throw new Error(`飞书多维表格分页返回重复 page_token：${nextToken}`);
    }
    seenTokens.add(nextToken);
    pageToken = nextToken;
  }

  throw new Error(`飞书多维表格分页超过安全上限（${maxPages} 页）`);
}
