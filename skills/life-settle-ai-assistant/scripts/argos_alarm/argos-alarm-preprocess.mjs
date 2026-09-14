const staleLarkSuiteCredentialKeys = [
  "LARKSUITE_CLI_APP_ID",
  "LARKSUITE_CLI_APP_SECRET",
  "LARKSUITE_CLI_BRAND",
  "LARKSUITE_CLI_USER_ACCESS_TOKEN",
  "LARKSUITE_CLI_TENANT_ACCESS_TOKEN",
];

export function preprocessArgosAlarmCommandEnv(env = process.env) {
  const nextEnv = { ...env };
  const botAppId = nextEnv.FEISHU_BOT_APP_ID || nextEnv.FEISHU_APP_ID || nextEnv.LARK_CLI_APP_ID;
  const botAppSecret =
    nextEnv.FEISHU_BOT_APP_SECRET || nextEnv.FEISHU_APP_SECRET || nextEnv.LARK_CLI_APP_SECRET;

  for (const key of staleLarkSuiteCredentialKeys) {
    delete nextEnv[key];
  }

  if (botAppId) {
    nextEnv.FEISHU_APP_ID = botAppId;
    nextEnv.LARK_CLI_APP_ID = botAppId;
  }
  if (botAppSecret) {
    nextEnv.FEISHU_APP_SECRET = botAppSecret;
    nextEnv.LARK_CLI_APP_SECRET = botAppSecret;
  }
  nextEnv.LARKSUITE_CLI_STRICT_MODE = "off";
  return nextEnv;
}

export function hasFeishuBotCredentials(env = process.env) {
  return Boolean(env.FEISHU_BOT_APP_ID && env.FEISHU_BOT_APP_SECRET);
}
