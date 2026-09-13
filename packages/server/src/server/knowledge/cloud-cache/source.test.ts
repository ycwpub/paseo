import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CloudDocumentAuthenticationError,
  completeCloudDocumentAuthentication,
  DefaultCloudDocumentSourceReader,
} from "./source.js";

describe("DefaultCloudDocumentSourceReader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extracts markdown from bytedcli JSON output", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({
        status: "success",
        data: { markdown: "# Internal document" },
        error: null,
      }),
      stderr: "",
    }));
    const reader = new DefaultCloudDocumentSourceReader(runCommand);

    const result = await reader.fetch({
      source: "https://bytedance.larkoffice.com/wiki/example",
    });

    expect(result.content).toBe("# Internal document");
    expect(runCommand).toHaveBeenCalledWith(
      "bytedcli",
      ["--json", "insearch", "get", "https://bytedance.larkoffice.com/wiki/example"],
      expect.objectContaining({
        env: expect.objectContaining({ BYTEDCLI_NO_AUTO_UPGRADE: "1" }),
      }),
    );
  });

  it("converts bytedcli login failures into structured authentication issues", async () => {
    const error = Object.assign(new Error("command failed"), {
      stdout: JSON.stringify({
        status: "error",
        error: {
          message: "需要登录飞书",
          auth_command: "bytedcli insearch login",
          login_url: "https://login.example.com/oauth",
        },
      }),
      stderr: "",
    });
    const runCommand = vi.fn(async () => Promise.reject(error));
    const reader = new DefaultCloudDocumentSourceReader(runCommand);

    await expect(
      reader.fetch({
        source: "https://bytedance.larkoffice.com/wiki/private",
      }),
    ).rejects.toMatchObject<Partial<CloudDocumentAuthenticationError>>({
      name: "CloudDocumentAuthenticationError",
      issue: {
        kind: "authentication_required",
        source: "https://bytedance.larkoffice.com/wiki/private",
        authCommand: "bytedcli insearch login",
        loginUrl: "https://login.example.com/oauth",
      },
    });
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("does not reuse the cloud document URL as the login link for expired refresh tokens", async () => {
    const source = "https://bytedance.larkoffice.com/wiki/private";
    const error = Object.assign(new Error("command failed"), {
      stdout: JSON.stringify({
        status: "error",
        data: null,
        error: {
          error: "invalid_grant",
          error_description: "The refresh token has expired.",
          code: 20037,
        },
      }),
      stderr: "",
    });
    const runCommand = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          device_code: "device-code",
          verification_url: "https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=refresh",
        }),
        stderr: "",
      });
    const reader = new DefaultCloudDocumentSourceReader(runCommand);

    await expect(reader.fetch({ source })).rejects.toMatchObject({
      issue: {
        source,
        loginUrl: "https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=refresh",
        completionToken: "device-code",
        authCommand: "lark-cli auth login --domain docs,drive,wiki --recommend",
      },
    });
    expect(runCommand).toHaveBeenNthCalledWith(
      2,
      "lark-cli",
      ["auth", "login", "--domain", "docs,drive,wiki", "--recommend", "--no-wait", "--json"],
      expect.objectContaining({
        env: expect.objectContaining({ BYTEDCLI_NO_AUTO_UPGRADE: "1" }),
      }),
    );
  });

  it("returns the fallback verification URL when the login challenge omits the complete URL", async () => {
    const source = "https://bytedance.larkoffice.com/wiki/private";
    const error = Object.assign(new Error("command failed"), {
      stdout: JSON.stringify({
        status: "error",
        data: null,
        error: {
          error: "invalid_grant",
          error_description: "The refresh token has expired.",
          code: 20037,
        },
      }),
      stderr: "",
    });
    const runCommand = vi
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          status: "success",
          data: {
            login_status: "pending",
            complete_token: "completion-token",
            verification_uri: "https://accounts.feishu.cn/oauth/v1/device/verify",
            user_code: "ABCD-EFGH",
          },
        }),
        stderr: "",
      });
    const reader = new DefaultCloudDocumentSourceReader(runCommand);

    await expect(reader.fetch({ source })).rejects.toMatchObject({
      issue: {
        source,
        loginUrl: "https://accounts.feishu.cn/oauth/v1/device/verify?user_code=ABCD-EFGH",
        completionToken: "completion-token",
      },
    });
  });

  it("completes the saved Feishu OAuth challenge before retrying the document", async () => {
    const runCommand = vi.fn(async () => ({
      stdout: JSON.stringify({ ok: true }),
      stderr: "",
    }));

    await completeCloudDocumentAuthentication(
      {
        kind: "authentication_required",
        source: "https://bytedance.larkoffice.com/wiki/private",
        message: "需要重新授权",
        loginUrl: "https://accounts.feishu.cn/oauth/v1/device/verify?flow_id=flow",
        authCommand: "bytedcli feishu login",
        completionToken: "device-code",
      },
      runCommand,
    );

    expect(runCommand).toHaveBeenCalledWith(
      "lark-cli",
      ["auth", "login", "--device-code", "device-code", "--json"],
      expect.objectContaining({
        env: expect.objectContaining({ BYTEDCLI_NO_AUTO_UPGRADE: "1" }),
      }),
    );
  });

  it("bounds HTTP cloud document downloads with a timeout signal", async () => {
    const fetch = vi.fn(async () => new Response("# Public document"));
    vi.stubGlobal("fetch", fetch);
    const reader = new DefaultCloudDocumentSourceReader();

    const result = await reader.fetch({
      source: "https://example.com/document",
    });

    expect(result.content).toBe("# Public document");
    expect(fetch).toHaveBeenCalledWith(
      "https://example.com/document",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
