import { describe, expect, it } from "vitest";
import { presentPluginAppResult } from "./plugin-app-result-model";

describe("presentPluginAppResult", () => {
  it("extracts an Agent answer from the workflow data envelope", () => {
    expect(presentPluginAppResult({ data: { answer: "1 + 2 = 3" } })).toEqual({
      kind: "scalar",
      text: "1 + 2 = 3",
    });
  });

  it("extracts a direct answer returned by a workflow HTTP job", () => {
    expect(presentPluginAppResult({ answer: 3 })).toEqual({
      kind: "scalar",
      text: "3",
    });
  });

  it("keeps multi-field business results as formatted JSON", () => {
    expect(presentPluginAppResult({ data: { total: 3, operation: "add" } })).toEqual({
      kind: "json",
      text: '{\n  "total": 3,\n  "operation": "add"\n}',
    });
  });
});
