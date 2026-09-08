const USER_OAUTH_REQUIRED_ERROR_MARKERS = [
  "飞书用户身份未授权或已失效",
  "请先完成 OAuth 授权",
  "请先为 App ID",
  "用户身份权限",
  "缺少",
  "未授权",
  "已过期",
  "重新授权",
  "99991679",
];

const BOT_PERMISSION_ERROR_MARKERS = [
  "飞书机器人应用身份权限不足",
  "请更新机器人权限",
  "当前飞书机器人无法写入",
];

export function isLarkUserOAuthRequiredError(message: string): boolean {
  return (
    (message.includes("OAuth") || message.includes("用户身份权限")) &&
    USER_OAUTH_REQUIRED_ERROR_MARKERS.some((marker) => message.includes(marker))
  );
}

export function isLarkBotPermissionRequiredError(message: string): boolean {
  return BOT_PERMISSION_ERROR_MARKERS.some((marker) => message.includes(marker));
}
