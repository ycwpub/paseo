import { describe, expect, it, vi } from "vitest";
import { CloudDocumentAuthenticationError, DefaultCloudDocumentSourceReader } from "./source.js";

describe("DefaultCloudDocumentSourceReader", () => {
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
    const reader = new DefaultCloudDocumentSourceReader(vi.fn(async () => Promise.reject(error)));

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
  });
});
