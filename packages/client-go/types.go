package paseo

import (
	"encoding/json"
	"fmt"
)

// ServerInfo describes the daemon that accepted the client hello.
type ServerInfo struct {
	ServerID     string          `json:"serverId"`
	Hostname     string          `json:"hostname"`
	Version      string          `json:"version"`
	Capabilities json.RawMessage `json:"capabilities,omitempty"`
	Features     json.RawMessage `json:"features,omitempty"`
}

// Agent is the stable subset of an agent snapshot exposed by the minimal SDK.
// Raw contains the complete daemon payload for fields not modeled here.
type Agent struct {
	ID                  string            `json:"id"`
	Provider            string            `json:"provider"`
	CWD                 string            `json:"cwd"`
	WorkspaceID         string            `json:"workspaceId,omitempty"`
	Model               *string           `json:"model"`
	ThinkingOptionID    *string           `json:"thinkingOptionId,omitempty"`
	CreatedAt           string            `json:"createdAt"`
	UpdatedAt           string            `json:"updatedAt"`
	LastUserMessageAt   *string           `json:"lastUserMessageAt"`
	Status              string            `json:"status"`
	CurrentModeID       *string           `json:"currentModeId"`
	Title               *string           `json:"title"`
	Labels              map[string]string `json:"labels"`
	RequiresAttention   bool              `json:"requiresAttention,omitempty"`
	AttentionReason     *string           `json:"attentionReason,omitempty"`
	AttentionTimestamp  *string           `json:"attentionTimestamp,omitempty"`
	ArchivedAt          *string           `json:"archivedAt,omitempty"`
	ProviderUnavailable bool              `json:"providerUnavailable,omitempty"`
	Raw                 json.RawMessage   `json:"-"`
}

// AgentConfig selects the provider runtime and permissions for a new agent.
//
// Provider, CWD, and (for providers that require it) ModeID should be selected
// from the daemon's provider catalog rather than assumed to be globally valid.
type AgentConfig struct {
	Provider         string                     `json:"provider"`
	CWD              string                     `json:"cwd"`
	ModeID           string                     `json:"modeId,omitempty"`
	Model            string                     `json:"model,omitempty"`
	ThinkingOptionID string                     `json:"thinkingOptionId,omitempty"`
	FeatureValues    map[string]any             `json:"featureValues,omitempty"`
	Title            string                     `json:"title,omitempty"`
	ApprovalPolicy   string                     `json:"approvalPolicy,omitempty"`
	SandboxMode      string                     `json:"sandboxMode,omitempty"`
	NetworkAccess    *bool                      `json:"networkAccess,omitempty"`
	WebSearch        *bool                      `json:"webSearch,omitempty"`
	Extra            *AgentProviderExtra        `json:"extra,omitempty"`
	SystemPrompt     string                     `json:"systemPrompt,omitempty"`
	MCPServers       map[string]MCPServerConfig `json:"mcpServers,omitempty"`
}

// AgentProviderExtra contains provider-specific configuration.
type AgentProviderExtra struct {
	Codex  map[string]any `json:"codex,omitempty"`
	Claude map[string]any `json:"claude,omitempty"`
}

// MCPServerConfig describes a stdio, HTTP, or SSE MCP server.
type MCPServerConfig struct {
	Type       string            `json:"type"`
	Command    string            `json:"command,omitempty"`
	Args       []string          `json:"args,omitempty"`
	Env        map[string]string `json:"env,omitempty"`
	URL        string            `json:"url,omitempty"`
	Headers    map[string]string `json:"headers,omitempty"`
	AlwaysLoad bool              `json:"alwaysLoad,omitempty"`
}

// CreateAgentOptions configures a new agent.
//
// Leave InitialPrompt empty when the caller needs to subscribe before the first
// turn. After CreateAgent returns, subscribe with the returned ID and call
// SendAgentMessage.
type CreateAgentOptions struct {
	Config               AgentConfig       `json:"config"`
	Env                  map[string]string `json:"env,omitempty"`
	WorkspaceID          string            `json:"workspaceId,omitempty"`
	CallerAgentID        string            `json:"callerAgentId,omitempty"`
	WorktreeName         string            `json:"worktreeName,omitempty"`
	InitialPrompt        string            `json:"initialPrompt,omitempty"`
	AssistantID          string            `json:"assistantId,omitempty"`
	TeamID               string            `json:"teamId,omitempty"`
	SelectedMCPServerIDs []string          `json:"selectedMcpServerIds,omitempty"`
	SelectedSkillIDs     []string          `json:"selectedSkillIds,omitempty"`
	ClientMessageID      string            `json:"clientMessageId,omitempty"`
	OutputSchema         map[string]any    `json:"outputSchema,omitempty"`
	AutoArchive          *bool             `json:"autoArchive,omitempty"`
	Labels               map[string]string `json:"labels,omitempty"`
}

