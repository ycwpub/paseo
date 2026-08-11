package paseo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

const (
	defaultURL              = "ws://127.0.0.1:6767/ws"
	defaultHandshakeTimeout = 15 * time.Second
	defaultRequestTimeout   = 60 * time.Second
	defaultStreamBuffer     = 64
	protocolVersion         = 1
)

// ErrClosed indicates that the client connection is closed.
var ErrClosed = errors.New("paseo: client is closed")

// Options configures a Client.
type Options struct {
	URL              string
	ClientID         string
	ClientName       string
	ClientHostname   string
	AppVersion       string
	Password         string
	HandshakeTimeout time.Duration
	RequestTimeout   time.Duration
	Dialer           *websocket.Dialer
}

// Client is a direct WebSocket client for one Paseo daemon.
//
// A Client is safe for concurrent use. It is a one-connection object and does
// not automatically reconnect.
type Client struct {
	options Options

	stateMu   sync.RWMutex
	conn      *websocket.Conn
	started   bool
	connected bool
	server    ServerInfo
	readErr   error

	writeMu sync.Mutex

	pendingMu sync.Mutex
	pending   map[string]chan rpcResult

	subMu         sync.Mutex
	subscriptions map[uint64]*AgentStreamSubscription
	nextSubID     atomic.Uint64

	nextRequestID atomic.Uint64
	handshake     chan error
	handshakeOnce sync.Once
	done          chan struct{}
	finishOnce    sync.Once
}

type rpcResult struct {
	message sessionMessage
	err     error
}

type sessionMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type wsEnvelope struct {
	Type    string          `json:"type"`
	Message json.RawMessage `json:"message,omitempty"`
}

// NewClient creates a disconnected client.
func NewClient(options Options) *Client {
	if options.URL == "" {
		options.URL = defaultURL
	}
	if options.ClientID == "" {
		options.ClientID = fmt.Sprintf("go-client-%d", time.Now().UnixNano())
	}
	if options.HandshakeTimeout <= 0 {
		options.HandshakeTimeout = defaultHandshakeTimeout
	}
	if options.RequestTimeout <= 0 {
		options.RequestTimeout = defaultRequestTimeout
	}
	return &Client{
		options:       options,
		pending:       make(map[string]chan rpcResult),
		subscriptions: make(map[uint64]*AgentStreamSubscription),
		handshake:     make(chan error, 1),
		done:          make(chan struct{}),
	}
}

// Dial creates a client and connects it.
func Dial(ctx context.Context, options Options) (*Client, error) {
	client := NewClient(options)
	if err := client.Connect(ctx); err != nil {
		return nil, err
	}
	return client, nil
}

// Connect establishes the WebSocket connection and completes the Paseo hello handshake.
func (c *Client) Connect(ctx context.Context) error {
	c.stateMu.Lock()
	if c.connected {
		c.stateMu.Unlock()
		return nil
	}
	if c.readErr != nil {
		err := c.readErr
		c.stateMu.Unlock()
		return err
	}
	if c.started {
		c.stateMu.Unlock()
		return errors.New("paseo: connection attempt already started")
	}
	c.started = true
	c.stateMu.Unlock()

	dialer := c.options.Dialer
	if dialer == nil {
		cloned := *websocket.DefaultDialer
		dialer = &cloned
	}
	if c.options.Password != "" {
		cloned := *dialer
		cloned.Subprotocols = append(
			append([]string(nil), dialer.Subprotocols...),
			"paseo.bearer."+c.options.Password,
		)
		dialer = &cloned
	}

	headers := http.Header{}
	if c.options.Password != "" {
		headers.Set("Authorization", "Bearer "+c.options.Password)
	}
	conn, response, err := dialer.DialContext(ctx, c.options.URL, headers)
	if err != nil {
		connectErr := fmt.Errorf("paseo: websocket dial failed: %w", err)
		if response != nil {
			connectErr = fmt.Errorf(
				"paseo: websocket dial failed with HTTP %s: %w",
				response.Status,
				err,
			)
		}
		c.finish(connectErr)
		return connectErr
	}

	c.stateMu.Lock()
	c.conn = conn
	c.stateMu.Unlock()

	go c.readLoop()

	hello := map[string]any{
		"type":            "hello",
		"clientId":        c.options.ClientID,
		"clientType":      "cli",
		"protocolVersion": protocolVersion,
		"capabilities": map[string]bool{
			"project_updates": true,
		},
	}
	if c.options.ClientName != "" {
		hello["clientName"] = c.options.ClientName
	}
	if c.options.ClientHostname != "" {
		hello["clientHostname"] = c.options.ClientHostname
	}
	if c.options.AppVersion != "" {
		hello["appVersion"] = c.options.AppVersion
	}
	if err := c.writeJSON(hello); err != nil {
		c.finish(err)
		return err
	}

	timer := time.NewTimer(c.options.HandshakeTimeout)
	defer timer.Stop()
	select {
	case err := <-c.handshake:
		if err != nil {
			c.finish(err)
			return err
		}
		c.stateMu.Lock()
		if c.readErr != nil {
			err = c.readErr
			c.stateMu.Unlock()
			return err
		}
		c.connected = true
		c.stateMu.Unlock()
		return nil
	case <-ctx.Done():
		c.finish(ctx.Err())
		return ctx.Err()
	case <-timer.C:
		err := errors.New("paseo: hello handshake timed out")
		c.finish(err)
		return err
	case <-c.done:
		return c.connectionError()
	}
}

