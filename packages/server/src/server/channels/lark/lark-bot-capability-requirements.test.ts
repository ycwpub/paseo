import { describe, expect, test } from "vitest";
import {
  PASEO_LARK_BOT_CAPABILITIES,
  buildLarkBotApplicationAddons,
  buildLarkBotApplicationRequirements,
} from "./lark-bot-capability-requirements.js";

describe("Lark bot capability requirements", () => {
  test("builds stable, duplicate-free permissions and callback allowlists", () => {
    const requirements = buildLarkBotApplicationRequirements();

    for (const items of Object.values(requirements)) {
      expect(items).toEqual([...items].sort());
      expect(new Set(items).size).toBe(items.length);
    }
    expect(requirements.tenantScopes).toContain("im:message:readonly");
    expect(requirements.tenantScopes).toContain("wiki:wiki:readonly");
    expect(requirements.tenantScopes).toContain("wiki:node:create");
    expect(requirements.tenantScopes).toContain("base:app:create");
    expect(requirements.tenantScopes).toContain("base:table:read");
    expect(requirements.tenantScopes).toContain("base:table:create");
    expect(requirements.tenantScopes).toContain("base:table:delete");
    expect(requirements.tenantScopes).toContain("base:table:update");
    expect(requirements.tenantScopes).toContain("base:view:read");
    expect(requirements.tenantScopes).toContain("base:view:write_only");
    expect(requirements.tenantScopes).not.toContain("base:dashboard:read");
    expect(requirements.tenantScopes).not.toContain("base:dashboard:delete");
    expect(requirements.tenantScopes).not.toContain("base:workflow:read");
    expect(requirements.tenantScopes).not.toContain("base:workflow:update");
    expect(requirements.tenantScopes).toContain("base:field:read");
    expect(requirements.tenantScopes).toContain("base:field:create");
    expect(requirements.tenantScopes).toContain("base:field:delete");
    expect(requirements.tenantScopes).toContain("base:field:update");
    expect(requirements.tenantScopes).toContain("base:record:create");
    expect(requirements.tenantScopes).toContain("base:record:delete");
    expect(requirements.tenantScopes).toContain("base:record:read");
    expect(requirements.tenantScopes).toContain("base:record:update");
    expect(requirements.tenantScopes).not.toContain("base:record:retrieve");
    expect(requirements.tenantScopes).toContain("docx:document:create");
    expect(requirements.tenantScopes).toContain("docx:document:readonly");
    expect(requirements.tenantScopes).toContain("docx:document:write_only");
    expect(requirements.tenantScopes).toContain("wiki:node:copy");
    expect(requirements.tenantScopes).toContain("wiki:node:move");
    expect(requirements.tenantScopes).not.toContain("bitable:app");
    expect(requirements.userScopes).toContain("offline_access");
    expect(requirements.userScopes).not.toContain("im:chat");
    expect(requirements.userScopes).toContain("im:chat:create_by_user");
    expect(requirements.userScopes).toContain("im:message.p2p_msg:get_as_user");
    expect(requirements.userScopes).toContain("im:message:readonly");
    expect(requirements.userScopes).toContain("search:message");
    expect(requirements.userScopes).toContain("contact:user:search");
    expect(requirements.userScopes).not.toContain("search:user");
    expect(requirements.userScopes).toContain("wiki:wiki:readonly");
    expect(requirements.userScopes).not.toContain("bitable:app");
    expect(requirements.userScopes).not.toContain("wiki:wiki");
    expect(requirements.userScopes).not.toContain("im:message.send_as_user");
    expect(requirements.events).toEqual(["im.message.receive_v1"]);
    expect(requirements.callbacks).toEqual(["card.action.trigger"]);
  });

  test("includes every declared capability in the default application request", () => {
    const requirements = buildLarkBotApplicationRequirements();

    for (const capability of Object.values(PASEO_LARK_BOT_CAPABILITIES)) {
      expect(requirements.tenantScopes).toEqual(
        expect.arrayContaining([...capability.tenantScopes]),
      );
      expect(requirements.userScopes).toEqual(expect.arrayContaining([...capability.userScopes]));
      expect(requirements.events).toEqual(expect.arrayContaining([...capability.events]));
      expect(requirements.callbacks).toEqual(expect.arrayContaining([...capability.callbacks]));
    }
  });

  test("never requests deprecated or unsupported permissions", () => {
    const requirements = buildLarkBotApplicationRequirements();
    const allScopes = [...requirements.tenantScopes, ...requirements.userScopes];

    for (const unsupportedScope of [
      "bitable:app",
      "im:chat",
      "im:message.send_as_user",
      "wiki:wiki",
      "base:dashboard:read",
      "base:dashboard:delete",
      "base:workflow:read",
      "base:workflow:update",
      "search:user",
    ]) {
      expect(allScopes).not.toContain(unsupportedScope);
    }
  });

  test("returns mutable registration payloads without exposing shared arrays", () => {
    const requirements = buildLarkBotApplicationRequirements();
    const addons = buildLarkBotApplicationAddons(requirements);

    addons.scopes.tenant.push("test:scope");
    addons.events.items.tenant.push("test.event");

    expect(requirements.tenantScopes).not.toContain("test:scope");
    expect(requirements.events).not.toContain("test.event");
  });
});
