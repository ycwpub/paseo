export const BAMBOO_MAX_AUTOMATIC_RETRIES = 3;

export function nextAlertTroubleshooterRetryAt(input: {
  failedAt: Date;
  attempts: number;
  intervalMinutes: number;
  maxAutomaticRetries: number;
}): string | null {
  const completedAutomaticRetries = Math.max(0, input.attempts - 1);
  if (completedAutomaticRetries >= input.maxAutomaticRetries) return null;
  return new Date(input.failedAt.getTime() + input.intervalMinutes * 60_000).toISOString();
}

export function isAlertTroubleshooterRetryDue(nextRetryAt: string | null | undefined, now: Date) {
  if (!nextRetryAt) return false;
  const timestamp = Date.parse(nextRetryAt);
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}
