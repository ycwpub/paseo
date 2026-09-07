import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
describe("supervision parity", () => {
  test("supervisor heartbeat keeps worker shutdown monitoring without a restart watchdog", () => {
    const supervisor = readFileSync(new URL("./supervisor.ts", import.meta.url), "utf8");
    const daemonWorker = readFileSync(
      new URL("../src/server/daemon-worker.ts", import.meta.url),
      "utf8",
    );
    expect(supervisor).toContain('"paseo:supervisor-heartbeat"');
    expect(supervisor).not.toContain("Worker heartbeat timed out; restarting worker");
    expect(supervisor).not.toContain("worker_heartbeat_timeout");
    expect(daemonWorker).toContain('"paseo:supervisor-heartbeat"');
  });
});
