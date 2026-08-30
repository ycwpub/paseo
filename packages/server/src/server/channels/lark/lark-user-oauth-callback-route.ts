import type { RequestHandler } from "express";
import type { Logger } from "pino";
import { DEFAULT_LARK_USER_OAUTH_REDIRECT_URI } from "@getpaseo/protocol/messages";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

export const LARK_USER_OAUTH_CALLBACK_PATH = new URL(DEFAULT_LARK_USER_OAUTH_REDIRECT_URI).pathname;

type CallbackService = Pick<
  LarkUserOAuthService,
  "completeAuthorizationCallback" | "discardAuthorization"
>;

function queryValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderResultPage(input: { title: string; message: string; success: boolean }): string {
  const color = input.success ? "#16803c" : "#b42318";
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f7f8; color: #202124; }
      main { max-width: 520px; margin: 12vh auto 0; padding: 32px; border: 1px solid #e2e2e5; border-radius: 16px; background: #fff; box-shadow: 0 12px 36px rgba(0,0,0,.08); }
      h1 { margin: 0 0 12px; font-size: 22px; color: ${color}; }
      p { margin: 0; line-height: 1.7; color: #5f6368; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.message)}</p>
    </main>
  </body>
</html>`;
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1" ||
    address.startsWith("127.")
  );
}

export function createLarkUserOAuthCallbackRoute(input: {
  getService: () => CallbackService | null;
  logger: Pick<Logger, "warn">;
}): RequestHandler {
  return (request, response) => {
    void (async () => {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Content-Type", "text/html; charset=utf-8");

      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.status(403).send(
          renderResultPage({
            title: "飞书授权失败",
            message: "OAuth 回调只允许从本机访问。",
            success: false,
          }),
        );
        return;
      }

      const state = queryValue(request.query.state);
      const code = queryValue(request.query.code);
      const providerError = queryValue(request.query.error);
      const providerErrorDescription = queryValue(request.query.error_description);
      const service = input.getService();

      if (!service) {
        response.status(503).send(
          renderResultPage({
            title: "飞书授权暂不可用",
            message: "Paseo 服务仍在启动，请返回 Paseo 后重新发起授权。",
            success: false,
          }),
        );
        return;
      }

      if (!state) {
        response.status(400).send(
          renderResultPage({
            title: "飞书授权失败",
            message: "授权回调缺少 state，请返回 Paseo 后重新发起授权。",
            success: false,
          }),
        );
        return;
      }

      if (providerError) {
        service.discardAuthorization(state);
        const reason = providerErrorDescription || providerError;
        response.status(400).send(
          renderResultPage({
            title: "飞书授权未完成",
            message: `飞书返回：${reason}。请返回 Paseo 后重新发起授权。`,
            success: false,
          }),
        );
        return;
      }

      if (!code) {
        response.status(400).send(
          renderResultPage({
            title: "飞书授权失败",
            message: "授权回调缺少 code，请返回 Paseo 后重新发起授权。",
            success: false,
          }),
        );
        return;
      }

      try {
        await service.completeAuthorizationCallback(code, state);
        response.send(
          renderResultPage({
            title: "飞书授权成功",
            message: "授权信息已安全保存到 Paseo。现在可以关闭此页面并返回 Paseo。",
            success: true,
          }),
        );
      } catch (error) {
        input.logger.warn({ err: error }, "Failed to complete Lark user OAuth callback");
        response.status(400).send(
          renderResultPage({
            title: "飞书授权失败",
            message:
              error instanceof Error
                ? error.message
                : "无法完成飞书授权，请返回 Paseo 后重新发起授权。",
            success: false,
          }),
        );
      }
    })();
  };
}
