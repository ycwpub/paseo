import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftStore } from "@/stores/draft-store";
const { asyncStorage } = vi.hoisted(() => ({
    asyncStorage: new Map<string, string>(),
}));
vi.hoisted(() => {
    (globalThis as unknown as {
        __DEV__: boolean;
    }).__DEV__ = false;
});
vi.mock("@react-native-async-storage/async-storage", () => ({
    default: {
        getItem: async (key: string) => asyncStorage.get(key) ?? null,
        setItem: async (key: string, value: string) => {
            asyncStorage.set(key, value);
        },
        removeItem: async (key: string) => {
            asyncStorage.delete(key);
        },
    },
}));
vi.mock("@/attachments/service", () => ({
    garbageCollectAttachments: async () => undefined,
}));
vi.mock("@/hooks/use-agent-form-state", () => ({
    useAgentFormState: () => ({
        selectedServerId: "host-1",
        setSelectedServerId: () => undefined,
        setSelectedServerIdFromUser: () => undefined,
        selectedProvider: "codex",
        setProviderFromUser: () => undefined,
        selectedMode: "auto",
        setModeFromUser: () => undefined,
        selectedModel: "",
        setModelFromUser: () => undefined,
        selectedThinkingOptionId: "",
        setThinkingOptionFromUser: () => undefined,
        workingDir: "/repo",
        setWorkingDir: () => undefined,
        setWorkingDirFromUser: () => undefined,
        providerDefinitions: [{ id: "codex", label: "Codex", modes: [{ id: "auto", label: "Auto" }] }],
        providerDefinitionMap: new Map(),
        agentDefinition: undefined,
        modeOptions: [{ id: "auto", label: "Auto" }],
        availableModels: [
            {
                provider: "codex",
                id: "gpt-5.4",
                label: "gpt-5.4",
                isDefault: true,
                defaultThinkingOptionId: "high",
                thinkingOptions: [
                    { id: "medium", label: "Medium" },
                    { id: "high", label: "High", isDefault: true },
                ],
            },
        ],
        allProviderModels: new Map([
            [
                "codex",
                [
                    {
                        provider: "codex",
                        id: "gpt-5.4",
                        label: "gpt-5.4",
                        isDefault: true,
                        defaultThinkingOptionId: "high",
                        thinkingOptions: [
                            { id: "medium", label: "Medium" },
                            { id: "high", label: "High", isDefault: true },
                        ],
                    },
                ],
            ],
        ]),
        modelSelectorProviders: [
            {
                id: "codex",
                label: "Codex",
                modelSelection: {
                    kind: "models",
                    rows: [
                        {
                            favoriteKey: "codex:gpt-5.4",
                            provider: "codex",
                            providerLabel: "Codex",
                            modelId: "gpt-5.4",
                            modelLabel: "gpt-5.4",
                            isDefault: true,
                        },
                    ],
                },
            },
        ],
        isAllModelsLoading: false,
        isProviderModelsRefreshing: false,
        availableThinkingOptions: [
            { id: "medium", label: "Medium" },
            { id: "high", label: "High", isDefault: true },
        ],
        isModelLoading: false,
        modelError: null,
        refreshProviderModels: () => undefined,
        setProviderAndModelFromUser: () => undefined,
        workingDirIsEmpty: false,
        persistFormPreferences: async () => undefined,
    }),
}));
let useAgentInputDraft: typeof import("./input-draft").useAgentInputDraft;
beforeAll(async () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
        value: {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
                removeItem: (key: string) => {
                    storage.delete(key);
                },
            },
        },
        configurable: true,
    });
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
        value: true,
        configurable: true,
    });
    ({ useAgentInputDraft } = await import("./input-draft"));
});
describe("useAgentInputDraft live contract", () => {
    beforeEach(() => {
        asyncStorage.clear();
        const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
            url: "http://localhost",
        });
        Object.defineProperty(globalThis, "document", {
            value: dom.window.document,
            configurable: true,
        });
        Object.defineProperty(globalThis, "navigator", {
            value: dom.window.navigator,
            configurable: true,
        });
        useDraftStore.setState({
            drafts: {},
            createModalDraft: null,
            attachmentFocusRequestByDraftKey: {},
        });
    });
    it("applies assistant labels that hydrate after render and resets them between drafts", async () => {
        let latest: ReturnType<typeof useAgentInputDraft> | null = null;
        function getLatest(): ReturnType<typeof useAgentInputDraft> {
            if (!latest) {
                throw new Error("Expected hook result");
            }
            return latest;
        }
        function Probe({ draftKey, initialAssistantId, }: {
            draftKey: string;
            initialAssistantId: string | null;
        }) {
            latest = useAgentInputDraft({ draftKey, initialAssistantId });
            return null;
        }
        const queryClient = new QueryClient();
        const container = document.getElementById("root");
        if (!container) {
            throw new Error("Missing root container");
        }
        const root = createRoot(container);
        await act(async () => {
            root.render(<QueryClientProvider client={queryClient}>
          <Probe draftKey="agent:one" initialAssistantId={null}/>
        </QueryClientProvider>);
        });
        expect(getLatest().assistantId).toBeNull();
        await act(async () => {
            root.render(<QueryClientProvider client={queryClient}>
          <Probe draftKey="agent:one" initialAssistantId="assistant-1"/>
        </QueryClientProvider>);
        });
        expect(getLatest().assistantId).toBe("assistant-1");
        await act(async () => {
            getLatest().setAssistantId("manual-assistant");
        });
        await act(async () => {
            root.render(<QueryClientProvider client={queryClient}>
          <Probe draftKey="agent:one" initialAssistantId="assistant-2"/>
        </QueryClientProvider>);
        });
        expect(getLatest().assistantId).toBe("manual-assistant");
        await act(async () => {
            root.render(<QueryClientProvider client={queryClient}>
          <Probe draftKey="agent:two" initialAssistantId="assistant-2"/>
        </QueryClientProvider>);
        });
        expect(getLatest().assistantId).toBe("assistant-2");
    });
    it("clears a remounted composer when another instance finalizes its submitted draft", async () => {
        let latest: ReturnType<typeof useAgentInputDraft> | null = null;
        function getLatest(): ReturnType<typeof useAgentInputDraft> {
            if (!latest) {
                throw new Error("Expected hook result");
            }
            return latest;
        }
        useDraftStore.getState().saveDraftInput({
            draftKey: "agent:submitted",
            draft: {
                text: "任务完成了吗",
                attachments: [],
            },
        });
        function Probe() {
            latest = useAgentInputDraft({ draftKey: "agent:submitted" });
            return null;
        }
        const queryClient = new QueryClient();
        const container = document.getElementById("root");
        if (!container) {
            throw new Error("Missing root container");
        }
        const root = createRoot(container);
        await act(async () => {
            root.render(<QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>);
        });
        expect(getLatest().text).toBe("任务完成了吗");
        await act(async () => {
            useDraftStore.getState().clearDraftInput({
                draftKey: "agent:submitted",
                lifecycle: "sent",
            });
        });
        expect(getLatest().text).toBe("");
        expect(getLatest().attachments).toEqual([]);
        expect(useDraftStore.getState().drafts["agent:submitted"]).toMatchObject({
            lifecycle: "sent",
            input: { text: "", attachments: [] },
        });
    });
});
