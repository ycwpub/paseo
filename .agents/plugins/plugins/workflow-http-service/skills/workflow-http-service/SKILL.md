---
name: workflow-http-service
description: Configure, inspect, and use Paseo workflow-backed asynchronous HTTP services.
---

# Paseo Workflow HTTP Service

Use this skill when the user wants to expose a Paseo Workflow through HTTP.

## Package configuration

The plugin's `.http.json` defines each service:

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

Install the plugin and read its HTTP service URL from **Host Settings → Plugins**. Submit a JSON
object with `POST`. Paseo returns a processing ID and status URL with HTTP 202. Query the status URL
until the job reaches a terminal state.

To create a business service, copy this plugin, change its name, port, path, and Workflow, then
install the copied directory as a local plugin.
