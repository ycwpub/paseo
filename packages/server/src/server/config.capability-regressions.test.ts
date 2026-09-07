import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { loadConfig } from "./config.js";
const roots: string[] = [];
describe("server config", () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });
  test("disables client approval validation by default", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-config-client-access-"));
    roots.push(paseoHome);
    expect(loadConfig(paseoHome, { env: {} }).clientAccessRequireApproval).toBe(false);
  });
  test("loads daemon-global instruction templates", async () => {
    const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-config-templates-"));
    roots.push(paseoHome);
    const instructionTemplates = [
      {
        id: "review",
        name: "Review changes",
        content: "Review {{serviceName}}.",
      },
    ];
    await writeFile(
      path.join(paseoHome, "config.json"),
      `${JSON.stringify({ daemon: { instructionTemplates } }, null, 2)}\n`,
      "utf8",
    );
    expect(loadConfig(paseoHome, { env: {} }).instructionTemplates).toEqual(instructionTemplates);
  });
});
