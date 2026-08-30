function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

let cachedActionTimeFormatter: Intl.DateTimeFormat | null = null;

function getActionTimeFormatter(): Intl.DateTimeFormat {
  if (cachedActionTimeFormatter) return cachedActionTimeFormatter;
  const resolved = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).resolvedOptions();
  cachedActionTimeFormatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: resolved.hourCycle,
  });
  return cachedActionTimeFormatter;
}

export function formatActionTimestamp(date: Date, now: Date = new Date()): string {
  const time = getActionTimeFormatter().format(date);
  if (isSameLocalDay(date, now)) {
    return time;
  }
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${dateLabel} ${time}`;
}

export function formatActionTimeRange(input: {
  startedAt: Date;
  completedAt?: Date;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const start = formatActionTimestamp(input.startedAt, now);
  const end = input.completedAt ? formatActionTimestamp(input.completedAt, now) : "…";
  return `${start} → ${end}`;
}
