import { describe, expect, test } from "vitest";
import {
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
    expect(requirements.tenantScopes).toContain("wiki:node:create");
    expect(requirements.tenantScopes).toContain("base:table:read");
    expect(requirements.tenantScopes).toContain("base:field:read");
    expect(requirements.tenantScopes).toContain("base:field:create");
    expect(requirements.tenantScopes).toContain("base:record:create");
    expect(requirements.tenantScopes).toContain("base:record:read");
    expect(requirements.tenantScopes).toContain("base:record:update");
    expect(requirements.tenantScopes).not.toContain("base:record:retrieve");
    expect(requirements.tenantScopes).not.toContain("bitable:app");
    expect(requirements.userScopes).toContain("offline_access");
    expect(requirements.userScopes).not.toContain("im:chat");
    expect(requirements.userScopes).toContain("im:chat:create_by_user");
    expect(requirements.userScopes).toContain("im:message.p2p_msg:get_as_user");
    expect(requirements.userScopes).toContain("im:message:readonly");
    expect(requirements.userScopes).toContain("search:message");
    expect(requirements.userScopes).toContain("search:user");
    expect(requirements.userScopes).toContain("wiki:wiki:readonly");
    expect(requirements.userScopes).not.toContain("bitable:app");
    expect(requirements.userScopes).not.toContain("wiki:wiki");
    expect(requirements.userScopes).not.toContain("im:message.send_as_user");
    expect(requirements.events).toEqual(["im.message.receive_v1"]);
    expect(requirements.callbacks).toEqual(["card.action.trigger"]);
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
