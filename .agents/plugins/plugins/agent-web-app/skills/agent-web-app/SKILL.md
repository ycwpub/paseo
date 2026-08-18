---
name: agent-web-app
description: Generate and revise safe declarative Paseo plugin interfaces that call installed HTTP service plugins.
---

# Paseo Agent Web App

Use this skill when the user wants to create an interface through conversation.

Install and enable the **网页应用生成器** plugin, then select **Open app: web-app-builder** under
**Host Settings → Plugins**. Describe the desired fields, actions, status, and result presentation.

The Agent generates a validated declarative document rather than executable HTML or JavaScript.
Buttons can invoke enabled Workflow HTTP services. Install and enable the target HTTP service
plugin before generating the interface so the Agent can discover its plugin ID and service name.

Supported components include headings, text, text fields, text areas, number fields, selects,
checkboxes, buttons, status, result, and JSON output.
