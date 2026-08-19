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
GET    /jobs/{requestId}
DELETE /jobs/{requestId}
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
- A non-loopback `host` requires `authTokenEnv`.

Project overrides are stored outside the read-only installed plugin cache. Use the console instead
of editing the cached `.http.json`. A non-loopback host still requires `authTokenEnv`.
