/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UseProjectsResult } from "@/hooks/use-projects";
const { theme, projectsState, push } = vi.hoisted(() => ({
    theme: {
        spacing: { 0: 0, 1: 4, "1.5": 6, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 },
        iconSize: { sm: 14, md: 20 },
        fontSize: { xs: 11, sm: 13, base: 15 },
        fontWeight: { normal: "400" as const, medium: "500" as const },
        borderRadius: { sm: 4, md: 6, lg: 8, full: 999 },
        opacity: { 50: 0.5 },
        colors: {
            surface0: "#000",
            surface1: "#111",
            surface2: "#222",
            surface3: "#333",
            surfaceSidebarHover: "#1a1a1a",
            foreground: "#fff",
            foregroundMuted: "#aaa",
            border: "#444",
            accent: "#0a84ff",
            palette: { red: { 300: "#ff6b6b" } },
        },
    },
    projectsState: {
        current: {
            projects: [],
            hostErrors: [],
            isLoading: false,
            isFetching: false,
            refetch: vi.fn(),
        } as UseProjectsResult,
    },
    push: vi.fn(),
}));
vi.mock("react-native", () => {
    const passthrough = ({ children, testID, accessibilityLabel, accessibilityRole, onPress, onHoverIn, onHoverOut, ...rest }: {
        children?: React.ReactNode | ((state: {
            pressed: boolean;
            hovered: boolean;
        }) => React.ReactNode);
        testID?: string;
        accessibilityLabel?: string;
        accessibilityRole?: string;
        onPress?: (event: {
            stopPropagation: () => void;
        }) => void;
        onHoverIn?: () => void;
        onHoverOut?: () => void;
    } & Record<string, unknown>) => {
        const dataAttrs: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rest)) {
            if (key.startsWith("data-")) {
                dataAttrs[key] = value;
            }
        }
        return React.createElement("div", {
            role: accessibilityRole,
            "aria-label": accessibilityLabel,
            "data-testid": testID,
            onClick: onPress
                ? (event: React.MouseEvent) => {
                    onPress({ stopPropagation: () => event.stopPropagation() });
                }
                : undefined,
            onMouseEnter: onHoverIn,
            onMouseLeave: onHoverOut,
            ...dataAttrs,
        }, typeof children === "function" ? children({ pressed: false, hovered: false }) : children);
    };
    return {
        View: ({ children, testID }: {
            children?: React.ReactNode;
            testID?: string;
        }) => React.createElement("div", { "data-testid": testID }, children),
        Text: ({ children }: {
            children?: React.ReactNode;
        }) => React.createElement("span", null, children),
        Pressable: passthrough,
        Image: ({ source }: {
            source?: {
                uri?: string;
            };
        }) => React.createElement("img", { src: source?.uri ?? "" }),
        Platform: {
            OS: "web",
            select: <T,>(options: {
                web?: T;
                default?: T;
            }) => options.web ?? options.default,
        },
    };
});
vi.mock("react-native-unistyles", () => ({
    StyleSheet: {
        create: (factory: unknown) => typeof factory === "function" ? (factory as (t: typeof theme) => unknown)(theme) : factory,
    },
    useUnistyles: () => ({ theme }),
}));
vi.mock("lucide-react-native", () => {
    const icon = (name: string) => {
        const Icon = () => React.createElement("span", { "data-icon": name });
        Icon.displayName = name;
        return Icon;
    };
    return {
        ChevronRight: icon("ChevronRight"),
        MoreVertical: icon("MoreVertical"),
        ExternalLink: icon("ExternalLink"),
        Pencil: icon("Pencil"),
        FolderGit2: icon("FolderGit2"),
    };
});
vi.mock("expo-router", () => ({
    router: { push },
}));
vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, string>) => {
            if (key === "sidebar.project.empty.title")
                return "No projects yet";
            if (key === "settings.projectList.hostLoadFailed") {
                return `Couldn't load projects from host ${values?.hostName}: ${values?.message}`;
            }
            if (key === "settings.projectList.hostLoadTimedOut") {
                return `Host ${values?.hostName} did not respond in time. Try again.`;
            }
            if (key === "common.actions.retry")
                return "Retry";
            if (key === "settings.projectList.editProject")
                return `Edit ${values?.projectName}`;
            return key;
        },
    }),
}));
vi.mock("@/components/ui/loading-spinner", () => ({
    LoadingSpinner: ({ size }: {
        size?: string | number;
    }) => React.createElement("span", {
        "data-testid": "projects-loading-spinner",
        "data-size": size,
    }),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
    DropdownMenu: ({ children }: {
        children?: React.ReactNode;
    }) => React.createElement("div", { "data-testid": "dropdown-menu" }, children),
    DropdownMenuTrigger: ({ children, accessibilityLabel, testID, }: {
        children?: React.ReactNode | ((state: {
            pressed: boolean;
            hovered: boolean;
            open: boolean;
        }) => React.ReactNode);
        accessibilityLabel?: string;
        testID?: string;
    }) => React.createElement("button", {
        type: "button",
        "aria-label": accessibilityLabel,
        "data-testid": testID,
        onClick: (event: React.MouseEvent) => event.stopPropagation(),
    }, typeof children === "function"
        ? children({ pressed: false, hovered: false, open: false })
        : children),
    DropdownMenuContent: ({ children }: {
        children?: React.ReactNode;
    }) => React.createElement("div", { "data-testid": "dropdown-menu-content" }, children),
    DropdownMenuItem: ({ children, onSelect, testID, }: {
        children?: React.ReactNode;
        onSelect?: () => void;
        testID?: string;
    }) => React.createElement("button", {
        type: "button",
        "data-testid": testID,
        onClick: (event: React.MouseEvent) => {
            event.stopPropagation();
            onSelect?.();
        },
    }, children),
}));
vi.mock("@/hooks/use-projects", () => ({
    useProjects: () => projectsState.current,
}));
vi.mock("@/projects/icons", () => ({
    useProjectIcons: () => new Map(),
}));
import ProjectsScreen from "./projects-screen";
function setProjectsState(overrides: Partial<UseProjectsResult>) {
    projectsState.current = {
        projects: [],
        hostErrors: [],
        isLoading: false,
        isFetching: false,
        refetch: vi.fn(),
        ...overrides,
    };
}
describe("ProjectsScreen", () => {
    let container: HTMLElement | null = null;
    let root: Root | null = null;
    beforeEach(() => {
        vi.stubGlobal("React", React);
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        container = document.createElement("div");
        document.body.appendChild(container);
        root = createRoot(container);
        setProjectsState({});
        push.mockReset();
    });
    afterEach(() => {
        if (root) {
            act(() => {
                root?.unmount();
            });
        }
        root = null;
        container?.remove();
        container = null;
        vi.unstubAllGlobals();
    });
    function render(serverId = "host-a") {
        act(() => {
            root?.render(<ProjectsScreen serverId={serverId}/>);
        });
    }
    it("shows a retryable timeout instead of an empty state on the first load failure", () => {
        const refetch = vi.fn();
        setProjectsState({
            projects: [],
            hostErrors: [
                {
                    serverId: "host-a",
                    serverName: "alpha",
                    message: "Timeout waiting for message (60000ms)",
                },
            ],
            refetch,
        });
        render();
        expect(container?.textContent).toContain("Host alpha did not respond in time. Try again.");
        expect(container?.textContent).not.toContain("Timeout waiting for message");
        expect(container?.textContent).not.toContain("No projects yet");
        const retry = container?.querySelector('[data-testid="projects-host-errors-retry"]');
        act(() => {
            retry?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        });
        expect(refetch).toHaveBeenCalledTimes(1);
    });
});
