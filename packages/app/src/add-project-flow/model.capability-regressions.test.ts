import { describe, expect, it } from "vitest";
import {
  applyAvailableAddProjectHosts,
  backAddProjectPage,
  currentAddProjectPage,
  openAddProjectFlow,
  openDirectorylessProjectNamePage,
  setDirectorylessProjectName,
  type AddProjectHost,
} from "./directoryless-project-model";
import { buildAddProjectMethods } from "./directoryless-project-options";
const HOST: AddProjectHost = {
  serverId: "host-1",
  label: "Local",
  canAddProject: true,
  canBrowse: true,
  canCloneGithubRepositories: true,
  canSearchGithubRepositories: true,
  canCreateDirectory: true,
  canCreateDirectorylessProject: true,
};
describe("Add Project navigation", () => {
  it("opens the multi-directory Project name page with a prefilled name", () => {
    const state = openAddProjectFlow({
      hosts: [HOST],
      preferredHostId: HOST.serverId,
      initialDirectorylessProjectName: "支付优化",
    });
    expect(currentAddProjectPage(state)).toEqual({
      kind: "directoryless-project-name",
      hostId: HOST.serverId,
      name: "支付优化",
      activeIndex: 0,
      error: null,
      isSubmitting: false,
    });
  });
  it("preserves the prefilled multi-directory Project name while hosts connect", () => {
    const initial = openAddProjectFlow({
      hosts: [],
      preferredHostId: HOST.serverId,
      initialDirectorylessProjectName: "支付优化",
    });
    const connected = applyAvailableAddProjectHosts(
      initial,
      [HOST],
      HOST.serverId,
      "支付优化"
    );
    expect(currentAddProjectPage(connected)).toMatchObject({
      kind: "directoryless-project-name",
      hostId: HOST.serverId,
      name: "支付优化",
    });
  });
  it("restores a directoryless project name after returning to the method page", () => {
    let state = openAddProjectFlow({ hosts: [HOST] });
    state = openDirectorylessProjectNamePage(state, HOST.serverId);
    state = setDirectorylessProjectName(state, "Planning");
    state = backAddProjectPage(state) ?? state;
    state = openDirectorylessProjectNamePage(state, HOST.serverId);
    expect(currentAddProjectPage(state)).toMatchObject({
      kind: "directoryless-project-name",
      name: "Planning",
    });
  });
});
describe("Add Project options", () => {
  it("keeps host-upgrade methods discoverable while hiding local-only Browse", () => {
    expect(
      buildAddProjectMethods({
        ...HOST,
        canBrowse: false,
        canCloneGithubRepositories: false,
        canSearchGithubRepositories: false,
        canCreateDirectory: false,
        canCreateDirectorylessProject: false,
      })
    ).toEqual([
      {
        id: "directory-search",
        label: "Search for directory",
        description: "Find a directory on Local",
      },
      {
        id: "github",
        label: "Clone from GitHub",
        description: "Update this host to clone GitHub repositories",
        disabled: true,
      },
      {
        id: "new-directory",
        label: "New directory",
        description: "Update this host to create directories",
        disabled: true,
      },
      {
        id: "directoryless-project",
        label: "Multi-directory project",
        description: "Update this host to create multi-directory projects",
        disabled: true,
      },
    ]);
  });
});
