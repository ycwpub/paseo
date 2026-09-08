const DEFAULT_ALERT_TROUBLESHOOTER_AGENT_TIMEOUT_MS = 90 * 60_000;

export async function waitForAlertTroubleshooterAgent<T>(input: {
  agentId: string;
  wait: () => Promise<T>;
  cancel: () => Promise<void>;
  timeoutMs?: number;
}): Promise<T> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_ALERT_TROUBLESHOOTER_AGENT_TIMEOUT_MS;
  const timeoutLabel =
    timeoutMs < 60_000
      ? `${Math.ceil(timeoutMs / 1_000)} 秒`
      : `${Math.ceil(timeoutMs / 60_000)} 分钟`;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      input.wait(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`排查 Agent ${input.agentId} 超过 ${timeoutLabel}未结束`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`排查 Agent ${input.agentId} 超过`)) {
      await input.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