// ServerInfo returns the daemon information received during the hello handshake.
func (c *Client) ServerInfo() ServerInfo {
	c.stateMu.RLock()
	defer c.stateMu.RUnlock()
	return c.server
}

// CreateAgent creates a new agent and waits for agent_created or
// agent_create_failed.
//
// To avoid missing events from the first turn, create the agent without
// InitialPrompt, subscribe with the returned agent ID, then call
// SendAgentMessage.
func (c *Client) CreateAgent(ctx context.Context, options CreateAgentOptions) (Agent, error) {
	if strings.TrimSpace(options.Config.Provider) == "" {
		return Agent{}, errors.New("paseo: provider is required")
	}
	if strings.TrimSpace(options.Config.CWD) == "" {
		return Agent{}, errors.New("paseo: agent working directory is required")
	}

	requestID := c.newRequestID()
	request := struct {
		Type      string `json:"type"`
		RequestID string `json:"requestId"`
		CreateAgentOptions
	}{
		Type:               "create_agent_request",
		RequestID:          requestID,
		CreateAgentOptions: options,
	}
	message, err := c.request(ctx, requestID, "status", request)
	if err != nil {
		return Agent{}, err
	}
	var payload struct {
		Status    string `json:"status"`
		AgentID   string `json:"agentId"`
		Agent     Agent  `json:"agent"`
		Error     string `json:"error"`
		ErrorCode string `json:"errorCode"`
	}
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		return Agent{}, fmt.Errorf("paseo: decode create agent status: %w", err)
	}
	switch payload.Status {
	case "agent_created":
		if payload.Agent.ID == "" {
			payload.Agent.ID = payload.AgentID
		}
		if payload.Agent.ID == "" {
			return Agent{}, errors.New("paseo: daemon returned an empty created agent ID")
		}
		return payload.Agent, nil
	case "agent_create_failed":
		return Agent{}, &AgentCreateError{
			Code:    payload.ErrorCode,
			Message: payload.Error,
		}
	default:
		return Agent{}, fmt.Errorf("paseo: unexpected create agent status %q", payload.Status)
	}
}

// GetAgent fetches one agent by full ID, unique ID prefix, or exact title.
// It returns nil when no agent matches.
func (c *Client) GetAgent(ctx context.Context, idOrTitle string) (*Agent, error) {
	if strings.TrimSpace(idOrTitle) == "" {
		return nil, errors.New("paseo: agent ID or title is required")
	}
	requestID := c.newRequestID()
	request := map[string]any{
		"type":      "fetch_agent_request",
		"requestId": requestID,
		"agentId":   idOrTitle,
	}
	message, err := c.request(ctx, requestID, "fetch_agent_response", request)
	if err != nil {
		return nil, err
	}
	var payload struct {
		Agent *Agent  `json:"agent"`
		Error *string `json:"error"`
	}
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		return nil, fmt.Errorf("paseo: decode fetch_agent_response: %w", err)
	}
	if payload.Error != nil && *payload.Error != "" {
		if strings.HasPrefix(*payload.Error, "Agent not found:") {
			return nil, nil
		}
		return nil, errors.New("paseo: " + *payload.Error)
	}
	return payload.Agent, nil
}

