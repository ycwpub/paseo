import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createLarkUserOAuthCallbackRoute } from "./lark-user-oauth-callback-route.js";

function createResponseHarness() {
  let statusCode = 200;
  let body = "";
  const response = {
    setHeader: vi.fn(),
    status: vi.fn((value: number) => {
      statusCode = value;
      return response;
    }),
    send: vi.fn((value: string) => {
      body = value;
      return response;
    }),
  } as unknown as Response;
  return {
    response,
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

function createRequest(query: Record<string, string>, remoteAddress = "127.0.0.1"): Request {
  return {
    query,
    socket: { remoteAddress },
  } as unknown as Request;
}

describe("Lark user OAuth callback route", () => {
  it("automatically completes a valid loopback callback", async () => {
    const completeAuthorizationCallback = vi.fn(async () => ({
      authorized: true,
    }));
    const response = createResponseHarness();
    const route = createLarkUserOAuthCallbackRoute({
      getService: () => ({
        completeAuthorizationCallback,
        discardAuthorization: vi.fn(),
      }),
      logger: { warn: vi.fn() },
    });

    route(createRequest({ code: "oauth-code", state: "oauth-state" }), response.response, vi.fn());

    await vi.waitFor(() => {
      expect(completeAuthorizationCallback).toHaveBeenCalledWith("oauth-code", "oauth-state");
      expect(response.response.send).toHaveBeenCalledTimes(1);
    });
    expect(response.getStatusCode()).toBe(200);
    expect(response.getBody()).toContain("飞书授权成功");
    expect(response.response.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });

  it("rejects callbacks that do not originate from loopback", async () => {
    const completeAuthorizationCallback = vi.fn();
    const response = createResponseHarness();
    const route = createLarkUserOAuthCallbackRoute({
      getService: () => ({
        completeAuthorizationCallback,
        discardAuthorization: vi.fn(),
      }),
      logger: { warn: vi.fn() },
    });

    route(
      createRequest({ code: "oauth-code", state: "oauth-state" }, "10.0.0.8"),
      response.response,
      vi.fn(),
    );

    await vi.waitFor(() => {
      expect(response.response.send).toHaveBeenCalledTimes(1);
    });
    expect(response.getStatusCode()).toBe(403);
    expect(response.getBody()).toContain("只允许从本机访问");
    expect(completeAuthorizationCallback).not.toHaveBeenCalled();
  });

  it("clears pending state when the provider rejects authorization", async () => {
    const discardAuthorization = vi.fn();
    const response = createResponseHarness();
    const route = createLarkUserOAuthCallbackRoute({
      getService: () => ({
        completeAuthorizationCallback: vi.fn(),
        discardAuthorization,
      }),
      logger: { warn: vi.fn() },
    });

    route(
      createRequest({
        error: "access_denied",
        error_description: "user denied",
        state: "oauth-state",
      }),
      response.response,
      vi.fn(),
    );

    await vi.waitFor(() => {
      expect(response.response.send).toHaveBeenCalledTimes(1);
    });
    expect(discardAuthorization).toHaveBeenCalledWith("oauth-state");
    expect(response.getStatusCode()).toBe(400);
    expect(response.getBody()).toContain("user denied");
  });
});
