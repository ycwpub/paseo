package paseo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

type testDaemon struct {
	server *httptest.Server
	url    string
	errs   chan error
}

func startTestDaemon(
	t *testing.T,
	password string,
	scenario func(*websocket.Conn) error,
) *testDaemon {
	t.Helper()
	errs := make(chan error, 1)
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	if password != "" {
		upgrader.Subprotocols = []string{"paseo.bearer." + password}
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if password != "" {
			if got := r.Header.Get("Authorization"); got != "Bearer "+password {
				errs <- fmt.Errorf("unexpected Authorization header %q", got)
				return
			}
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			errs <- err
			return
		}
		defer conn.Close()

		var hello map[string]any
		if err := conn.ReadJSON(&hello); err != nil {
			errs <- fmt.Errorf("read hello: %w", err)
			return
		}
		if hello["type"] != "hello" || hello["protocolVersion"] != float64(1) {
			errs <- fmt.Errorf("unexpected hello: %#v", hello)
			return
		}
		if err := writeSession(conn, "status", map[string]any{
			"status":   "server_info",
			"serverId": "server-test",
			"hostname": "test-host",
			"version":  "test-version",
			"features": map[string]bool{},
		}); err != nil {
			errs <- err
			return
		}
		if err := scenario(conn); err != nil {
			errs <- err
			return
		}
		errs <- nil
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	})
	server := httptest.NewServer(handler)
	return &testDaemon{
		server: server,
		url:    "ws" + strings.TrimPrefix(server.URL, "http"),
		errs:   errs,
	}
}

func (d *testDaemon) close(t *testing.T, client *Client) {
	t.Helper()
	if client != nil {
		_ = client.Close()
	}
	select {
	case err := <-d.errs:
		if err != nil {
			t.Errorf("test daemon: %v", err)
		}
	case <-time.After(time.Second):
		t.Error("test daemon scenario did not finish")
	}
	d.server.Close()
}

func readSessionRequest(conn *websocket.Conn) (map[string]any, error) {
	var envelope struct {
		Type    string         `json:"type"`
		Message map[string]any `json:"message"`
	}
	if err := conn.ReadJSON(&envelope); err != nil {
		return nil, err
	}
	if envelope.Type != "session" {
		return nil, fmt.Errorf("unexpected envelope type %q", envelope.Type)
	}
	return envelope.Message, nil
}

func writeSession(conn *websocket.Conn, messageType string, payload any) error {
	return conn.WriteJSON(map[string]any{
		"type": "session",
		"message": map[string]any{
			"type":    messageType,
			"payload": payload,
		},
	})
}

