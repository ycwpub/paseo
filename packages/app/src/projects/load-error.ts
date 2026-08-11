const MESSAGE_TIMEOUT_PATTERN = /^Timeout waiting for message \(\d+ms\)$/;

export function isProjectDirectoryTimeout(message: string): boolean {
  return MESSAGE_TIMEOUT_PATTERN.test(message);
}
