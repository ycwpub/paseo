import { create } from "zustand";
import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";

export interface AddProjectFlowCreatedProject {
  serverId: string;
  project: WorkspaceProjectDescriptorPayload;
}

export interface OpenAddProjectFlowRequest {
  preferredHostId?: string;
  initialDirectorylessProjectName?: string;
  onProjectCreated?: (result: AddProjectFlowCreatedProject) => void;
}

export interface AddProjectFlowRequest {
  id: number;
  preferredHostId?: string;
  initialDirectorylessProjectName?: string;
  onProjectCreated?: (result: AddProjectFlowCreatedProject) => void;
}

interface AddProjectFlowStoreState {
  request: AddProjectFlowRequest | null;
  open: (preferredHostId?: string) => void;
  openRequest: (request: OpenAddProjectFlowRequest) => void;
  close: () => void;
}

let nextRequestId = 1;

function createRequest(input: OpenAddProjectFlowRequest): AddProjectFlowRequest {
  return {
    id: nextRequestId++,
    ...(input.preferredHostId ? { preferredHostId: input.preferredHostId } : {}),
    ...(input.initialDirectorylessProjectName
      ? { initialDirectorylessProjectName: input.initialDirectorylessProjectName }
      : {}),
    ...(input.onProjectCreated ? { onProjectCreated: input.onProjectCreated } : {}),
  };
}

export const useAddProjectFlowStore = create<AddProjectFlowStoreState>((set) => ({
  request: null,
  open: (preferredHostId) => {
    set({
      request: createRequest(preferredHostId ? { preferredHostId } : {}),
    });
  },
  openRequest: (request) => set({ request: createRequest(request) }),
  close: () => set({ request: null }),
}));
