export function toLarkDirectoryMessageTime(
  createTime: number | null | undefined,
  fallback: string,
): string {
  if (createTime === null || createTime === undefined || !Number.isFinite(createTime)) {
    return fallback;
  }
  const milliseconds = createTime < 1_000_000_000_000 ? createTime * 1000 : createTime;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}
