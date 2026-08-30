import type { LarkDirectory, LarkUserOAuthStatus } from "@getpaseo/protocol/messages";
import type { StoredLarkChannelBot } from "./lark-channel-store.js";
import {
  normalizeLarkDirectoryEmail,
  pickLarkDirectoryDisplayName,
} from "./lark-directory-identity.js";

export interface LarkDirectoryUserSeed {
  appId: string;
  openId: string;
  email: string | null;
  displayName: string | null;
}

interface LarkDirectoryIdentitySource extends LarkDirectoryUserSeed {
  unionId: string | null;
}

function collectBotIdentitySources(
  bot: StoredLarkChannelBot,
  directory: LarkDirectory,
  oauth: LarkUserOAuthStatus | null,
): LarkDirectoryIdentitySource[] {
  const appId = bot.config.appId?.trim();
  if (!appId) return [];
  const identities: Array<{
    openId: string | null;
    unionId: string | null;
    displayName: string;
  }> = [
    ...bot.authorizedUsers,
    ...bot.pendingPairings,
    ...(bot.config.substitute.openId
      ? [
          {
            openId: bot.config.substitute.openId,
            unionId: null,
            displayName: bot.config.substitute.name ?? "",
          },
        ]
      : []),
  ];
  if (oauth?.openId) {
    identities.push({
      openId: oauth.openId,
      unionId: identities.find((identity) => identity.openId === oauth.openId)?.unionId ?? null,
      displayName: oauth.displayName ?? "",
    });
  }
  return identities.flatMap((identity) => {
    const openId = identity.openId?.trim();
    if (!openId) return [];
    const cached =
      directory.users.find((user) => user.appId === appId && user.openId === openId) ?? null;
    return [
      {
        appId,
        openId,
        unionId: identity.unionId?.trim() || null,
        email:
          normalizeLarkDirectoryEmail(oauth?.openId === openId ? oauth.email : null) ??
          cached?.email ??
          null,
        displayName: pickLarkDirectoryDisplayName(
          oauth?.openId === openId ? oauth.displayName : null,
          pickLarkDirectoryDisplayName(identity.displayName, cached?.displayName),
        ),
      },
    ];
  });
}

function collectSharedIdentities(
  sources: readonly LarkDirectoryIdentitySource[],
): Map<string, Pick<LarkDirectoryUserSeed, "email" | "displayName">> {
  const identities = new Map<string, Pick<LarkDirectoryUserSeed, "email" | "displayName">>();
  for (const source of sources) {
    if (!source.unionId) continue;
    const current = identities.get(source.unionId);
    identities.set(source.unionId, {
      email: current?.email ?? source.email,
      displayName: pickLarkDirectoryDisplayName(current?.displayName, source.displayName),
    });
  }
  return identities;
}

export function buildLarkDirectoryUserSeeds(
  bots: readonly StoredLarkChannelBot[],
  directory: LarkDirectory,
  getOAuthStatus: (appId: string) => LarkUserOAuthStatus | null,
): LarkDirectoryUserSeed[] {
  const sources = bots.flatMap((bot) =>
    collectBotIdentitySources(
      bot,
      directory,
      bot.config.appId ? getOAuthStatus(bot.config.appId) : null,
    ),
  );
  const sharedIdentities = collectSharedIdentities(sources);
  const seeds = new Map<string, LarkDirectoryUserSeed>();
  for (const source of sources) {
    const shared = source.unionId ? sharedIdentities.get(source.unionId) : null;
    const key = `${source.appId}:${source.openId}`;
    const current = seeds.get(key);
    seeds.set(key, {
      appId: source.appId,
      openId: source.openId,
      email: current?.email ?? source.email ?? shared?.email ?? null,
      displayName: pickLarkDirectoryDisplayName(
        current?.displayName,
        pickLarkDirectoryDisplayName(source.displayName, shared?.displayName),
      ),
    });
  }
  return [...seeds.values()];
}
