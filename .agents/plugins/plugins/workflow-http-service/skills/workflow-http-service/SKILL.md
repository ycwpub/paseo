---
name: workflow-http-service
description: Configure, inspect, and use Paseo workflow-backed asynchronous HTTP services.
---

# Paseo Workflow HTTP Service

Use this skill when the user wants to expose a Paseo Workflow through HTTP.

## Project management console

Install the plugin, open **HTTP 服务控制台**, then select an existing Project or create a new
Project with a user-defined name. The console supports:

- multiple listener ports with independent enable/disable switches;
- multiple POST paths per port, each with a Workflow file and optional target node ID;
- JSON request mappings using `{{request}}` and `{{request.xxx}}`;
- JSON response mappings using `{{job.id}}`, `{{job.status}}`, and `{{result}}`;
- standard submit, query, and delete endpoints;
- persisted request inspection, batch deletion, and retention cleanup by age and terminal status.

The standard API defaults to:

```text
POST   /jobs
GET    /jobs?request_id={requestId}
DELETE /jobs?request_id={requestId}
```

Submitting a JSON object persists a `queued` request before asynchronously starting the Workflow.
The state then becomes `running` and finally `succeeded`, `failed`, `cancelled`, or `timed_out`.
Queued and running requests cannot be deleted.

## Package defaults

The plugin's `.http.json` defines the initial service used before a Project override is saved:

```json
{
  "services": {
    "processor": {
      "host": "127.0.0.1",
      "port": 0,
      "path": "/process",
      "workflow": "./workflows/process-request.json"
    }
  }
}
```

- `port: 0` lets Paseo allocate a free local port.
- `path` is the request submission path.
- `workflow` points to the processing Workflow.
- `host` must be a concrete IPv4 address owned by the daemon Host.
- Use the management console's address list; wildcard, hostname, and external addresses are
  rejected.

Project overrides are stored outside the read-only installed plugin cache. Use the console instead
of editing the cached `.http.json`. The console can send a test request through the daemon to any
saved and running listener endpoint without exposing an arbitrary URL to the client.
