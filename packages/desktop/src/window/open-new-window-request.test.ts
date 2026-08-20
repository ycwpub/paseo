import { describe, expect, it } from "vitest";
import { parseOpenNewWindowRequest } from "./open-new-window-request";

describe("parseOpenNewWindowRequest", () => {
  it("accepts a Project path", () => {
    expect(parseOpenNewWindowRequest({ pendingOpenProjectPath: " /repo/paseo " })).toEqual({
      pendingOpenProjectPath: "/repo/paseo",
      initialRoute: null,
    });
  });

  it("accepts an internal initial route", () => {
    expect(parseOpenNewWindowRequest({ initialRoute: " /new?projectId=project-a " })).toEqual({
      pendingOpenProjectPath: null,
      initialRoute: "/new?projectId=project-a",
    });
  });

  it("rejects external and protocol-relative routes", () => {
    expect(
      parseOpenNewWindowRequest({ initialRoute: "https://example.com" }).initialRoute,
    ).toBeNull();
    expect(parseOpenNewWindowRequest({ initialRoute: "//example.com" }).initialRoute).toBeNull();
  });
});
