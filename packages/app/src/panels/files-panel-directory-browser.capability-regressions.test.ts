import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./files-panel-directory-browser.tsx", import.meta.url),
  "utf8",
);

describe("files panel directory root selector", () => {
  it("uses a dropdown when the selected directory type has multiple roots", () => {
    expect(source).toContain("<SelectField<number>");
    expect(source).toContain('testID="files-panel-directory-root-select"');
    expect(source).toContain("roots.length > 1");
    expect(source).not.toContain("function DirectoryRootTab");
  });

  it("keeps the selected path visible in full with wrapping enabled", () => {
    expect(source).toContain('testID="files-panel-directory-root-path"');
    expect(source).toMatch(/<Text\s+selectable\s+style=\{styles\.rootPathText\}/u);
    expect(source).toContain('width: "100%"');
    expect(source).not.toContain("<Text numberOfLines={1} style={styles.rootOptionText}");
  });

  it("wraps the five directory type tabs instead of clipping or horizontally scrolling them", () => {
    expect(source).toContain('testID="files-panel-directory-scopes"');
    expect(source).toContain('flexDirection: "row"');
    expect(source).toContain('flexWrap: "wrap"');
    expect(source).not.toContain("<ScrollView");
  });
});
