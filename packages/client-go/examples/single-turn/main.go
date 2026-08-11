// Command single-turn sends one message and exits when that agent turn finishes.
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	paseo "github.com/getpaseo/paseo/packages/client-go"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	client, err := paseo.Dial(ctx, paseo.Options{
		URL:      envOr("PASEO_WS_URL", "ws://127.0.0.1:6767/ws"),
		ClientID: "go-single-turn-example",
		Password: os.Getenv("PASEO_PASSWORD"),
	})
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	agent, err := resolveAgent(ctx, client)
	if err != nil {
		log.Fatal(err)
	}

	// Subscribe before sending so early stream events are not missed.
	subscription := client.SubscribeAgentStream(agent.ID)
	defer subscription.Close()

	if err := client.SendAgentMessage(ctx, agent.ID, "检查当前项目并简要汇报状态"); err != nil {
		log.Fatal(err)
	}

	for {
		select {
		case event, ok := <-subscription.Events:
			if !ok {
				log.Fatal("agent stream closed before the turn finished")
			}
			fmt.Printf("%s: %s\n", event.EventType(), event.Event)
			switch event.EventType() {
			case "turn_completed":
				fmt.Println("turn completed")
				archiveAgent(ctx, client, agent.ID)
				return
			case "turn_failed", "turn_canceled":
				log.Fatalf("turn ended with %s", event.EventType())
			case "permission_requested":
				log.Fatal("turn needs approval; use the permission example")
			}
		case <-ctx.Done():
			log.Fatal(ctx.Err())
		}
	}
}

func resolveAgent(ctx context.Context, client *paseo.Client) (*paseo.Agent, error) {
	if agentID := os.Getenv("PASEO_AGENT_ID"); agentID != "" {
		agent, err := client.GetAgent(ctx, agentID)
		if err != nil {
			return nil, err
		}
		if agent == nil {
			return nil, fmt.Errorf("agent %q was not found", agentID)
		}
		fmt.Printf("reusing agent %s\n", agent.ID)
		return agent, nil
	}
	cwd := os.Getenv("PASEO_CWD")
	if cwd == "" {
		return nil, fmt.Errorf("set PASEO_AGENT_ID or PASEO_CWD")
	}
	provider := envOr("PASEO_PROVIDER", "codex")
	sessionKey := envOr("PASEO_SESSION_KEY", "go-single-turn-example")
	agentTitle := "go-single-turn:" + sessionKey
	labels := map[string]string{"externalSessionId": sessionKey, "example": "single-turn"}
	existing, err := client.GetAgent(ctx, agentTitle)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if existing.ArchivedAt != nil {
			return nil, fmt.Errorf("session %q is already archived", sessionKey)
		}
		if existing.CWD != cwd || existing.Provider != provider {
			return nil, fmt.Errorf("session %q exists with different cwd or provider", sessionKey)
		}
		fmt.Printf("reusing agent %s\n", existing.ID)
		return existing, nil
	}
	agent, err := client.CreateAgent(ctx, paseo.CreateAgentOptions{
		Config: paseo.AgentConfig{
			Provider:         provider,
			CWD:              cwd,
			Model:            os.Getenv("PASEO_MODEL"),
			ModeID:           envOr("PASEO_MODE", "auto"),
			ThinkingOptionID: os.Getenv("PASEO_THINKING"),
			Title:            agentTitle,
		},
		Labels: labels,
	})
	if err != nil {
		return nil, err
	}
	fmt.Printf("created agent %s\n", agent.ID)
	return &agent, nil
}

func archiveAgent(ctx context.Context, client *paseo.Client, agentID string) {
	if os.Getenv("PASEO_KEEP_AGENT") == "true" {
		return
	}
	result, err := client.ArchiveAgent(ctx, agentID)
	if err != nil {
		log.Printf("archive agent: %v", err)
		return
	}
	fmt.Printf("archived agent %s at %s\n", result.AgentID, result.ArchivedAt)
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
