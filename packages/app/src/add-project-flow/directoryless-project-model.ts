import * as base from "./model";

export interface AddProjectHost extends base.AddProjectHost {
  canCreateDirectorylessProject?: boolean;
}

export type GithubRepositoryChoice = base.GithubRepositoryChoice;

export interface DirectorylessProjectNamePage {
  kind: "directoryless-project-name";
  hostId: string;
  name: string;
  activeIndex: number;
  error: string | null;
  isSubmitting: boolean;
}

export type AddProjectPage = base.AddProjectPage | DirectorylessProjectNamePage;

export interface AddProjectFlowState
  extends Omit<base.AddProjectFlowState, "hosts" | "pages"> {
  hosts: AddProjectHost[];
  pages: AddProjectPage[];
  directorylessProjectNameDrafts: Record<string, string>;
}

export interface OpenAddProjectFlowInput {
  hosts: AddProjectHost[];
  preferredHostId?: string;
  initialDirectorylessProjectName?: string;
}

function asBaseState(state: AddProjectFlowState): base.AddProjectFlowState {
  return state as unknown as base.AddProjectFlowState;
}

function asExtendedState(state: base.AddProjectFlowState): AddProjectFlowState {
  return state as unknown as AddProjectFlowState;
}

function directorylessProjectNamePage(
  hostId: string,
  name: string
): DirectorylessProjectNamePage {
  return {
    kind: "directoryless-project-name",
    hostId,
    name,
    activeIndex: 0,
    error: null,
    isSubmitting: false,
  };
}

function initialHostFor(input: {
  hosts: AddProjectHost[];
  preferredHostId?: string;
}): AddProjectHost | null {
  const preferredHost = input.preferredHostId
    ? input.hosts.find((host) => host.serverId === input.preferredHostId)
    : null;
  return (
    preferredHost ?? (input.hosts.length === 1 ? input.hosts[0] : null) ?? null
  );
}

export function openAddProjectFlow(
  input: OpenAddProjectFlowInput
): AddProjectFlowState {
  const baseState = base.openAddProjectFlow({
    hosts: input.hosts,
    ...(input.preferredHostId
      ? { preferredHostId: input.preferredHostId }
      : {}),
  });
  const initialHost = initialHostFor(input);
  const initialName = input.initialDirectorylessProjectName;

  return {
    ...baseState,
    hosts: input.hosts,
    pages:
      initialHost?.canCreateDirectorylessProject && initialName !== undefined
        ? [directorylessProjectNamePage(initialHost.serverId, initialName)]
        : baseState.pages,
    directorylessProjectNameDrafts:
      initialHost && initialName !== undefined
        ? { [initialHost.serverId]: initialName }
        : {},
  };
}

export function applyAvailableAddProjectHosts(
  state: AddProjectFlowState,
  hosts: AddProjectHost[],
  preferredHostId?: string,
  initialDirectorylessProjectName?: string
): AddProjectFlowState {
  const current = currentAddProjectPage(state);
  if (state.pages.length !== 1 || current.kind !== "host") {
    return { ...state, hosts };
  }

  const baseState = asExtendedState(
    base.applyAvailableAddProjectHosts(
      asBaseState(state),
      hosts,
      preferredHostId
    )
  );
  const initialHost = initialHostFor({ hosts, preferredHostId });
  if (
    !initialHost?.canCreateDirectorylessProject ||
    initialDirectorylessProjectName === undefined
  ) {
    return { ...baseState, hosts };
  }

  return {
    ...baseState,
    hosts,
    pages: [
      directorylessProjectNamePage(
        initialHost.serverId,
        initialDirectorylessProjectName
      ),
    ],
    directorylessProjectNameDrafts: {
      ...state.directorylessProjectNameDrafts,
      [initialHost.serverId]: initialDirectorylessProjectName,
    },
  };
}

export function currentAddProjectPage(
  state: AddProjectFlowState
): AddProjectPage {
  const page = state.pages[state.pages.length - 1];
  if (!page) {
    throw new Error("Add Project flow must always contain a page");
  }
  return page;
}

