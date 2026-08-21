---
name: agent-web-app
description: Generate and revise safe declarative Paseo plugin interfaces that call installed HTTP service plugins.
---

# Paseo Agent Web App

Use this skill when the user wants to create an interface through conversation.

Install and enable the **网页应用生成器** plugin, then select **Open app: web-app-builder** under
**Host Settings → Plugins**. First select an existing Project or create a new Project with a
user-defined name, then describe the desired fields, actions, status, and result presentation.

The Agent generates a validated declarative document rather than executable HTML or JavaScript.
Buttons can invoke enabled Workflow HTTP services. Install and enable the target HTTP service
plugin before generating the interface so the Agent can discover its plugin ID and service name.
Generated pages, form interactions, and HTTP jobs are stored separately for each Project. Use
**前往 Project 对话** for normal discussion instead of treating the plugin page as a chat surface.
Paseo injects `projectId`, `projectName`, and `projectSourceDirectory`; do not add fields that ask
users to type those values again.

Whenever the declarative document is saved, Paseo compiles it to a standalone, escaped
`preview.html` beside the Project-scoped app state. Use **浏览器预览** to inspect that file. The
declarative document remains the source of truth; Paseo never executes HTML or JavaScript returned
directly by the Agent.

Supported components include headings, text, text fields, text areas, number fields, selects,
checkboxes, buttons, status, result, and JSON output.