// ArchiveAgentResult describes a completed agent archive operation.
type ArchiveAgentResult struct {
	AgentID    string `json:"agentId"`
	ArchivedAt string `json:"archivedAt"`
}

// UnmarshalJSON preserves the full agent snapshot in Raw while decoding common fields.
func (a *Agent) UnmarshalJSON(data []byte) error {
	type agentAlias Agent
	var decoded agentAlias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	*a = Agent(decoded)
	a.Raw = append(a.Raw[:0], data...)
	return nil
}

// AgentStreamEvent is an asynchronous event emitted by a running agent.
// Event contains the complete provider-independent event payload.
type AgentStreamEvent struct {
	AgentID   string          `json:"agentId"`
	Event     json.RawMessage `json:"event"`
	Timestamp string          `json:"timestamp"`
	Seq       *uint64         `json:"seq,omitempty"`
	Epoch     string          `json:"epoch,omitempty"`
}

// EventType returns the discriminator in Event.
func (e AgentStreamEvent) EventType() string {
	var header struct {
		Type string `json:"type"`
	}
	if json.Unmarshal(e.Event, &header) != nil {
		return ""
	}
	return header.Type
}

// DecodeEvent decodes Event into v.
func (e AgentStreamEvent) DecodeEvent(v any) error {
	if len(e.Event) == 0 {
		return fmt.Errorf("paseo: stream event payload is empty")
	}
	return json.Unmarshal(e.Event, v)
}

// PermissionAction is one action offered by a permission request.
type PermissionAction struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Behavior string `json:"behavior"`
	Variant  string `json:"variant,omitempty"`
	Intent   string `json:"intent,omitempty"`
}

// PermissionRequest describes an agent permission request.
type PermissionRequest struct {
	ID          string             `json:"id"`
	Provider    string             `json:"provider"`
	Name        string             `json:"name"`
	Kind        string             `json:"kind"`
	Title       string             `json:"title,omitempty"`
	Description string             `json:"description,omitempty"`
	Input       map[string]any     `json:"input,omitempty"`
	Actions     []PermissionAction `json:"actions,omitempty"`
	Metadata    map[string]any     `json:"metadata,omitempty"`
}

// PermissionRequest decodes a permission_requested stream event.
func (e AgentStreamEvent) PermissionRequest() (*PermissionRequest, error) {
	var event struct {
		Type    string            `json:"type"`
		Request PermissionRequest `json:"request"`
	}
	if err := e.DecodeEvent(&event); err != nil {
		return nil, err
	}
	if event.Type != "permission_requested" {
		return nil, fmt.Errorf("paseo: event type is %q, not permission_requested", event.Type)
	}
	if event.Request.ID == "" {
		return nil, fmt.Errorf("paseo: permission request ID is empty")
	}
	return &event.Request, nil
}

// PermissionResponse approves or denies an agent permission request.
type PermissionResponse struct {
	Behavior           string           `json:"behavior"`
	SelectedActionID   string           `json:"selectedActionId,omitempty"`
	UpdatedInput       map[string]any   `json:"updatedInput,omitempty"`
	UpdatedPermissions []map[string]any `json:"updatedPermissions,omitempty"`
	Message            string           `json:"message,omitempty"`
	Interrupt          bool             `json:"interrupt,omitempty"`
}

// AllowPermission creates a basic approval response.
func AllowPermission() PermissionResponse {
	return PermissionResponse{Behavior: "allow"}
}

// DenyPermission creates a basic denial response.
func DenyPermission(message string) PermissionResponse {
	return PermissionResponse{Behavior: "deny", Message: message}
}

// RPCError is returned when the daemon rejects a correlated request.
type RPCError struct {
	RequestID   string
	RequestType string
	Code        string
	Message     string
}

func (e *RPCError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("paseo: %s (%s)", e.Message, e.Code)
	}
	return "paseo: " + e.Message
}

// AgentCreateError describes a daemon-side create_agent_request failure.
type AgentCreateError struct {
	Code    string
	Message string
}

func (e *AgentCreateError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("paseo: create agent failed: %s (%s)", e.Message, e.Code)
	}
	return "paseo: create agent failed: " + e.Message
}
