import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("permission request card copyability", () => {
  it("keeps card text selectable without making the action buttons part of the copy surface", () => {
    const cardSource = readFileSync(new URL("./view.tsx", import.meta.url), "utf8");
    const linkSource = readFileSync(
      new URL("./cloud-knowledge-authorization-link.tsx", import.meta.url),
      "utf8",
    );

    expect(cardSource).toMatch(
      /<Text\s+selectable\s+style=\{permissionStyles\.title\}>\s*\{title\}\s*<\/Text>/u,
    );
    expect(cardSource).toMatch(
      /<Text\s+selectable\s+style=\{permissionStyles\.description\}>\s*\{description\}\s*<\/Text>/u,
    );
    expect(cardSource).toContain('userSelect: "text" as const');
    expect(linkSource).toMatch(
      /<Text\s+selectable\s+style=\{styles\.label\}>\s*授权链接：\s*<\/Text>/u,
    );
    expect(cardSource).not.toMatch(/<Pressable[^>]*selectable/u);
  });
});