func TestConnectAndListAgentsFollowsPagination(t *testing.T) {
	daemon := startTestDaemon(t, "secret", func(conn *websocket.Conn) error {
		first, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		if first["type"] != "fetch_agents_request" {
			return fmt.Errorf("unexpected first request: %#v", first)
		}
		firstID, _ := first["requestId"].(string)
		if err := writeSession(conn, "fetch_agents_response", map[string]any{
			"requestId": firstID,
			"entries": []any{
				map[string]any{"agent": map[string]any{
					"id": "agent-1", "provider": "codex", "cwd": "/repo/one", "status": "running",
				}},
			},
			"pageInfo": map[string]any{
				"nextCursor": "page-2", "prevCursor": nil, "hasMore": true,
			},
		}); err != nil {
			return err
		}

		second, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		page, _ := second["page"].(map[string]any)
		if page["cursor"] != "page-2" {
			return fmt.Errorf("unexpected second page: %#v", page)
		}
		secondID, _ := second["requestId"].(string)
		return writeSession(conn, "fetch_agents_response", map[string]any{
			"requestId": secondID,
			"entries": []any{
				map[string]any{"agent": map[string]any{
					"id": "agent-2", "provider": "claude", "cwd": "/repo/two", "status": "idle",
				}},
			},
			"pageInfo": map[string]any{
				"nextCursor": nil, "prevCursor": "page-1", "hasMore": false,
			},
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-test",
		Password: "secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	if got := client.ServerInfo().ServerID; got != "server-test" {
		t.Fatalf("unexpected server ID %q", got)
	}
	agents, err := client.ListAgents(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(agents) != 2 || agents[0].ID != "agent-1" || agents[1].ID != "agent-2" {
		t.Fatalf("unexpected agents: %#v", agents)
	}
	if len(agents[0].Raw) == 0 {
		t.Fatal("expected raw agent payload")
	}
}

func TestGetAgent(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		getRequest, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		if getRequest["type"] != "fetch_agent_request" || getRequest["agentId"] != "agent-one" {
			return fmt.Errorf("unexpected fetch agent request: %#v", getRequest)
		}
		getRequestID, _ := getRequest["requestId"].(string)
		title := "External worker"
		return writeSession(conn, "fetch_agent_response", map[string]any{
			"requestId": getRequestID,
			"agent": map[string]any{
				"id":       "agent-one",
				"provider": "codex",
				"cwd":      "/repo",
				"status":   "idle",
				"title":    title,
			},
			"project": nil,
			"error":   nil,
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-get-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	agent, err := client.GetAgent(context.Background(), "agent-one")
	if err != nil {
		t.Fatal(err)
	}
	if agent == nil || agent.ID != "agent-one" {
		t.Fatalf("unexpected fetched agent: %#v", agent)
	}
}

func TestGetAgentReturnsNilWhenNotFound(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		requestID, _ := request["requestId"].(string)
		return writeSession(conn, "fetch_agent_response", map[string]any{
			"requestId": requestID,
			"agent":     nil,
			"project":   nil,
			"error":     "Agent not found: missing-agent",
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-get-missing-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	agent, err := client.GetAgent(context.Background(), "missing-agent")
	if err != nil {
		t.Fatal(err)
	}
	if agent != nil {
		t.Fatalf("expected no agent, got %#v", agent)
	}
}

func TestCreateAgent(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		if request["type"] != "create_agent_request" {
			return fmt.Errorf("unexpected create request: %#v", request)
		}
		config, _ := request["config"].(map[string]any)
		if config["provider"] != "codex" ||
			config["cwd"] != "/repo" ||
			config["model"] != "gpt-5.4" ||
			config["modeId"] != "auto" ||
			config["thinkingOptionId"] != "high" ||
			config["approvalPolicy"] != "on-request" ||
			config["sandboxMode"] != "workspace-write" {
			return fmt.Errorf("unexpected agent config: %#v", config)
		}
		requestID, _ := request["requestId"].(string)
		return writeSession(conn, "status", map[string]any{
			"status":    "agent_created",
			"requestId": requestID,
			"agentId":   "agent-created",
			"agent": map[string]any{
				"id":       "agent-created",
				"provider": "codex",
				"cwd":      "/repo",
				"status":   "idle",
			},
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-create-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	networkAccess := true
	agent, err := client.CreateAgent(context.Background(), CreateAgentOptions{
		Config: AgentConfig{
			Provider:         "codex",
			CWD:              "/repo",
			Model:            "gpt-5.4",
			ModeID:           "auto",
			ThinkingOptionID: "high",
			ApprovalPolicy:   "on-request",
			SandboxMode:      "workspace-write",
			NetworkAccess:    &networkAccess,
		},
		Labels: map[string]string{"source": "go-sdk"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if agent.ID != "agent-created" || agent.Provider != "codex" || agent.CWD != "/repo" {
		t.Fatalf("unexpected created agent: %#v", agent)
	}
}

func TestCreateAgentFailure(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		requestID, _ := request["requestId"].(string)
		return writeSession(conn, "status", map[string]any{
			"status":    "agent_create_failed",
			"requestId": requestID,
			"error":     "provider unavailable",
			"errorCode": "provider_unavailable",
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-create-failure-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	_, err = client.CreateAgent(context.Background(), CreateAgentOptions{
		Config: AgentConfig{Provider: "codex", CWD: "/repo", ModeID: "auto"},
	})
	var createErr *AgentCreateError
	if !errors.As(err, &createErr) {
		t.Fatalf("expected AgentCreateError, got %v", err)
	}
	if createErr.Code != "provider_unavailable" {
		t.Fatalf("unexpected create error: %#v", createErr)
	}
}

func TestArchiveAgent(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		if request["type"] != "archive_agent_request" || request["agentId"] != "agent-1" {
			return fmt.Errorf("unexpected archive request: %#v", request)
		}
		requestID, _ := request["requestId"].(string)
		return writeSession(conn, "agent_archived", map[string]any{
			"requestId":  requestID,
			"agentId":    "agent-1",
			"archivedAt": "2026-08-09T12:00:00Z",
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-archive-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	result, err := client.ArchiveAgent(context.Background(), "agent-1")
	if err != nil {
		t.Fatal(err)
	}
	if result.AgentID != "agent-1" || result.ArchivedAt != "2026-08-09T12:00:00Z" {
		t.Fatalf("unexpected archive result: %#v", result)
	}
}

func TestSendAgentMessageAndSubscribeAgentStream(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		if request["type"] != "send_agent_message_request" ||
			request["agentId"] != "agent-1" ||
			request["text"] != "run tests" {
			return fmt.Errorf("unexpected send request: %#v", request)
		}
		if err := writeSession(conn, "agent_stream", map[string]any{
			"agentId": "agent-2",
			"event": map[string]any{
				"type": "turn_started", "provider": "codex",
			},
			"timestamp": "2026-08-04T00:00:00Z",
		}); err != nil {
			return err
		}
		if err := writeSession(conn, "agent_stream", map[string]any{
			"agentId": "agent-1",
			"event": map[string]any{
				"type":     "timeline",
				"provider": "codex",
				"item":     map[string]any{"type": "assistant_message", "text": "done"},
			},
			"timestamp": "2026-08-04T00:00:01Z",
			"seq":       7,
		}); err != nil {
			return err
		}
		requestID, _ := request["requestId"].(string)
		return writeSession(conn, "send_agent_message_response", map[string]any{
			"requestId": requestID,
			"agentId":   "agent-1",
			"accepted":  true,
			"error":     nil,
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-stream-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	subscription := client.SubscribeAgentStream("agent-1")
	defer subscription.Close()
	if err := client.SendAgentMessage(context.Background(), "agent-1", "run tests"); err != nil {
		t.Fatal(err)
	}

	select {
	case event := <-subscription.Events:
		if event.AgentID != "agent-1" || event.EventType() != "timeline" {
			t.Fatalf("unexpected event: %#v", event)
		}
		if event.Seq == nil || *event.Seq != 7 {
			t.Fatalf("unexpected sequence: %#v", event.Seq)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for agent stream event")
	}
}

func TestRespondToPermission(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		if request["type"] != "agent_permission_response" ||
			request["agentId"] != "agent-1" ||
			request["requestId"] != "permission-1" {
			return fmt.Errorf("unexpected permission response: %#v", request)
		}
		response, _ := request["response"].(map[string]any)
		if response["behavior"] != "allow" || response["selectedActionId"] != "approve-once" {
			return fmt.Errorf("unexpected permission payload: %#v", response)
		}
		return writeSession(conn, "agent_permission_resolved", map[string]any{
			"agentId":   "agent-1",
			"requestId": "permission-1",
			"resolution": map[string]any{
				"behavior":         "allow",
				"selectedActionId": "approve-once",
			},
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-permission-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	response := AllowPermission()
	response.SelectedActionID = "approve-once"
	if err := client.RespondToPermission(
		context.Background(),
		"agent-1",
		"permission-1",
		response,
	); err != nil {
		t.Fatal(err)
	}
}

func TestRPCErrorIsReturned(t *testing.T) {
	daemon := startTestDaemon(t, "", func(conn *websocket.Conn) error {
		request, err := readSessionRequest(conn)
		if err != nil {
			return err
		}
		requestID, _ := request["requestId"].(string)
		return writeSession(conn, "rpc_error", map[string]any{
			"requestId":   requestID,
			"requestType": "fetch_agents_request",
			"error":       "not allowed",
			"code":        "access_denied",
		})
	})

	client, err := Dial(context.Background(), Options{
		URL:      daemon.url,
		ClientID: "go-sdk-error-test",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer daemon.close(t, client)

	_, err = client.ListAgents(context.Background())
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected RPCError, got %v", err)
	}
	if rpcErr.Code != "access_denied" || rpcErr.RequestType != "fetch_agents_request" {
		t.Fatalf("unexpected RPC error: %#v", rpcErr)
	}
}

func TestEventDecode(t *testing.T) {
	event := AgentStreamEvent{Event: json.RawMessage(`{"type":"turn_failed","error":"boom"}`)}
	var decoded struct {
		Type  string `json:"type"`
		Error string `json:"error"`
	}
	if err := event.DecodeEvent(&decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Type != "turn_failed" || decoded.Error != "boom" {
		t.Fatalf("unexpected decoded event: %#v", decoded)
	}
}

func TestPermissionRequestDecode(t *testing.T) {
	event := AgentStreamEvent{Event: json.RawMessage(`{
		"type":"permission_requested",
		"request":{
			"id":"permission-1",
			"provider":"codex",
			"name":"shell",
			"kind":"tool",
			"title":"Run tests",
			"input":{"command":"go test ./..."},
			"actions":[{"id":"approve-once","label":"Allow","behavior":"allow"}]
		}
	}`)}
	request, err := event.PermissionRequest()
	if err != nil {
		t.Fatal(err)
	}
	if request.ID != "permission-1" ||
		request.Input["command"] != "go test ./..." ||
		len(request.Actions) != 1 {
		t.Fatalf("unexpected permission request: %#v", request)
	}
}