// ListAgents returns all active agents, following daemon pagination.
func (c *Client) ListAgents(ctx context.Context) ([]Agent, error) {
	var agents []Agent
	var cursor string
	seenCursors := make(map[string]struct{})

	for {
		requestID := c.newRequestID()
		page := map[string]any{"limit": 200}
		if cursor != "" {
			page["cursor"] = cursor
		}
		request := map[string]any{
			"type":      "fetch_agents_request",
			"requestId": requestID,
			"scope":     "active",
			"page":      page,
		}
		message, err := c.request(ctx, requestID, "fetch_agents_response", request)
		if err != nil {
			return nil, err
		}
		var payload struct {
			Entries []struct {
				Agent Agent `json:"agent"`
			} `json:"entries"`
			PageInfo struct {
				NextCursor *string `json:"nextCursor"`
				HasMore    bool    `json:"hasMore"`
			} `json:"pageInfo"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return nil, fmt.Errorf("paseo: decode fetch_agents_response: %w", err)
		}
		for _, entry := range payload.Entries {
			agents = append(agents, entry.Agent)
		}
		if !payload.PageInfo.HasMore || payload.PageInfo.NextCursor == nil {
			return agents, nil
		}
		cursor = *payload.PageInfo.NextCursor
		if cursor == "" {
			return nil, errors.New("paseo: daemon returned an empty agent pagination cursor")
		}
		if _, exists := seenCursors[cursor]; exists {
			return nil, errors.New("paseo: daemon repeated an agent pagination cursor")
		}
		seenCursors[cursor] = struct{}{}
	}
}

// ArchiveAgent archives an agent and waits for the daemon acknowledgement.
func (c *Client) ArchiveAgent(ctx context.Context, agentID string) (ArchiveAgentResult, error) {
	if strings.TrimSpace(agentID) == "" {
		return ArchiveAgentResult{}, errors.New("paseo: agent ID is required")
	}
	requestID := c.newRequestID()
	request := map[string]any{
		"type":      "archive_agent_request",
		"requestId": requestID,
		"agentId":   agentID,
	}
	message, err := c.request(ctx, requestID, "agent_archived", request)
	if err != nil {
		return ArchiveAgentResult{}, err
	}
	var payload struct {
		AgentID    string `json:"agentId"`
		ArchivedAt string `json:"archivedAt"`
	}
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		return ArchiveAgentResult{}, fmt.Errorf("paseo: decode agent_archived: %w", err)
	}
	if payload.AgentID != agentID {
		return ArchiveAgentResult{}, errors.New("paseo: archive response did not match the agent")
	}
	return ArchiveAgentResult{
		AgentID:    payload.AgentID,
		ArchivedAt: payload.ArchivedAt,
	}, nil
}

// SendAgentMessage submits text to an existing agent and waits until the daemon accepts it.
func (c *Client) SendAgentMessage(ctx context.Context, agentID, text string) error {
	if strings.TrimSpace(agentID) == "" {
		return errors.New("paseo: agent ID is required")
	}
	requestID := c.newRequestID()
	request := map[string]any{
		"type":      "send_agent_message_request",
		"requestId": requestID,
		"messageId": c.newRequestID(),
		"agentId":   agentID,
		"text":      text,
	}
	message, err := c.request(ctx, requestID, "send_agent_message_response", request)
	if err != nil {
		return err
	}
	var payload struct {
		Accepted bool    `json:"accepted"`
		Error    *string `json:"error"`
	}
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		return fmt.Errorf("paseo: decode send_agent_message_response: %w", err)
	}
	if !payload.Accepted {
		if payload.Error != nil && *payload.Error != "" {
			return errors.New("paseo: " + *payload.Error)
		}
		return errors.New("paseo: agent message was rejected")
	}
	return nil
}

// RespondToPermission resolves a permission_requested event and waits for the
// matching agent_permission_resolved acknowledgement.
func (c *Client) RespondToPermission(
	ctx context.Context,
	agentID string,
	permissionRequestID string,
	response PermissionResponse,
) error {
	if strings.TrimSpace(agentID) == "" {
		return errors.New("paseo: agent ID is required")
	}
	if strings.TrimSpace(permissionRequestID) == "" {
		return errors.New("paseo: permission request ID is required")
	}
	if response.Behavior != "allow" && response.Behavior != "deny" {
		return errors.New(`paseo: permission behavior must be "allow" or "deny"`)
	}
	request := map[string]any{
		"type":      "agent_permission_response",
		"agentId":   agentID,
		"requestId": permissionRequestID,
		"response":  response,
	}
	message, err := c.request(
		ctx,
		permissionRequestID,
		"agent_permission_resolved",
		request,
	)
	if err != nil {
		return err
	}
	var payload struct {
		AgentID   string `json:"agentId"`
		RequestID string `json:"requestId"`
	}
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		return fmt.Errorf("paseo: decode agent_permission_resolved: %w", err)
	}
	if payload.AgentID != agentID || payload.RequestID != permissionRequestID {
		return errors.New("paseo: permission resolution did not match the request")
	}
	return nil
}

// SubscribeAgentStream subscribes locally to agent_stream messages for agentID.
//
// The minimal client uses the daemon's legacy global stream and filters events
// client-side. Slow consumers may lose events after the subscription buffer fills.
func (c *Client) SubscribeAgentStream(agentID string) *AgentStreamSubscription {
	id := c.nextSubID.Add(1)
	ch := make(chan AgentStreamEvent, defaultStreamBuffer)
	subscription := &AgentStreamSubscription{
		client:  c,
		id:      id,
		agentID: agentID,
		events:  ch,
		Events:  ch,
	}
	c.subMu.Lock()
	select {
	case <-c.done:
		subscription.once.Do(func() {
			close(ch)
		})
	default:
		c.subscriptions[id] = subscription
	}
	c.subMu.Unlock()
	return subscription
}

// Close closes the WebSocket connection and all stream subscriptions.
func (c *Client) Close() error {
	c.stateMu.RLock()
	conn := c.conn
	c.stateMu.RUnlock()
	if conn != nil {
		c.writeMu.Lock()
		_ = conn.WriteControl(
			websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "client closed"),
			time.Now().Add(time.Second),
		)
		c.writeMu.Unlock()
	}
	c.finish(ErrClosed)
	return nil
}

func (c *Client) request(
	ctx context.Context,
	requestID string,
	expectedType string,
	request any,
) (sessionMessage, error) {
	if err := c.ensureConnected(); err != nil {
		return sessionMessage{}, err
	}
	results := make(chan rpcResult, 1)
	c.pendingMu.Lock()
	c.pending[requestID] = results
	c.pendingMu.Unlock()
	defer func() {
		c.pendingMu.Lock()
		delete(c.pending, requestID)
		c.pendingMu.Unlock()
	}()

	if err := c.writeJSON(map[string]any{"type": "session", "message": request}); err != nil {
		return sessionMessage{}, err
	}

	timer := time.NewTimer(c.options.RequestTimeout)
	defer timer.Stop()
	for {
		select {
		case result := <-results:
			if result.err != nil {
				return sessionMessage{}, result.err
			}
			if result.message.Type != expectedType {
				continue
			}
			return result.message, nil
		case <-ctx.Done():
			return sessionMessage{}, ctx.Err()
		case <-timer.C:
			return sessionMessage{}, fmt.Errorf("paseo: request %s timed out", requestID)
		case <-c.done:
			return sessionMessage{}, c.connectionError()
		}
	}
}

func (c *Client) readLoop() {
	for {
		c.stateMu.RLock()
		conn := c.conn
		c.stateMu.RUnlock()
		if conn == nil {
			c.finish(ErrClosed)
			return
		}
		messageType, data, err := conn.ReadMessage()
		if err != nil {
			c.finish(fmt.Errorf("paseo: websocket read failed: %w", err))
			return
		}
		if messageType != websocket.TextMessage {
			continue
		}
		if err := c.handleTextMessage(data); err != nil {
			c.finish(err)
			return
		}
	}
}

func (c *Client) handleTextMessage(data []byte) error {
	var envelope wsEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return fmt.Errorf("paseo: decode websocket message: %w", err)
	}
	switch envelope.Type {
	case "connection.approval_required":
		var approval struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(data, &approval)
		if approval.Message == "" {
			approval.Message = "client approval is required"
		}
		err := errors.New("paseo: " + approval.Message)
		c.signalHandshake(err)
		return nil
	case "pong", "transport.direct_offer":
		return nil
	case "session":
		return c.handleSessionMessage(envelope.Message)
	default:
		return nil
	}
}

func (c *Client) handleSessionMessage(data []byte) error {
	var message sessionMessage
	if err := json.Unmarshal(data, &message); err != nil {
		return fmt.Errorf("paseo: decode session message: %w", err)
	}
	if message.Type == "status" {
		var status struct {
			Status string `json:"status"`
		}
		if json.Unmarshal(message.Payload, &status) == nil && status.Status == "server_info" {
			var info ServerInfo
			if err := json.Unmarshal(message.Payload, &info); err != nil {
				return fmt.Errorf("paseo: decode server_info: %w", err)
			}
			c.stateMu.Lock()
			c.server = info
			c.stateMu.Unlock()
			c.signalHandshake(nil)
		}
	}
	if message.Type == "agent_stream" {
		var event AgentStreamEvent
		if err := json.Unmarshal(message.Payload, &event); err != nil {
			return fmt.Errorf("paseo: decode agent_stream: %w", err)
		}
		c.dispatchAgentStream(event)
	}

	requestID := requestIDFromPayload(message.Payload)
	if requestID == "" {
		return nil
	}
	if message.Type == "rpc_error" {
		var payload struct {
			RequestID   string `json:"requestId"`
			RequestType string `json:"requestType"`
			Code        string `json:"code"`
			Error       string `json:"error"`
		}
		if err := json.Unmarshal(message.Payload, &payload); err != nil {
			return fmt.Errorf("paseo: decode rpc_error: %w", err)
		}
		c.deliverRPCResult(requestID, rpcResult{err: &RPCError{
			RequestID:   payload.RequestID,
			RequestType: payload.RequestType,
			Code:        payload.Code,
			Message:     payload.Error,
		}})
		return nil
	}
	c.deliverRPCResult(requestID, rpcResult{message: message})
	return nil
}

func (c *Client) deliverRPCResult(requestID string, result rpcResult) {
	c.pendingMu.Lock()
	ch := c.pending[requestID]
	c.pendingMu.Unlock()
	if ch == nil {
		return
	}
	select {
	case ch <- result:
	default:
	}
}

func (c *Client) dispatchAgentStream(event AgentStreamEvent) {
	c.subMu.Lock()
	defer c.subMu.Unlock()
	for _, subscription := range c.subscriptions {
		if subscription.agentID != "" && subscription.agentID != event.AgentID {
			continue
		}
		select {
		case subscription.events <- event:
		default:
		}
	}
}

func (c *Client) writeJSON(value any) error {
	c.stateMu.RLock()
	conn := c.conn
	c.stateMu.RUnlock()
	if conn == nil {
		return ErrClosed
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	if err := conn.WriteJSON(value); err != nil {
		return fmt.Errorf("paseo: websocket write failed: %w", err)
	}
	return nil
}

func (c *Client) ensureConnected() error {
	c.stateMu.RLock()
	connected := c.connected
	err := c.readErr
	c.stateMu.RUnlock()
	if connected {
		return nil
	}
	if err != nil {
		return err
	}
	return errors.New("paseo: client is not connected")
}

func (c *Client) newRequestID() string {
	return fmt.Sprintf("go-%d-%d", time.Now().UnixMilli(), c.nextRequestID.Add(1))
}

func (c *Client) signalHandshake(err error) {
	c.handshakeOnce.Do(func() {
		c.handshake <- err
	})
}

func (c *Client) connectionError() error {
	c.stateMu.RLock()
	defer c.stateMu.RUnlock()
	if c.readErr != nil {
		return c.readErr
	}
	return ErrClosed
}

func (c *Client) finish(err error) {
	c.finishOnce.Do(func() {
		c.stateMu.Lock()
		c.connected = false
		c.readErr = err
		conn := c.conn
		c.stateMu.Unlock()
		c.signalHandshake(err)
		close(c.done)
		if conn != nil {
			_ = conn.Close()
		}
		c.closeSubscriptions()
	})
}

func (c *Client) closeSubscriptions() {
	c.subMu.Lock()
	subscriptions := make([]*AgentStreamSubscription, 0, len(c.subscriptions))
	for id, subscription := range c.subscriptions {
		delete(c.subscriptions, id)
		subscriptions = append(subscriptions, subscription)
	}
	c.subMu.Unlock()
	for _, subscription := range subscriptions {
		subscription.once.Do(func() {
			close(subscription.events)
		})
	}
}

func (c *Client) removeSubscription(subscription *AgentStreamSubscription) {
	c.subMu.Lock()
	if c.subscriptions[subscription.id] == subscription {
		delete(c.subscriptions, subscription.id)
	}
	c.subMu.Unlock()
}

func requestIDFromPayload(payload json.RawMessage) string {
	var correlated struct {
		RequestID string `json:"requestId"`
	}
	if json.Unmarshal(payload, &correlated) != nil {
		return ""
	}
	return correlated.RequestID
}

// AgentStreamSubscription owns a filtered agent stream event channel.
type AgentStreamSubscription struct {
	client  *Client
	id      uint64
	agentID string
	events  chan AgentStreamEvent
	once    sync.Once

	// Events is closed when the subscription or client is closed.
	Events <-chan AgentStreamEvent
}

// Close removes the subscription and closes Events.
func (s *AgentStreamSubscription) Close() {
	if s == nil || s.client == nil {
		return
	}
	s.once.Do(func() {
		s.client.removeSubscription(s)
		close(s.events)
	})
}
