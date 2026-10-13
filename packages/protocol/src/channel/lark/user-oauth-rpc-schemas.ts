import { z } from "zod";

export const DEFAULT_LARK_USER_OAUTH_REDIRECT_URI = "http://127.0.0.1:6767/oauth/lark";

const LarkUserOAuthRedirectUriSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
    message: "飞书 OAuth 回调地址必须使用 HTTP 或 HTTPS",
  });

export const LarkUserOAuthStatusSchema = z.object({
  appId: z.string(),
  authorized: z.boolean(),
  needsAuthorization: z.boolean(),
  expiresAt: z.string().nullable(),
  refreshTokenExpiresAt: z.string().nullable(),
  openId: z.string().nullable(),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  scope: z.string().nullable(),
});

export type LarkUserOAuthStatus = z.infer<typeof LarkUserOAuthStatusSchema>;

export const LarkUserOAuthGetStatusRequestSchema = z.object({
  type: z.literal("channel.lark.user_oauth.get_status.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
});

export const LarkUserOAuthGetStatusResponseSchema = z.object({
  type: z.literal("channel.lark.user_oauth.get_status.response"),
  payload: z.object({
    requestId: z.string(),
    status: LarkUserOAuthStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkUserOAuthVerifyRequestSchema = z.object({
  type: z.literal("channel.lark.user_oauth.verify.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
});

export const LarkUserOAuthVerifyResponseSchema = z.object({
  type: z.literal("channel.lark.user_oauth.verify.response"),
  payload: z.object({
    requestId: z.string(),
    status: LarkUserOAuthStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkUserOAuthStartRequestSchema = z.object({
  type: z.literal("channel.lark.user_oauth.start.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  redirectUri: LarkUserOAuthRedirectUriSchema,
});

export const LarkUserOAuthStartResponseSchema = z.object({
  type: z.literal("channel.lark.user_oauth.start.response"),
  payload: z.object({
    requestId: z.string(),
    authorizationUrl: z.string().nullable(),
    state: z.string().nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkUserOAuthCompleteRequestSchema = z.object({
  type: z.literal("channel.lark.user_oauth.complete.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
  codeOrCallbackUrl: z.string().trim().min(1),
  state: z.string().trim().min(1),
});

export const LarkUserOAuthCompleteResponseSchema = z.object({
  type: z.literal("channel.lark.user_oauth.complete.response"),
  payload: z.object({
    requestId: z.string(),
    status: LarkUserOAuthStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});

export const LarkUserOAuthDisconnectRequestSchema = z.object({
  type: z.literal("channel.lark.user_oauth.disconnect.request"),
  requestId: z.string(),
  appId: z.string().trim().min(1),
});

export const LarkUserOAuthDisconnectResponseSchema = z.object({
  type: z.literal("channel.lark.user_oauth.disconnect.response"),
  payload: z.object({
    requestId: z.string(),
    status: LarkUserOAuthStatusSchema.nullable(),
    error: z.string().nullable(),
  }),
});
