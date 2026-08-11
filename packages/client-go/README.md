# Paseo Go client

Minimal Go SDK for Paseo's direct daemon WebSocket API.

> This package follows an unstable protocol. Keep the client and daemon versions
> close together. Relay E2EE, automatic reconnection, terminal binary frames,
> and the complete Paseo RPC surface are not implemented yet.

## Install

While this module lives in the Paseo repository:

```bash
go get github.com/getpaseo/paseo/packages/client-go
```

## Example

```go
package main

import (
	"context"
	"fmt"
	"log"

	paseo "github.com/getpaseo/paseo/packages/client-go"
)

func main() {
	ctx := context.Background()
	client, err := paseo.Dial(ctx, paseo.Options{
		URL:      "ws://127.0.0.1:6767/ws",
		ClientID: "my-go-client",
		// Password: "daemon-password",
	})
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	agent, err := client.CreateAgent(ctx, paseo.CreateAgentOptions{
		Config: paseo.AgentConfig{
			Provider:         "codex",
			CWD:              "/absolute/path/to/project",
			Model:            "gpt-5.4",
			ModeID:           "auto",
			ThinkingOptionID: "high",
		},
	})
	if err != nil {
		log.Fatal(err)
	}

	// Subscribe before sending the first message so no turn events are missed.
	subscription := client.SubscribeAgentStream(agent.ID)
	defer subscription.Close()

	if err := client.SendAgentMessage(ctx, agent.ID, "检查项目并运行测试"); err != nil {
		log.Fatal(err)
	}

	for {
		event, ok := <-subscription.Events
		if !ok {
			log.Fatal("agent stream closed before the turn finished")
		}
		fmt.Println(event.EventType(), string(event.Event))
		switch event.EventType() {
		case "turn_completed":
			if _, err := client.ArchiveAgent(ctx, agent.ID); err != nil {
				log.Fatal(err)
			}
			return
		case "turn_failed", "turn_canceled":
			log.Fatalf("turn ended with %s", event.EventType())
		}
	}
}
```

`SubscribeAgentStream` is a long-lived subscription. Its `Events` channel does
not close after one turn; stop reading when the desired terminal event arrives,
or call `subscription.Close()`.

## Query before create

Use a stable business session key as the agent title. Call `GetAgent` with that
title before creating an agent:

```go
agentTitle := "my-service:job-123"

agent, err := client.GetAgent(ctx, agentTitle)
if err != nil {
	log.Fatal(err)
}
if agent == nil {
	created, err := client.CreateAgent(ctx, paseo.CreateAgentOptions{
		Config: paseo.AgentConfig{
			Provider: "codex",
			CWD:      "/absolute/path/to/project",
			ModeID:   "auto",
			Title:    agentTitle,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
	agent = &created
}
```

`GetAgent` resolves a full ID, unique ID prefix, or exact title. It returns
`nil` when no agent exists. Because archived agents can also be resolved, check
`agent.ArchivedAt` before attempting to send another message.

The query-then-create sequence is not an atomic distributed lock. If several
service instances may create the same session concurrently, coordinate them
using your business key or another external lock.

## Archive after completion

Archive a completed session so it no longer appears in the active agent list:

```go
result, err := client.ArchiveAgent(ctx, agent.ID)
if err != nil {
	log.Fatal(err)
}
fmt.Println("archived at", result.ArchivedAt)
```

Archived sessions remain available through `GetAgent`.

## Supported API

- `Dial` / `NewClient` + `Connect`
- optional daemon password through `paseo.bearer.<password>`
- `ServerInfo`
- `CreateAgent`
- `GetAgent`
- `ListAgents`
- `ArchiveAgent`
- `SendAgentMessage`
- `SubscribeAgentStream`
- `RespondToPermission`
- `Close`