export function updateCurrentAddProjectPage(
  state: AddProjectFlowState,
  update: (page: AddProjectPage) => AddProjectPage
): AddProjectFlowState {
  const index = state.pages.length - 1;
  return {
    ...state,
    pages: state.pages.map((page, pageIndex) =>
      pageIndex === index ? update(page) : page
    ),
  };
}

export function pushAddProjectPage(
  state: AddProjectFlowState,
  page: AddProjectPage
): AddProjectFlowState {
  return { ...state, pages: [...state.pages, page] };
}

export function backAddProjectPage(
  state: AddProjectFlowState
): AddProjectFlowState | null {
  if (state.pages.length === 1) {
    return null;
  }
  return { ...state, pages: state.pages.slice(0, -1) };
}

export function chooseAddProjectHost(
  state: AddProjectFlowState,
  hostId: string
): AddProjectFlowState {
  return asExtendedState(base.chooseAddProjectHost(asBaseState(state), hostId));
}

export function openDirectorySearchPage(
  state: AddProjectFlowState,
  hostId: string
): AddProjectFlowState {
  return asExtendedState(
    base.openDirectorySearchPage(asBaseState(state), hostId)
  );
}

export function openGithubSearchPage(
  state: AddProjectFlowState,
  hostId: string
): AddProjectFlowState {
  return asExtendedState(base.openGithubSearchPage(asBaseState(state), hostId));
}

export function openGithubLocationPage(
  state: AddProjectFlowState,
  hostId: string,
  repository: GithubRepositoryChoice
): AddProjectFlowState {
  return asExtendedState(
    base.openGithubLocationPage(asBaseState(state), hostId, repository)
  );
}

export function openNewDirectoryParentPage(
  state: AddProjectFlowState,
  hostId: string
): AddProjectFlowState {
  return asExtendedState(
    base.openNewDirectoryParentPage(asBaseState(state), hostId)
  );
}

export function openDirectorylessProjectNamePage(
  state: AddProjectFlowState,
  hostId: string
): AddProjectFlowState {
  return pushAddProjectPage(
    state,
    directorylessProjectNamePage(
      hostId,
      state.directorylessProjectNameDrafts[hostId] ?? ""
    )
  );
}

export function openNewDirectoryNamePage(
  state: AddProjectFlowState,
  hostId: string,
  parentPath: string
): AddProjectFlowState {
  return asExtendedState(
    base.openNewDirectoryNamePage(asBaseState(state), hostId, parentPath)
  );
}

export function setAddProjectPageInput(
  state: AddProjectFlowState,
  value: string
): AddProjectFlowState {
  const page = currentAddProjectPage(state);
  if (page.kind === "directoryless-project-name") {
    return updateCurrentAddProjectPage(state, (current) =>
      current.kind === "directoryless-project-name"
        ? { ...current, name: value, activeIndex: 0, error: null }
        : current
    );
  }
  return asExtendedState(
    base.setAddProjectPageInput(asBaseState(state), value)
  );
}

export function setDirectorylessProjectName(
  state: AddProjectFlowState,
  value: string
): AddProjectFlowState {
  const page = currentAddProjectPage(state);
  if (page.kind !== "directoryless-project-name") return state;
  const updated = setAddProjectPageInput(state, value);
  return {
    ...updated,
    directorylessProjectNameDrafts: {
      ...updated.directorylessProjectNameDrafts,
      [page.hostId]: value,
    },
  };
}

export function setNewDirectoryName(
  state: AddProjectFlowState,
  value: string
): AddProjectFlowState {
  return asExtendedState(base.setNewDirectoryName(asBaseState(state), value));
}

export function setAddProjectActiveIndex(
  state: AddProjectFlowState,
  activeIndex: number
): AddProjectFlowState {
  if (currentAddProjectPage(state).kind === "directoryless-project-name") {
    return updateCurrentAddProjectPage(state, (page) => ({
      ...page,
      activeIndex,
    }));
  }
  return asExtendedState(
    base.setAddProjectActiveIndex(asBaseState(state), activeIndex)
  );
}

export { moveAddProjectActiveIndex, moveAddProjectSelection } from "./model";
