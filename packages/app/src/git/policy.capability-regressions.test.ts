import { afterEach, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { buildGitActions, type BuildGitActionsInput } from "./policy";
import { deriveMergeCapability } from "./merge-capability";
function createInput(overrides: Partial<Omit<BuildGitActionsInput, "mergeCapability">> & {
    pullRequestGithub?: unknown;
} = {}): BuildGitActionsInput {
    const { pullRequestGithub = null, ...rest } = overrides;
    return {
        isGit: true,
        githubFeaturesEnabled: true,
        forgeBrandLabel: "GitHub",
        forgeChangeRequestNoun: "PR",
        githubAutoMergeActionsEnabled: true,
        hasPullRequest: false,
        pullRequestUrl: null,
        pullRequestState: null,
        pullRequestIsDraft: false,
        pullRequestIsMerged: false,
        pullRequestMergeable: "UNKNOWN",
        mergeCapability: deriveMergeCapability(pullRequestGithub),
        hasRemote: false,
        isPaseoOwnedWorktree: false,
        isOnBaseBranch: true,
        hasUncommittedChanges: false,
        baseRefAvailable: true,
        baseRefLabel: "main",
        aheadCount: 0,
        behindBaseCount: 0,
        aheadOfOrigin: 0,
        behindOfOrigin: 0,
        shouldPromoteArchive: false,
        shipDefault: "pr",
        runtime: {
            commit: {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            pull: {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            push: {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "pull-and-push": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            pr: {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "merge-pr-squash": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "merge-pr-merge": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "merge-pr-rebase": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "enable-pr-auto-merge-squash": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "enable-pr-auto-merge-merge": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "enable-pr-auto-merge-rebase": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "disable-pr-auto-merge": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "merge-branch": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "merge-from-base": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
            "archive-workspace": {
                disabled: false,
                status: "idle",
                handler: () => undefined,
            },
        },
        ...rest,
    };
}
describe("git-actions-policy", () => {
    afterEach(async () => {
        await i18n.changeLanguage("en");
    });
    it("uses the active language for policy-owned action labels and unavailable messages", async () => {
        await i18n.changeLanguage("zh-CN");
        const actions = buildGitActions(createInput({
            hasRemote: true,
            behindOfOrigin: 1,
            isOnBaseBranch: false,
            aheadCount: 0,
        }));
        expect(actions.primary).toMatchObject({
            id: "pull",
            label: "拉取",
            pendingLabel: "正在拉取...",
            successLabel: "已拉取",
        });
        expect(actions.secondary.find((entry) => entry.id === "pr")).toMatchObject({
            label: "创建 PR",
            unavailableMessage: "无法创建 PR，因为此分支还没有新的 commit",
        });
    });
});
