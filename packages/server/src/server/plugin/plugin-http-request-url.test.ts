import { describe, expect, it } from "vitest";
import {
  normalizePluginHttpJobPath,
  pluginHttpRequestId,
  pluginHttpRequestUrlTemplate,
  withPluginHttpRequestId,
} from "./plugin-http-request-url.js";

describe("plugin HTTP request URL", () => {
  it("migrates the legacy request ID path marker to a plain path", () => {
    expect(normalizePluginHttpJobPath("/jobs/{requestId}")).toBe("/jobs");
    expect(normalizePluginHttpJobPath("/jobs/{requestId}/")).toBe("/jobs");
  });

  it("puts request_id in the query string", () => {
    expect(withPluginHttpRequestId("/jobs", "request 123")).toBe("/jobs?request_id=request%20123");
    expect(pluginHttpRequestId(new URL("http://127.0.0.1/jobs?request_id=request%20123"))).toBe(
      "request 123",
    );
    expect(pluginHttpRequestUrlTemplate("/jobs/{requestId}")).toBe("/jobs?request_id={requestId}");
  });
});
