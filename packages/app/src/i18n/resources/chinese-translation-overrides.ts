// Simplified Chinese resource changes that extend or intentionally replace upstream copy.
// Runtime resources merge these overrides after the stable upstream resource and feature additions.
export const chineseTranslationOverrides = {
  "common": {
    "actions": {
      "save": "保存"
    },
    "errors": {
      "daemonUnavailable": "守护进程不可用",
      "daemonClientUnavailable": "守护进程客户端不可用",
      "daemonClientDisconnected": "守护进程客户端已断开连接"
    }
  },
  "shell": {
    "commandCenter": {
      "placeholder": "搜索命令、文件、工作区和 智能体...",
      "agents": "智能体",
      "newAgent": "新建智能体",
      "addProject": "添加项目"
    }
  },
  "errors": {
    "unableToSave": "无法保存"
  },
  "composer": {
    "placeholders": {
      "desktop": "给智能体发消息，标记 @files，或使用 /commands 和 /skills",
      "terminal": "提示词"
    },
    "input": {
      "accessibilityLabel": "给智能体发消息...",
      "terminalAccessibilityLabel": "终端提示词",
      "interruptAgent": "中断 智能体"
    },
    "cancel": {
      "cancelingAgent": "正在取消 智能体",
      "stopAgent": "停止 智能体"
    },
    "voice": {
      "interruptBeforeVoice": "启动语音模式前请先中断 智能体"
    },
    "attachments": {
      "addFile": "上传文件",
      "dropFilesHere": "将文件拖放到这里",
      "removeFile": "移除文件附件"
    },
    "errors": {
      "failedToCreateAgent": "创建智能体失败",
      "noHostSelected": "未选择 主机",
      "initialPromptRequired": "初始提示词必填",
      "uploadFailed": "上传文件失败",
      "daemonClientDisconnected": "守护进程客户端已断开连接",
      "fileTooLarge": "{{fileName}} 过大（最大 {{size}}）"
    },
    "clientCommands": {
      "archiveAgent": "归档当前 智能体",
      "freshDraft": "归档此智能体并开始新的草稿"
    }
  },
  "agentControls": {
    "provider": {
      "fallback": "模型提供方",
      "select": "选择智能体模型提供方"
    },
    "thinking": {
      "title": "思考",
      "extraHigh": "极高"
    },
    "model": {
      "unknown": "未知 模型"
    },
    "features": {
      "title": "功能",
      "open": "打开智能体功能"
    },
    "mode": {
      "title": "模式",
      "searchPlaceholder": "搜索 模式s...",
      "selectWithValue": "选择智能体模式（{{value}}）"
    },
    "hints": {
      "thinking": "思考模式",
      "model": "切换 模型"
    }
  },
  "agentStream": {
    "empty": "开始和这个智能体对话...",
    "changes": {
      "summary": "改动文件（{{count}}）",
      "undo": "撤销",
      "review": "审核",
      "reviewFile": "审核 {{fileName}}",
      "confirmUndoTitle": "撤销本轮改动？",
      "confirmUndoMessage": "将撤销本轮 {{count}} 个文件的未提交改动，此操作无法恢复。",
      "confirmUndo": "撤销改动",
      "showMore": "再显示 {{count}} 个文件",
      "showLess": "收起"
    },
    "permission": {
      "plan": "计划"
    }
  },
  "agentPanel": {
    "taskSummary": {
      "title": "任务摘要",
      "subtitle": "查看当前任务的待办、任务产出和参考信息",
      "open": "打开任务摘要",
      "close": "关闭任务摘要",
      "todos": "待办",
      "outputs": "任务产出",
      "references": "参考信息",
      "emptyTodos": "暂无待办",
      "emptyOutputs": "暂无任务产出",
      "emptyReferences": "暂无参考信息",
      "emptyTitle": "暂无活动任务",
      "emptyDescription": "打开一个智能体会话后，即可查看对应的任务摘要。",
      "openFile": "打开 {{fileName}}"
    },
    "states": {
      "notFound": "未找到 智能体",
      "failedToLoad": "加载智能体失败",
      "archivingTitle": "正在归档 智能体...",
      "archivingSubtitle": "请稍候，我们正在归档这个 智能体。"
    },
    "unavailable": {
      "selectedHost": "选中的 主机",
      "unknownHost": "无法打开此 智能体，因为此设备上未配置 {{服务端Label}}。",
      "addHost": "请在设置中添加 主机，或打开已配置 服务端 上的智能体后继续。",
      "preparingSession": "正在准备 {{服务端Label}} 会话...",
      "connecting": "正在连接 {{服务端Label}}...",
      "showSoon": "稍后将显示此 智能体。",
      "showWhenOnline": "主机在线后将显示此智能体。",
      "reconnectingTo": "正在重新连接 {{服务端Label}}...",
      "showAgainWhenReachable": "主机 可访问后将再次显示此 智能体。"
    },
    "archived": {
      "callout": "此智能体已归档"
    }
  },
  "agentList": {
    "archiveSheet": {
      "hostOffline": "主机 离线",
      "runningAgent": "此智能体仍在运行。归档会停止该 智能体。"
    }
  },
  "message": {
    "actions": {
      "forkMissingWorkspace": "此智能体不在工作区中。"
    },
    "compaction": {
      "loadingAuto": "正在自动压缩上下文",
      "loadingManual": "正在手动压缩上下文"
    }
  },
  "importSession": {
    "status": {
      "connectHost": "连接到 主机 以导入会话",
      "updateHost": "更新 主机 以导入会话。",
      "noProviders": "没有已启用的可导入模型提供方。"
    },
    "preview": {
      "noPrompt": "没有 提示词 预览"
    }
  },
  "workspace": {
    "route": {
      "hostStatus": "主机 状态：{{status}}",
      "needsHostUpgrade": "更新你的 主机 以恢复此 workspace",
      "manageHost": "管理 主机",
      "recovery": {
        "archivedTitle": "工作区 已归档",
        "restoreDescription": "{{workspaceName}} 已归档，其 工作树 已移除。恢复分支 {{branch}} 以重新打开。",
        "unavailableTitle": "工作区 不可用"
      }
    },
    "hoverCard": {
      "scriptsAccessibility": "工作区脚本"
    },
    "fileExplorer": {
      "states": {
        "unavailable": "工作区 不可用"
      }
    },
    "setup": {
      "descriptor": {
        "label": "初始化",
        "completed": "初始化已完成",
        "failed": "初始化失败",
        "workspace": "工作区初始化"
      },
      "status": {
        "waiting": "正在等待 初始化 输出"
      },
      "waiting": "正在 初始化 workspace...",
      "empty": {
        "noCommands": "此 workspace 没有运行 初始化 命令。"
      },
      "accessibility": {
        "noCommands": "此 workspace 没有运行 初始化 命令",
        "log": "工作区 初始化 日志"
      }
    },
    "terminal": {
      "hostDisconnected": "主机 未连接",
      "unableToSubscribe": "无法订阅 终端"
    },
    "tabs": {
      "loadingAgentTitle": "正在加载智能体标题",
      "fallback": {
        "newAgent": "新建智能体",
        "setup": "初始化",
        "workspaceSetup": "工作区初始化",
        "terminal": "终端",
        "agent": "智能体",
        "workspace": "工作区"
      },
      "menu": {
        "copyAgentId": "复制智能体ID",
        "copyTerminalId": "复制 终端 ID",
        "copyFilePath": "复制文件路径",
        "reloadAgent": "重新加载 智能体",
        "reloadAgentTooltip": "重新加载智能体以更新 skills、MCPs 或登录状态。",
        "renameTerminal": "重命名 终端",
        "renameAgent": "重命名 智能体"
      },
      "actions": {
        "newAgent": "新建智能体",
        "newTerminal": "新建 终端",
        "preparingTerminal": "正在准备 终端 标签",
        "preparingTerminalTooltip": "正在准备 终端...",
        "terminalProfilesMenu": "终端配置",
        "editTerminalProfiles": "编辑配置"
      },
      "toasts": {
        "agentIdCopiedLabel": "智能体 ID",
        "terminalIdCopiedLabel": "终端 ID",
        "filePathCopiedLabel": "文件路径",
        "reloadingAgent": "正在重新加载 智能体...",
        "reloadedAgent": "已重新加载 智能体",
        "failedToReloadAgent": "重新加载智能体失败",
        "failedToCloseAgent": "关闭智能体失败"
      },
      "confirmations": {
        "closeTerminalTitle": "关闭 终端？",
        "closeTerminalMessage": "此 终端 中任何正在运行的进程都会立即停止。",
        "archiveRunningAgentTitle": "归档正在运行的 智能体？",
        "archiveRunningAgentMessage": "此智能体仍在运行。归档会停止该智能体并关闭标签。",
        "bulk": {
          "all": "这会归档 {{agents}} 个 智能体，关闭 {{terminals}} 个 终端，并关闭 {{tabs}} 个标签。已关闭 终端 中任何正在运行的进程都会立即停止。",
          "agentsAndTerminals": "这会归档 {{agents}} 个 智能体，并关闭 {{terminals}} 个 终端。已关闭 终端 中任何正在运行的进程都会立即停止。",
          "terminalsAndTabs": "这会关闭 {{terminals}} 个 终端，并关闭 {{tabs}} 个标签。已关闭 终端 中任何正在运行的进程都会立即停止。",
          "agentsAndTabs": "这会归档 {{agents}} 个 智能体，并关闭 {{tabs}} 个标签。",
          "terminals": "这会关闭 {{terminals}} 个 终端。已关闭 终端 中任何正在运行的进程都会立即停止。",
          "agents": "这会归档 {{agents}} 个 智能体。"
        }
      }
    },
    "header": {
      "actions": {
        "workspaceActions": "工作区 操作",
        "newAgent": "新建智能体",
        "newTerminal": "新建 终端",
        "showSetup": "显示 初始化"
      },
      "toasts": {
        "workspacePathUnavailable": "工作区 路径尚不可用",
        "terminalQueued": "正在准备 workspace，终端 准备好后会打开...",
        "workspacePathCopiedLabel": "工作区 路径"
      }
    },
    "scripts": {
      "title": "脚本",
      "accessibility": {
        "trigger": "工作区脚本",
        "viewTerminal": "查看 {{scriptName}} 终端",
        "runScript": "运行 {{scriptName}} 脚本",
        "script": "{{scriptName}} 脚本"
      },
      "routes": {
        "paseo": "Paseo"
      },
      "states": {
        "exitCode": "退出码 {{code}}"
      }
    },
    "git": {
      "actions": {
        "commit": {
          "label": "提交",
          "pending": "正在提交...",
          "success": "已提交"
        },
        "pull": {
          "label": "拉取",
          "pending": "正在拉取...",
          "success": "已拉取"
        },
        "push": {
          "label": "推送",
          "pending": "正在推送...",
          "success": "已推送"
        },
        "unavailable": {
          "archiveNotWorktree": "此处无法归档，因为此 workspace 不是作为 Paseo 工作树 创建的"
        }
      },
      "pr": {
        "sections": {
          "reviews": "审查s"
        }
      }
    }
  },
  "workspaceLabels": {
    "manage": {
      "deleteMessage": "这会从此主机的 {{count}} 个工作区中移除该标签。"
    }
  },
  "sidebar": {
    "host": {
      "noHost": "没有主机",
      "switchTitle": "切换主机",
      "searchPlaceholder": "搜索主机..."
    },
    "actions": {
      "addProject": "添加项目",
      "hosts": "主机"
    },
    "worktreeSetup": {
      "title": "设置 工作树 scripts",
      "description": "添加 初始化 命令，让新的 工作树 自动安装依赖并完成准备。",
      "openProjectSettings": "打开项目设置"
    },
    "project": {
      "actions": {
        "menu": "项目操作",
        "openSettings": "打开项目设置",
        "openFolder": "在文件管理器中打开",
        "openFolderFailed": "无法打开文件夹",
        "remove": "移除项目"
      },
      "confirmations": {
        "removeTitle": "删除 项目？",
        "removeMessage": "从 Paseo 中删除「{{projectName}}」及其所有工作区？\n\n仅会删除每台关联主机上的 Paseo 项目数据（~/.paseo/projects/<projectId> 下的全部内容）。不会删除或修改该项目关联的外部代码目录及其中任何文件。Paseo 项目数据删除后无法恢复。"
      },
      "toasts": {
        "hostDisconnected": "主机 未连接",
        "updateHostToRemove": "请更新主机后再删除 项目。"
      },
      "empty": {
        "title": "还没有项目",
        "description": "添加项目以开始"
      }
    },
    "workspace": {
      "actions": {
        "menu": "工作区操作",
        "newWorkspace": "新建工作区",
        "createWorkspaceFor": "为 {{projectName}} 新建工作区",
        "rename": "重命名工作区"
      },
      "confirmations": {
        "hideTitle": "隐藏工作区？"
      },
      "rename": {
        "title": "重命名工作区"
      },
      "toasts": {
        "workspacePathUnavailable": "工作区路径不可用",
        "hostDisconnected": "主机 未连接",
        "hideFailed": "隐藏工作区失败"
      }
    }
  },
  "newWorkspace": {
    "title": "新建工作区",
    "isolation": {
      "worktree": "新建工作树"
    },
    "errors": {
      "hostDisconnected": "主机 未连接",
      "createWorktreeFailed": "创建工作树失败"
    },
    "tooltips": {
      "project": "选择项目",
      "host": "选择主机",
      "isolation": "选择隔离级别",
      "launch": "选择要启动的内容"
    },
    "launch": {
      "title": "启动内容",
      "chat": "聊天",
      "terminal": "终端",
      "manageProfiles": "管理配置",
      "submit": "启动",
      "promptPlaceholder": "{{name}} 提示词",
      "commandPlaceholder": "输入命令，留空则打开空白终端"
    }
  },
  "memoryPolicies": {
    "globalDisabledTitle": "全局记忆未开启",
    "globalDisabledDescription": "当前策略会正常保存，但需要先在 主机 的记忆设置中开启记忆，Paseo 才会使用它。",
    "users": {
      "title": "全局记忆用户",
      "description": "智能体 只会读取和学习当前用户的全局记忆；项目 和助手记忆继续共享。",
      "currentUser": "当前用户",
      "deleteUser": "删除当前用户",
      "newUserName": "新用户名称",
      "newUserPlaceholder": "例如：张三",
      "createAndSwitch": "创建并切换",
      "selectUser": "选择用户",
      "noUsers": "没有用户",
      "deleteTitle": "删除全局记忆用户“{{name}}”？",
      "deleteDescription": "该用户的全局记忆、总文件和提取规范会被永久删除。其他作用域的记忆不受影响。",
      "deleteConfirm": "删除用户"
    },
    "sync": {
      "sectionTitle": "多主机记忆同步",
      "title": "在主机之间共享记忆",
      "description": "与另一台已连接的 Paseo 主机合并全局、项目 和助手记忆，目标主机的现有记忆会保留。",
      "targetHost": "其他主机",
      "selectHost": "选择已连接的主机",
      "noHosts": "没有其他支持记忆同步的已连接主机",
      "scope": "同步范围",
      "selectScope": "选择要同步的记忆",
      "noScopes": "没有可同步的记忆范围",
      "scopes": {
        "global": "全局记忆（当前用户）",
        "project": "项目 · {{name}}",
        "assistant": "助手 · {{name}}"
      },
      "online": "在线",
      "offline": "离线",
      "push": "同步到该主机",
      "pull": "从该主机同步",
      "twoWay": "双向同步",
      "syncing": "同步中…",
      "disconnected": "两台主机都在线时才能同步记忆。",
      "failed": "记忆同步失败",
      "completed": "记忆同步完成",
      "result": "{{source}} → {{target}}：同步后共 {{total}} 条记忆，新增 {{added}} 条",
      "scopeHint": "每次只同步选中的全局、项目 或助手记忆。同步可重复执行且不会重复创建记忆；项目 和助手使用相同 ID 匹配。"
    },
    "scopeManager": {
      "title": "记忆规范",
      "description": "统一管理全局、项目 和助手记忆允许保存的长期信息。",
      "scopeType": "记忆范围",
      "target": "管理对象",
      "selectScopeType": "选择记忆范围",
      "selectTarget": "选择管理对象",
      "noScopes": "没有可用的记忆范围",
      "noTargets": "没有匹配的 项目 或助手",
      "types": {
        "global": "全局",
        "project": "项目",
        "workspace": "工作区",
        "assistant": "助手"
      },
      "enabledTitle": "{{scope}}记忆",
      "enabledHint": "在匹配的会话中读取该范围的记忆，并允许自动学习新记忆到该范围。",
      "instructionsTitle": "保存哪些信息",
      "instructionsHint": "描述适合保存到该范围的长期信息。该规范只指导记忆提取，不会作为指令加入智能体的可见提示词。",
      "instructionsPlaceholder": "例如：保存已确认的规范、可复用流程和稳定决策；忽略临时错误和一次性请求。",
      "save": "保存规范",
      "saving": "保存中…",
      "saved": "已保存",
      "saveError": "无法保存记忆规范"
    },
    "contentManager": {
      "title": "记忆内容",
      "description": "按全局、项目 或助手查看长期记忆。项目 是最细粒度，记忆可汇总到助手和全局。",
      "pageTitle": "记忆管理",
      "detailTitle": "记忆详情",
      "manage": "管理记忆内容",
      "manageDescription": "当前共 {{count}} 条记忆，在右侧页面查看总记忆及记忆明细。",
      "openManager": "打开",
      "backToList": "返回记忆列表",
      "loading": "正在加载记忆…",
      "notFound": "这条记忆不存在或已被删除。",
      "errorTitle": "无法管理记忆",
      "scopeEditHint": "修改作用域后，记忆会移动到对应的全局、项目 或助手范围。",
      "search": "搜索",
      "searchPlaceholder": "搜索标题、内容或关键词",
      "status": "状态",
      "allStatuses": "全部状态",
      "noStatuses": "没有可用状态",
      "targetDescription": "{{id}} · {{count}} 条记忆",
      "selectTargetFirst": "请先选择要管理的对象。",
      "empty": "尚未保存长期记忆。",
      "noMatches": "当前范围内没有符合筛选条件的记忆。",
      "views": {
        "overview": "总记忆",
        "details": "记忆明细"
      },
      "overviewTitle": "总记忆",
      "overviewDescription": "该范围的记忆总览和明细索引。索引由框架自动维护，保存后会根据当前有效记忆重新生成。",
      "overviewPath": "文件路径",
      "saveOverview": "保存总记忆",
      "overviewUnavailable": "当前范围尚未生成总记忆文件。",
      "pagination": {
        "pageSize": "每页数量",
        "noPageSizes": "没有可用的分页数量",
        "page": "第 {{page}} / {{totalPages}} 页",
        "range": "显示 {{start}}–{{end}}，共 {{total}} 条",
        "previous": "上一页",
        "next": "下一页"
      }
    }
  },
  "workflows": {
    "title": "本地工作流",
    "actions": {
      "refresh": "刷新",
      "new": "新建工作流",
      "save": "保存",
      "delete": "删除",
      "discard": "放弃",
      "run": "运行",
      "cancel": "取消",
      "retry": "重试",
      "create": "创建工作流",
      "guide": "使用说明"
    },
    "guide": {
      "title": "Workflow 使用说明",
      "intro": "Workflow 是保存在所选 Paseo 主机上的可复用 JSON 脚本，可从 Paseo 界面、智能体、CLI 或服务端代码启动。",
      "contract": {
        "title": "输入输出约定",
        "description": "节点输入由 Paseo 自动组装：data 来自前一个节点输出的 data，origin_input 始终保存 Workflow 启动时的原始输入；workflow.var 和 node.var 由 Workflow 框架填充。",
        "note": "节点必须输出 {\"data\":{}}，data 必须是 JSON 对象。仅修改 Workflow 变量时输出 modify，仅报告业务错误时输出 base_resp；node.var 只读，artifacts 由框架自动填充。"
      },
      "internal": {
        "title": "Paseo 内部使用",
        "visualTitle": "从当前页面运行",
        "visualDescription": "选择工作流，在“测试运行”中填写初始 JSON，选择运行整个 Workflow 或指定节点，然后点击“运行”。下方会展示最近一次运行以及每个节点的输入、输出和耗时。",
        "agentTitle": "由智能体调用",
        "agentDescription": "智能体 可调用 list_workflows、inspect_workflow、run_workflow、get_workflow_run 和 cancel_workflow。设置 targetNodeId 可测试单个节点。以下是 run_workflow 入参示例：",
        "serverTitle": "服务端代码调用",
        "serverDescription": "Paseo 内部服务可直接调用 WorkflowService，并等待工作流执行完成："
      },
      "external": {
        "title": "Paseo 外部使用",
        "cliTitle": "通过 CLI 或 Shell 脚本运行",
        "cliDescription": "本地脚本、CI、定时任务以及其他可连接守护进程的进程，都可以通过 Paseo CLI 运行；增加 --node <node-id> 可测试单个节点：",
        "backgroundTitle": "异步启动",
        "backgroundDescription": "增加 --background 后会立即返回。之后可以使用返回的 run ID 查询状态或取消运行。",
        "hostNote": "工作流路径是守护进程所在主机上的路径。连接其他 Paseo 守护进程时，请为 CLI 增加 --host 参数。"
      },
      "nodes": {
        "title": "节点行为",
        "bash": "• Bash：框架把输入 JSON 赋值给配置的输入变量；脚本把唯一结果 JSON 字符串赋值给配置的输出变量。Paseo 自动将其写入文件描述符 3，stdout/stderr 仅用于日志。",
        "python": "• Python：框架把解析后的输入对象赋值给配置的输入变量；代码把唯一结果对象赋值给配置的输出变量。Paseo 自动将其序列化到文件描述符 3。",
        "agent": "• 智能体：普通模式把最终回答写入 data.answer；自定义模式要求智能体返回完整结果信封。",
        "switch": "• Switch：解析 switchVar，并选择匹配的分支。",
        "for": "• For：支持数组、数字倒计时和持续循环。每轮都从 For 节点的 input.data 开始，跨轮状态请使用 loop 变量。"
      }
    },
    "host": {
      "select": "选择主机",
      "empty": "暂无主机",
      "title": "工作流主机",
      "notConfigured": "尚未配置主机",
      "offline": "所选主机已离线",
      "hint": "工作流保存在所选主机的 ~/.paseo/workflows 目录中。"
    },
    "inputContract": {
      "title": "工作流数据契约",
      "description": "工作流输入 Schema 等于第一个节点的输入 Schema；在此声明共享变量、最终输出 Schema 和输入预设。",
      "contract": "工作流变量",
      "contractHint": "变量类型支持 \"string\" 和 \"int64\"，int64 使用十进制字符串。",
      "outputSchema": "Workflow output.data 结构约束",
      "outputSchemaHint": "Workflow 成功结束前校验最终 output.data",
      "nodeVariables": "节点变量",
      "nodeVariablesHint": "声明仅当前节点可读的常量，不能修改；类型支持 \"string\" 和 \"int64\"。",
      "invalidVariables": "工作流变量必须是 JSON 对象。",
      "invalidOutputSchema": "工作流输出 Schema 必须是 JSON 对象。",
      "invalidPresets": "输入预设必须是 JSON 数组。",
      "presets": "输入参数预设",
      "presetsHint": "可保存固定资源地址，以及仅扫描、仅准备、完整运行等可复用输入。",
      "preset": "输入参数预设",
      "presetHint": "选择后会把预设数据复制到可继续编辑的运行输入中。",
      "selectPreset": "选择预设",
      "noPresets": "暂无输入预设",
      "selectValue": "选择值",
      "true": "是",
      "false": "否"
    },
    "environment": {
      "title": "命令运行环境",
      "description": "配置 Bash 和 Python 节点继承的环境。智能体节点继续使用对应模型提供方管理的环境。",
      "inherit": "继承环境",
      "daemon": "守护进程环境",
      "daemonHint": "使用启动 Paseo 守护进程时的环境。",
      "loginShell": "登录 Shell 环境",
      "loginShellHint": "加载一次用户登录 Shell，包括其中的 PATH。",
      "variables": "环境变量（JSON）",
      "variablesHint": "这些字符串变量会覆盖所有命令节点继承到的环境。"
    },
    "graph": {
      "title": "Workflow 编排图",
      "designHint": "展示节点依赖、执行顺序、条件分支、汇合点和循环体；可拖拽节点和连线圆点调整布局。",
      "runHint": "实时展示节点状态、执行路径、耗时和次数；点击节点查看完整输入输出。",
      "nodeCount": "{{count}} 个节点",
      "leftToRight": "从左到右",
      "start": "开始",
      "end": "结束",
      "dependencies": "依赖节点",
      "startNode": "流程起点",
      "branches": "分支",
      "caseBranch": "control = {{value}}",
      "defaultBranch": "默认分支",
      "loopBody": "循环体",
      "loopBack": "下一轮",
      "emptyBranch": "此分支没有节点",
      "merge": "汇合后继续",
      "executions": "执行次数",
      "executionCount": "{{count}} 次",
      "selectNodeHint": "点击节点可查看该节点每次执行的完整输入和输出。",
      "nodeDetails": "所选节点详情",
      "nodeNotRun": "该节点尚未运行",
      "executionAttempt": "第 {{attempt}} 次尝试，共 {{count}} 次",
      "fullView": "完整方案",
      "fullViewTitle": "完整 Workflow 编排图",
      "fullViewHint": "查看完整依赖关系和执行路径，可放大、缩小并打开节点详情。",
      "zoomIn": "放大编排图",
      "zoomOut": "缩小编排图",
      "resetZoom": "重置编排图缩放",
      "resetLayout": "重置布局",
      "nodeName": "节点名称",
      "nodeId": "节点 ID",
      "nodeType": "节点类型",
      "configuration": "完整节点配置",
      "status": {
        "not_run": "未运行",
        "running": "运行中",
        "succeeded": "成功",
        "failed": "失败",
        "cancelled": "已取消",
        "timed_out": "已超时",
        "skipped": "已跳过"
      }
    },
    "dialogs": {
      "discardTitle": "放弃未保存的更改？",
      "discardMessage": "当前工作流的更改尚未保存。",
      "deleteTitle": "删除工作流？",
      "deleteMessage": "这将永久删除“{{name}}”。"
    },
    "messages": {
      "notFound": "未找到工作流",
      "saveFailed": "无法保存工作流",
      "fieldRequired": "该字段不能为空",
      "saved": "工作流已保存",
      "deleted": "工作流已删除",
      "inputRequired": "请输入 JSON 对象",
      "invalidInputJson": "输入必须是符合第一个节点输入 Schema 的合法 JSON 对象",
      "invalidNodeInputJson": "本节点 input 必须包含 data、origin_input、workflow.var 和 node.var 对象",
      "startFailed": "无法启动工作流",
      "started": "工作流已启动",
      "cancelFailed": "无法取消工作流运行",
      "cancelled": "工作流已取消",
      "loadFailed": "无法加载工作流",
      "agentNotFound": "未找到此工作流创建的 智能体"
    },
    "editor": {
      "untitled": "未命名工作流",
      "unsaved": "未保存",
      "generatedFileName": "首次保存后自动生成文件名",
      "name": "工作流名称",
      "nodes": "个节点",
      "description": "描述",
      "descriptionPlaceholder": "这个工作流用于做什么？",
      "workflowTimeout": "工作流超时（秒）",
      "workflowTimeoutHint": "整个工作流运行的最长时间。",
      "taskTimeout": "任务超时（秒）",
      "taskTimeoutHint": "Bash、Python、智能体 和 Workflow 节点的默认超时时间。",
      "defaultAttempts": "默认尝试次数",
      "defaultAttemptsHint": "包含首次执行。",
      "promptTemplates": "提示词模板",
      "promptTemplatesHint": "为当前主机创建可复用模板。智能体 节点选择模板时会复制模板内容，后续修改节点提示词不会影响原模板。",
      "flow": "流程",
      "flowHint": "JSON 数据会从上到下自动传递。",
      "testRun": "测试运行",
      "testRunHint": "使用初始 JSON 数据在所选主机上运行此工作流。",
      "testRunUpstreamHint": "使用前一节点的 output；如果没有前一节点，则使用 Workflow 原始输入测试所选节点。",
      "testRunNodeInputHint": "将完整的本节点 input 直接传给所选节点，不执行框架字段映射或变量填充。",
      "inputJson": "输入 JSON",
      "nodeInputJson": "本节点输入 JSON",
      "inputJsonHint": "填写 Workflow 业务输入；每个节点通过输入映射选择自己接收的字段。",
      "nodeInputJsonHint": "填写本节点完整的 input JSON，包括 origin_input；Paseo 会直接传给本节点，不执行字段映射，也不填充 Workflow、Loop 和 Node 变量。",
      "runTarget": "运行范围",
      "runTargetHint": "可运行整个 Workflow，或使用配置的输入 JSON 测试指定节点。",
      "runEntireWorkflow": "整个 Workflow",
      "noRunTargets": "没有可运行的节点",
      "inputMode": "输入类型",
      "inputModeHint": "指定上方 JSON 如何转换为所选节点的 input。",
      "selectInputMode": "选择输入类型",
      "inputModes": {
        "upstreamOutput": "前一节点 output / Workflow 原始输入",
        "upstreamOutputDescription": "执行字段映射，并由 Paseo 填充 Workflow、Loop 和 Node 变量。",
        "nodeInput": "本节点 input",
        "nodeInputDescription": "将包含 origin_input 的完整节点 input 直接传入，不执行映射，也不填充变量。"
      },
      "emptyTitle": "选择或创建工作流",
      "emptyDescription": "无需编辑 JSON，即可编排 Bash、Python、智能体、Workflow、Switch 和 For 节点。"
    },
    "list": {
      "title": "已保存的工作流",
      "empty": "暂无工作流",
      "nodeCount": "{{count}} 个节点"
    },
    "run": {
      "output": "输出：{{path}}",
      "payload": "数据：{{payload}}",
      "startedAt": "开始时间",
      "endedAt": "结束时间",
      "duration": "耗时",
      "targetNode": "目标节点",
      "notFinished": "尚未结束",
      "input": "输入",
      "outputPayload": "输出",
      "inputFile": "输入文件",
      "outputFile": "输出文件",
      "control": "流程控制",
      "iteration": "循环路径",
      "processOutput": "Bash 运行输出",
      "pythonProcessOutput": "Python 运行输出",
      "stdout": "标准输出（stdout）",
      "stderr": "错误输出（stderr）",
      "nodeOutput": "节点运行输出",
      "userInput": "用户输入",
      "agentAnswer": "智能体回答",
      "agentProcess": "智能体执行过程",
      "errorCode": "错误码",
      "workflow": "Workflow",
      "workflowRunId": "子流程运行 ID",
      "expandedInstruction": "展开后的命令或提示词",
      "cwd": "工作目录",
      "environment": "环境来源",
      "path": "PATH",
      "exitCode": "退出码",
      "signal": "退出信号",
      "skippedReason": "跳过原因",
      "environmentSource": {
        "daemon": "守护进程环境",
        "login-shell": "登录 Shell 环境"
      },
      "status": {
        "running": "运行中",
        "succeeded": "成功",
        "failed": "失败",
        "cancelled": "已取消",
        "timed_out": "已超时"
      }
    },
    "nodes": {
      "emptyBranch": "此分支中没有节点。",
      "add": "添加节点",
      "moveUp": "上移节点",
      "moveDown": "下移节点",
      "delete": "删除节点",
      "openDetails": "打开“{{name}}”节点详情",
      "id": "节点 ID",
      "displayName": "显示名称",
      "downstream": {
        "label": "下游节点",
        "hint": "选择当前节点完成后执行的同层节点。",
        "sequential": "按列表顺序",
        "sequentialDescription": "执行列表中的下一个节点。",
        "end": "流程结束",
        "endDescription": "当前节点完成后结束此层流程。",
        "missing": "节点不存在：{{id}}",
        "placeholder": "选择下游节点",
        "empty": "没有可选的下游节点"
      },
      "defaultNames": {
        "bash": "Bash 命令",
        "python": "Python 代码",
        "agent": "智能体",
        "switch": "条件分支",
        "for": "逐项循环"
      },
      "types": {
        "bash": "Bash",
        "python": "Python",
        "agent": "智能体",
        "switch": "Switch",
        "for": "For"
      },
      "typeDescriptions": {
        "bash": "执行 Shell 命令",
        "python": "执行 Python 代码",
        "agent": "运行 AI 智能体",
        "switch": "根据显式表达式选择分支",
        "for": "遍历显式数组"
      },
      "contract": {
        "title": "节点数据契约",
        "description": "生成 input.data、声明节点变量，并分别校验节点接收的 input.data 和生成的 output.data。",
        "inputs": "input.data 映射（可选）",
        "inputsHint": "在节点执行前生成本节点的 input.data。留空时沿用上一个节点的 output.data；可用于筛选、重命名或组合字段。例如：{{nodes.scan.outputs.items}}。",
        "inputSchema": "input.data 结构校验",
        "outputSchema": "output.data 结构校验（可选）",
        "schemaHint": "可选。Paseo 会在继续执行前校验对象。",
        "invalidJson": "请输入合法 JSON。",
        "objectRequired": "必须填写 JSON 对象。"
      },
      "contractHints": {
        "inputSchema": "校验完成映射后，本节点实际接收的 input.data",
        "outputSchema": "校验本节点生成的 output.data，用于及时定位输出格式错误；不替代下游节点的 input.data 结构校验。"
      },
      "schemaCompatibility": {
        "title": "data 结构兼容性提示",
        "workflowOutput": "Workflow 的 output.data",
        "requiredNotGuaranteed": "{{source}} → {{target}}：output.data Schema 未保证必填字段“{{path}}”",
        "fieldNotAccepted": "{{source}} → {{target}}：output.data 可能包含字段“{{path}}”，但下游 input.data Schema 不接受该字段",
        "typeMismatch": "{{source}} → {{target}}：output.data 字段“{{path}}”类型为 {{outputTypes}}，下游 input.data Schema 要求 {{inputTypes}}"
      },
      "help": {
        "show": "查看 {{type}} 节点输入输出说明",
        "title": "{{type}} 节点输入输出",
        "inputTitle": "如何读取输入",
        "outputTitle": "如何输出数据",
        "initialValueTitle": "新建节点的初始示例",
        "initialValueDescription": "创建节点时会自动填入此示例，可直接修改。",
        "compositionTitle": "运行另一个 Workflow",
        "compositionDescription": "使用 Bash 节点调用 paseo workflow run，并把成功子流程的 outputPayload 赋值给配置的输出变量。",
        "bash": {
          "input": "Paseo 自动组装节点输入：data 来自前一个节点输出的 data，origin_input 始终保存 Workflow 启动时的原始输入，workflow.var 和 node.var 由框架填充。在 For 内还会填充最内层 loop.var 对象。配置的输入变量接收 stdin 中的完整 JSON 字符串。",
          "output": "输出必须包含 JSON 对象 data。修改 Workflow 变量使用 modify.workflow.var，修改最内层 For 的自定义变量使用 modify.loop.var。node.var 和 loop.var.item/index/count 只读。仅报告业务错误时增加 base_resp；artifacts 由框架填充。Paseo 会把配置的输出变量写入文件描述符 3；stdout/stderr 仅用于日志。"
        },
        "python": {
          "input": "Paseo 自动组装节点输入：data 来自前一个节点输出的 data，origin_input 始终保存 Workflow 启动时的原始输入，workflow.var 和 node.var 由框架填充。在 For 内还会填充最内层 loop.var 对象。配置的输入变量接收解析后的完整对象。",
          "output": "输出必须包含 JSON 对象 data。修改 Workflow 变量使用 modify.workflow.var，修改最内层 For 的自定义变量使用 modify.loop.var。node.var 和 loop.var.item/index/count 只读。仅报告业务错误时增加 base_resp；artifacts 由框架填充。Paseo 会把配置的输出变量序列化到文件描述符 3。"
        },
        "agent": {
          "input": "Paseo 统一组装一个节点 input：data 来自前一个节点输出的 data，origin_input 始终保存 Workflow 启动时的原始输入，workflow.var、node.var 由框架填充，project.var 来自智能体选择的 项目，For 内还会填充最内层 loop.var。提示词直接使用 data.*、origin_input.*、workflow.var.*、project.var.*、loop.var.*、node.var.* 读取字段；只有需要完整对象时才使用 {{input}}。",
          "output": "普通模式把智能体最终回答包装为 {\"data\":{\"answer\":\"...\"}}。",
          "controlOutput": "自定义模式要求智能体最终回答包含 JSON 对象 data；modify.workflow.var、modify.loop.var 和 base_resp 按需输出，不能修改 node.var 或 loop.var.item/index/count，也不需要输出 artifacts。"
        },
        "switch": {
          "input": "解析 switchVar 表达式，并把得到的原始值与各分支匹配值比较。",
          "output": "Switch 自身不改写数据；被选中分支的最终 JSON 会成为节点输出。"
        },
        "for": {
          "input": "数组模式要求 JSON 数组；数字模式要求非负整数；True 模式持续循环。每轮首个循环体节点都会收到 For 原始 input.data 和最内层 loop.var 对象。",
          "output": "最后完成的一轮作为 For 输出。break 会停止循环，continue 会跳过本轮剩余节点；跨轮状态通过自定义 loop 变量传递。"
        }
      },
      "expandedEditor": {
        "defaultTitle": "输入内容",
        "open": "放大编辑{{field}}",
        "subtitle": "在大文本框中编辑，点击“完成”后才会同步到节点。",
        "done": "完成"
      },
      "common": {
        "workingDirectory": "工作目录",
        "inputFileDirectory": "输入文件所在目录",
        "timeout": "超时时间（秒）",
        "providerDefault": "使用模型提供方默认值",
        "optional": "可选",
        "inputVariable": "输入变量",
        "bashInputVariableHint": "Bash 命令中接收完整节点输入 JSON 字符串的变量名。以默认变量 input 为例：映射数据位于 input.data，Workflow 原始输入位于 input.origin_input，Workflow 变量位于 input.workflow.var，最内层 For 变量位于 input.loop.var，节点常量位于 input.node.var。",
        "pythonInputVariableHint": "Python 代码中接收解析后完整节点输入对象的变量名。以默认变量 input 为例：映射数据位于 input[\"data\"]，Workflow 原始输入位于 input[\"origin_input\"]，Workflow 变量位于 input[\"workflow\"][\"var\"]，最内层 For 变量位于 input[\"loop\"][\"var\"]，节点常量位于 input[\"node\"][\"var\"]。",
        "outputVariable": "输出变量",
        "bashOutputVariableHint": "命令执行成功前，需将包含必填 JSON 对象 data 的结果字符串赋值给此变量。",
        "pythonOutputVariableHint": "代码执行成功前，需将包含必填 JSON 对象 data 的结果对象赋值给此变量。",
        "environment": "节点环境变量覆盖（JSON）",
        "environmentHint": "可选。字符串值会覆盖 Workflow 命令环境，仅作用于当前命令节点。",
        "environmentStringValues": "环境变量的值必须是字符串。"
      },
      "bash": {
        "initialCommand": "初始命令",
        "initialCommandHint": "可使用模板变量或配置的输入变量；输出必须包含 JSON 对象 data，modify 和 base_resp 按需增加，stdout/stderr 仅用于日志。",
        "shell": "Shell"
      },
      "python": {
        "code": "Python 代码",
        "codeHint": "可填写内联代码，或留空并配置 Python 模块和函数。内联代码读取输入变量并为输出变量赋值。",
        "module": "Python 模块",
        "moduleHint": "可选的点分模块路径；使用时需同时配置函数，并代替内联代码。",
        "function": "Python 函数",
        "functionHint": "函数接收解析后的完整节点输入，并返回节点结果对象；支持异步函数。",
        "interpreter": "Python 解释器",
        "interpreterHint": "留空时使用 python3。"
      },
      "agent": {
        "promptTemplate": "提示词模板",
        "promptTemplateHint": "选择后会把模板内容复制到当前节点，节点提示词可独立修改。",
        "selectPromptTemplate": "选择要复制的提示词模板",
        "systemPromptTemplate": "系统提示词模板",
        "selectSystemPromptTemplate": "选择要复制到系统提示词的模板",
        "noPromptTemplates": "当前主机尚未配置提示词模板。",
        "outputType": "智能体 节点类型",
        "outputTypeHint": "普通模式把最终回答写入 data.answer；自定义模式要求返回包含必填 JSON 对象 data 的结果。",
        "selectOutputType": "选择智能体节点类型",
        "noOutputTypes": "暂无智能体节点类型。",
        "outputTypes": {
          "normal": "普通模式",
          "normalDescription": "把智能体回答转换为 {\"data\":{\"answer\":\"智能体回答\"}}。",
          "custom": "自定义模式",
          "customDescription": "把智能体回答解析为节点结果；data 必填，modify 和 base_resp 按需输出。"
        },
        "initialPrompt": "初始提示词",
        "initialPromptHint": "所有变量均来自节点 input，分别通过 data.*、origin_input.*、workflow.var.*、project.var.*、loop.var.*、node.var.* 路径读取。",
        "executionPolicy": "执行策略",
        "lifecycle": "智能体生命周期",
        "lifecycleHint": "决定同一个智能体节点创建的智能体可以复用多久；复用智能体的调用会按顺序执行。",
        "selectLifecycle": "选择智能体生命周期",
        "lifecycleOptions": {
          "workflow": "整个 Workflow",
          "workflowDescription": "首次执行时创建，之后复用，Workflow 结束时释放。",
          "for": "本 For 循环",
          "forDescription": "首次迭代时创建，在当前 For 循环内复用，跳出循环时释放。",
          "single": "单次",
          "singleDescription": "每次执行都创建新的 智能体，不复用。"
        },
        "subsequentPromptMode": "非首次提示词",
        "subsequentPromptModeHint": "设置本节点再次调用已初始化智能体时发送的提示词。",
        "selectSubsequentPromptMode": "选择非首次提示词方式",
        "subsequentPromptModes": {
          "reuseInitial": "复用初始提示词",
          "reuseInitialDescription": "继续使用初始提示词模板，并按本次节点输入重新渲染变量。",
          "custom": "自定义",
          "customDescription": "首次调用之后，每次都使用单独配置的非首次提示词。"
        },
        "subsequentPrompt": "自定义非首次提示词",
        "subsequentPromptHint": "使用与初始提示词相同的节点 input 路径。",
        "timeoutHint": "留空则使用工作流的默认任务超时。",
        "provider": "模型提供方",
        "model": "模型",
        "mode": "模式",
        "thinking": "思考选项",
        "isolation": "隔离方式",
        "isolationSelect": "选择隔离方式",
        "isolationEmpty": "暂无隔离方式",
        "isolationTitle": "智能体 隔离方式",
        "localDirectory": "本地目录",
        "isolatedWorktree": "隔离 Worktree",
        "approvalPolicy": "审批策略",
        "sandboxMode": "沙箱模式",
        "assistantOrTeam": "助手或团队",
        "systemPrompt": "系统提示词",
        "systemPromptPlaceholder": "可选的附加系统提示词",
        "systemPromptHint": "使用与用户提示词相同的节点 input 路径；通过模型提供方的系统指令通道独立发送，不会追加到界面可见的用户提示词中。",
        "systemPromptConfiguredHint": "已配置，运行时会替换模板变量，并通过模型提供方的系统指令通道独立发送。",
        "archive": "完成后归档 智能体",
        "archiveAtLifecycleEnd": "智能体生命周期结束后自动归档",
        "network": "允许访问网络",
        "webSearch": "允许联网搜索",
        "selectProvider": "选择模型提供方",
        "noProviders": "当前主机没有可用的模型提供方。",
        "selectModel": "选择模型",
        "noModels": "当前模型提供方没有可用模型。",
        "selectMode": "选择模式",
        "noModes": "当前模型提供方没有可用模式。",
        "selectThinking": "选择思考选项",
        "noThinking": "当前模型没有可用的思考选项。",
        "selectApprovalPolicy": "选择审批策略",
        "noApprovalPolicies": "没有可用的审批策略。",
        "selectSandboxMode": "选择沙箱模式",
        "noSandboxModes": "没有可用的沙箱模式。",
        "selectAssistantOrTeam": "选择助手或团队",
        "noAssistantsOrTeams": "当前主机没有可用助手或团队。",
        "teamOptionDescription": "团队 · 负责人：{{leader}} · {{count}} 个助手",
        "approvalOptions": {
          "onRequest": "按需审批",
          "never": "从不审批",
          "untrusted": "不可信命令时审批",
          "onFailure": "失败时审批"
        },
        "sandboxOptions": {
          "readOnly": "只读",
          "workspaceWrite": "允许写入工作区",
          "fullAccess": "完全访问"
        }
      },
      "variables": {
        "bashTitle": "Bash 变量",
        "pythonTitle": "Python 变量",
        "agentTitle": "智能体输入变量",
        "bashDescription": "定义命令中可复用的变量，变量值也可引用输入数据路径或内置变量。",
        "pythonDescription": "定义 Python 代码中可复用的变量，变量值也可引用输入数据路径或内置变量。",
        "agentDescription": "智能体 提示词只从节点 input 读取变量：当前业务数据使用 data.*，Workflow 启动时的原始输入使用 origin_input.*，Workflow 变量使用 workflow.var.*，智能体 选择的项目变量使用 project.var.*，最内层 For 变量使用 loop.var.*，节点常量使用 node.var.*。项目 变量在 项目 设置中定义，节点常量在下方“节点数据契约”中定义。",
        "examplesTitle": "变量使用范例",
        "inputExample": "假设输入 JSON 为：",
        "nestedObjectExample": "读取嵌套对象字段",
        "arrayExample": "读取数组元素字段",
        "controlExample": "读取必填的 control 字段",
        "payloadExample": "读取完整 JSON 数据",
        "customExample": "读取自定义变量，例如 role = reviewer",
        "bashUsageExample": "Bash 命令范例：",
        "pythonUsageExample": "Python 代码范例：",
        "agentUsageExample": "智能体 用户提示词或系统提示词范例：",
        "showHelp": "查看变量使用范例",
        "add": "添加变量",
        "name": "变量名",
        "value": "变量值",
        "delete": "删除变量 {{name}}"
      },
      "retry": {
        "title": "重试策略",
        "description": "覆盖工作流默认值。可重试的命令应保证幂等。",
        "attempts": "尝试次数",
        "workflowDefault": "使用工作流默认值",
        "initialDelay": "初始延迟（秒）",
        "maxDelay": "最大延迟（秒）",
        "backoff": "退避倍数",
        "jitter": "为重试延迟添加随机抖动"
      },
      "switch": {
        "switchOn": "取值表达式",
        "switchOnHint": "指定要比较的值，例如 {{data.decision}}。",
        "caseSensitive": "区分大小写",
        "valueEquals": "值等于",
        "deleteBranch": "删除分支",
        "addBranch": "添加分支",
        "defaultBranch": "默认分支",
        "defaultDescription": "没有匹配条件时执行，可以为空。"
      },
      "for": {
        "mode": "循环类型",
        "modeArray": "数组",
        "modeNumber": "数字",
        "modeTrue": "True",
        "selectMode": "选择循环类型",
        "executionMode": "执行模式",
        "executionModeHint": "串行按顺序执行每轮；并行同时执行多轮。",
        "executionSerial": "串行",
        "executionParallel": "并行",
        "selectExecutionMode": "选择执行模式",
        "items": "循环项表达式",
        "itemsHint": "数组模式必须解析为 JSON 数组；数字模式必须解析为非负整数。",
        "maximumIterations": "最大循环次数",
        "maximumIterationsHint": "最多执行的循环次数，默认为 100；0 表示不限制。",
        "concurrency": "并发度",
        "concurrencyHint": "并行模式下同时执行的循环次数，默认为 1，最大为 100。每轮都从 For 节点的同一份 input.data 开始。",
        "control": "循环控制表达式",
        "controlHint": "读取用户定义的 data 字段；值为 break 时结束循环，continue 时跳过本轮剩余节点，字段为空或不存在时正常继续。",
        "breakWhen": "结束条件",
        "breakWhenHint": "可选表达式，必须解析为布尔值；为 true 时在当前循环体节点执行后结束循环。",
        "continueWhen": "跳过条件",
        "continueWhenHint": "可选表达式，必须解析为布尔值；为 true 时跳过本轮后续循环体节点。",
        "loopBody": "循环体",
        "loopDescription": "control 返回 continue 时跳过本轮剩余节点，返回 break 时结束循环。\nloop.var.item：数组元素；数字模式下为本轮执行前的剩余值；True 模式下为 true。\nloop.var.index：当前循环序号，从 0 开始。\nloop.var.count：数组长度、数字初始值或 True 模式最大次数（不限制时为 0）。\n每轮都从 For 节点的 input.data 开始；需要把状态传给下一轮时，请使用自定义 loop.var 变量。",
        "loopVariables": "For 循环变量",
        "loopVariablesHint": "统一存放在 loop.var，仅 For 循环内部共享；嵌套 For 中只能看到最内层 loop.var。串行模式下可通过 modify.loop.var 修改自定义变量。",
        "parallelLoopVariablesHint": "并行模式下每轮可以读取 Loop 变量初始值，但不允许通过 modify.loop.var 修改，避免并发冲突。",
        "loopVariableDefinitions": "自定义循环变量",
        "loopVariableDefinitionsHint": "可声明额外的 loop.var.* 变量，类型支持 \"string\" 和 \"int64\"；item、index、count 为只读内置变量。"
      }
    }
  },
  "desktop": {
    "windowName": {
      "renameTitle": "重命名窗口",
      "placeholder": "窗口名称"
    },
    "daemon": {
      "title": "守护进程",
      "logs": {
        "modalTitle": "守护进程日志"
      },
      "fullStatus": {
        "modalTitle": "守护进程状态"
      }
    }
  },
  "communityLinks": {
    "star": "加星",
    "sponsor": "赞助",
    "community": "社区"
  },
  "openProject": {
    "tiles": {
      "addProject": {
        "title": "添加项目"
      },
      "setupProviders": {
        "title": "设置模型提供方"
      }
    }
  },
  "projectPicker": {
    "opening": "正在打开项目..."
  },
  "workspaceSetup": {
    "errors": {
      "failedCreateWorktree": "创建 工作树 失败",
      "hostDisconnected": "主机 未连接",
      "pendingRequired": "没有待处理的 workspace 初始化",
      "composerStateRequired": "工作区 初始化 composer 状态必填"
    }
  },
  "modelSelector": {
    "selectedModel": "选择模型（{{模式l}}）"
  },
  "providerSelection": {
    "readiness": {
      "initialPromptRequired": "初始提示词必填",
      "noProviders": "所选 主机 上没有可用的 provider",
      "workspaceDirectoryNotFound": "工作区 目录未找到",
      "hostDisconnected": "主机 未连接"
    }
  },
  "pairing": {
    "direct": {
      "helper": "输入 Paseo 服务端 的地址。",
      "fields": {
        "host": "主机"
      },
      "errors": {
        "hostRequired": "主机 必填",
        "refused": "连接被拒绝。服务端 是否正在此地址运行？",
        "hostUnreachable": "主机 不可达。请检查网络和防火墙。"
      }
    },
    "link": {
      "helper": "粘贴来自 服务端 的配对链接。"
    },
    "device": {
      "relayListTitle": "Relay 列表",
      "hintMultiple": "可使用任意一个 Relay 配对地址连接此设备。",
      "access": {
        "title": "客户端管理",
        "requireApproval": "启用客户端准入验证",
        "requireApprovalHint": "开启后，新客户端必须在此通过申请后才能连接。",
        "empty": "暂无客户端连接申请。",
        "pending": "待通过",
        "allowed": "准许连接",
        "approved": "已通过",
        "paused": "已暂停",
        "connected": "已连接",
        "disconnected": "已断开",
        "hostname": "主机名",
        "identityId": "身份 ID",
        "endpoint": "IP / 端口",
        "endpointUnavailable": "暂不可用",
        "lastConnectedAt": "最近连接时间",
        "neverConnected": "暂无记录",
        "unknownName": "未知客户端",
        "approve": "通过",
        "approving": "正在通过...",
        "pause": "暂停",
        "pausing": "正在暂停...",
        "resume": "恢复",
        "resuming": "正在恢复...",
        "delete": "删除",
        "deleting": "正在删除...",
        "macClient": "Mac 版",
        "androidClient": "Android 版",
        "cliClient": "CLI 版",
        "browserClient": "浏览器版"
      }
    }
  },
  "downloads": {
    "hostUnavailable": "下载 主机 不可用。"
  },
  "panels": {
    "draft": {
      "newAgent": "新建智能体",
      "creatingAgent": "正在创建智能体"
    },
    "file": {
      "editor": {
        "vimMode": "Vim 模式 {{模式}}"
      }
    }
  },
  "toolCallDetails": {
    "subAgentActivity": "子智能体 活动"
  },
  "review": {
    "comment": {
      "label": "审查 评论"
    }
  },
  "settings": {
    "projectList": {
      "hostLoadFailed": "无法从 主机 {{hostName}} 加载 项目：{{message}}",
      "hostLoadTimedOut": "主机 {{hostName}} 未及时响应，请重试。"
    },
    "sections": {
      "layout": "布局"
    },
    "layout": {
      "openInSidePane": {
        "title": "打开位置",
        "destinations": {
          "main": "主面板",
          "side": "侧边面板",
          "explorer": "资源管理器侧栏"
        },
        "sources": {
          "explorerFiles": {
            "label": "在资源管理器中选择文件",
            "description": "在工作区旁打开从资源管理器侧栏选择的文件"
          },
          "diffs": {
            "label": "打开差异",
            "description": "在工作区旁打开来自资源管理器和智能体会话的差异"
          },
          "chatFiles": {
            "label": "从智能体会话打开文件",
            "description": "在会话旁打开文件链接和工具调用涉及的文件"
          },
          "diffFiles": {
            "label": "从改动中打开文件",
            "description": "在差异旁打开所选源文件"
          },
          "subagents": {
            "label": "打开子智能体",
            "description": "在父智能体旁打开子智能体"
          },
          "pullRequests": {
            "label": "从改动中打开拉取请求",
            "description": "在改动旁打开拉取请求详情"
          }
        }
      }
    },
    "notifications": {
      "enabled": "发送系统通知",
      "enabledHint": "任务完成或需要处理时，发送 macOS 系统通知。",
      "disabledHint": "请先开启系统通知再进行测试",
      "island": "灵动岛",
      "islandHint": "在 Mac 屏幕顶部展示 Paseo 未读消息和任务状态。",
      "islandShowWhenFocused": "应用聚焦时仍显示",
      "islandShowWhenFocusedHint": "Paseo 位于前台时也显示灵动岛。",
      "islandTest": "测试灵动岛",
      "islandTestHint": "发送一条测试消息，检查灵动岛是否正常显示。",
      "islandTestTitle": "Paseo 灵动岛测试",
      "islandTestBody": "如果你看到这条消息，说明灵动岛可正常工作。",
      "islandTestSuccess": "测试消息已发送",
      "islandTestSuccessHint": "请查看 Mac 屏幕顶部的 Paseo 灵动岛。",
      "islandTestFailed": "测试发送失败",
      "islandTestFailedHint": "无法发送灵动岛测试消息，请检查设置后重试。"
    },
    "hostSections": {
      "agents": "智能体",
      "assistants": "助手",
      "memory": "记忆",
      "knowledge": "知识",
      "mcp": "MCP",
      "skills": "技能",
      "workspaces": "工作区",
      "providers": "模型提供方",
      "channels": "渠道",
      "terminals": "终端"
    },
    "general": {
      "defaultSend": {
        "descriptions": {
          "interrupt": "智能体 运行时，Enter 会中断。Command/Ctrl+Enter 会排队。",
          "steer": "智能体 运行时，Enter 会引导当前回合。Command/Ctrl+Enter 会排队。",
          "queue": "智能体 运行时，Enter 会排队。Command/Ctrl+Enter 会提交。"
        }
      }
    },
    "diagnostics": {
      "app": {
        "title": "应用诊断",
        "rowTitle": "应用诊断",
        "rowHint": "收集连接、守护进程、模型提供方、桌面端和日志详情",
        "run": "运行",
        "running": "正在诊断...",
        "copyLabel": "诊断信息",
        "copyAccessibility": "复制诊断信息",
        "copyFailed": "复制诊断信息失败",
        "refreshAccessibility": "刷新诊断信息",
        "refreshingAccessibility": "正在刷新诊断信息",
        "progress": {
          "client": "客户端",
          "desktop": "桌面端"
        }
      }
    },
    "about": {
      "connectedHosts": "已连接的 主机",
      "releaseChannel": {
        "stable": "稳定版",
        "beta": "测试版"
      }
    },
    "appearance": {
      "theme": {
        "options": {
          "light": "浅色",
          "dark": "深色",
          "zinc": "锌灰",
          "midnight": "午夜"
        }
      },
      "chatOutline": {
        "title": "历史输入导航",
        "description": "在聊天左侧显示输入节点，悬停预览，点击跳转到对应的历史输入"
      }
    },
    "shortcuts": {
      "sections": {
        "agentInput": "智能体输入"
      },
      "help": {
        "newWorktree": "新建 工作树",
        "interruptAgent": "中断 智能体"
      }
    },
    "integrations": {
      "commandLine": {
        "description": "从终端控制智能体并运行脚本"
      }
    },
    "permissions": {
      "notifications": "通知",
      "actions": {
        "busySuffix": "{{label}}中...",
        "busyExtraAction": "正在{{label}}..."
      }
    },
    "host": {
      "notFound": "主机 未找到",
      "pairDevices": {
        "rowHint": "扫描二维码或复制链接，将手机连接到这个 主机"
      },
      "skills": {
        "sectionTitle": "编排技能",
        "title": "编排技能",
        "description": "教会智能体通过 CLI 编排任务",
        "docs": "技能说明",
        "openDocs": "打开技能说明",
        "unavailable": "连接到此主机后即可管理编排技能",
        "unsupported": "当前主机版本暂不支持编排技能管理，请更新 Paseo 守护进程",
        "statusFailed": "无法检查编排技能状态。",
        "updateFailed": "无法更新编排技能。",
        "uninstallFailed": "无法卸载编排技能。",
        "saveSelectionFailed": "无法保存编排技能选择。",
        "updateTitle": "更新 Paseo 技能？",
        "updateFallback": "将内置技能同步到此主机。",
        "uninstallTitle": "卸载 Paseo 技能？",
        "uninstallMessage": "会从 ~/.agents、~/.claude、~/.codex 移除所有 Paseo 编排技能。",
        "choose": "选择技能",
        "chooseAll": "全部技能",
        "chooseAllHint": "保持安装所有内置技能，包括以后新增的技能。",
        "chooseList": "内置技能",
        "chooseEmpty": "此版本未内置技能。",
        "removeTitle": "移除取消勾选的技能？",
        "saveFailed": "无法保存你的技能选择。"
      },
      "orchestration": {
        "unavailable": "连接到这个 主机 以管理编排",
        "enableTools": {
          "hint": "智能体 将能够管理 工作树、智能体 和计划"
        },
        "systemPrompt": {
          "title": "系统提示词",
          "hint": "为所有智能体添加系统提示词",
          "sheetTitle": "追加系统提示词",
          "accessibilityLabel": "追加系统提示词"
        }
      },
      "agents": {
        "unavailable": "连接到这个 主机 以管理 智能体"
      },
      "workspaces": {
        "unavailable": "连接到这个 主机 以管理 工作区"
      },
      "terminalProfiles": {
        "unavailable": "连接到此主机以管理终端配置",
        "sectionTitle": "终端配置",
        "editProfile": "编辑配置",
        "addProfileTitle": "添加终端配置",
        "editProfileTitle": "编辑终端配置",
        "nameLabel": "名称",
        "commandLabel": "命令",
        "argsLabel": "参数",
        "nameRequired": "名称必填",
        "commandRequired": "命令必填",
        "argsHint": "以空格分隔并传递给命令的参数",
        "saving": "保存中...",
        "remove": "移除",
        "removeConfirmTitle": "移除配置？",
        "removeConfirmMessage": "移除“{{name}}”？",
        "moveUp": "上移",
        "moveDown": "下移",
        "save": "保存",
        "emptyState": "还没有终端配置。添加配置后可使用指定命令启动终端。"
      },
      "agentProfiles": {
        "sectionTitle": "智能体 配置",
        "unavailable": "连接到这个 主机 以管理智能体配置",
        "unsupported": "此主机运行的守护进程尚不支持智能体配置",
        "emptyState": "还没有配置。添加一个以便使用保存的模型提供方和模型启动智能体。",
        "addProfileTitle": "添加智能体配置",
        "editProfileTitle": "编辑智能体配置",
        "providerLabel": "模型提供方",
        "providerPlaceholder": "选择一个模型提供方",
        "noProviders": "此主机上没有可用的模型提供方",
        "modelLabel": "模型",
        "noModels": "此模型提供方没有可选择的模型",
        "modeLabel": "模式",
        "noModes": "此模型提供方没有可选择的模式",
        "thinkingLabel": "思考级别",
        "noThinkingOptions": "此模型没有可用的思考级别",
        "featuresLabel": "功能",
        "featureCount": "{{count}} 个功能",
        "featureCountOne": "{{count}} 个功能",
        "notesHint": "帮助智能体在启动另一个智能体时选择此配置。"
      },
      "daemon": {
        "rename": {
          "title": "重命名 主机",
          "placeholder": "我的 主机"
        },
        "restart": {
          "title": "重启 守护进程",
          "hint": "重启守护进程。应用会自动重新连接",
          "confirmMessage": "这会重启 守护进程。其上运行的智能体会继续运行；应用会自动重新连接。",
          "unavailableTitle": "主机 不可用",
          "unavailableMessage": "这个 主机 尚未连接。请等待它上线后再重启。",
          "offlineTitle": "主机 离线",
          "offlineMessage": "这个 主机 已离线。Paseo 会自动重连，请等它恢复在线后再重启。",
          "requestFailedMessage": "发送重启请求失败。Paseo 会自动重连，请在 主机 显示在线后重试。"
        },
        "update": {
          "desktopManagedHint": "此守护进程由 Paseo Desktop 管理。请在主机上更新 Paseo Desktop。",
          "title": "更新守护进程",
          "hint": "将守护进程更新到最新版本并重启",
          "confirm": "更新",
          "confirmTitle": "更新 {{name}}",
          "confirmMessage": "这会将守护进程更新到最新版本并重启，正在运行的智能体会短暂中断。",
          "updating": "正在更新...",
          "phaseStarting": "正在准备更新...",
          "phaseDownloading": "正在下载软件包...",
          "phaseInstalling": "正在安装...",
          "phaseComplete": "更新完成，正在重启...",
          "unableToReconnectTitle": "无法重新连接",
          "unableToReconnectMessage": "{{name}} 更新后未恢复在线，请确认守护进程已重启。",
          "unavailableTitle": "主机不可用",
          "unavailableMessage": "此主机尚未连接，请等待其上线后再更新。",
          "offlineTitle": "主机离线",
          "offlineMessage": "此主机已离线，请等待其恢复在线后再更新。",
          "requestFailedTitle": "更新失败",
          "requestFailedMessage": "更新守护进程失败：{{error}}",
          "dialogFailedMessage": "无法打开更新确认对话框。"
        },
        "remove": {
          "title": "移除 主机",
          "hint": "从此设备移除这个 主机 及其已保存连接",
          "localHint": "从此设备移除 localhost，并停止内置 守护进程",
          "localConfirmTitle": "移除 localhost 连接并停止 守护进程？",
          "localConfirmMessage": "这会移除 localhost 连接、关闭内置守护进程管理，并停止托管守护进程。远程主机会保持连接。",
          "errorMessage": "无法移除 主机"
        }
      }
    },
    "providers": {
      "title": "模型提供方",
      "addProvider": "添加模型提供方",
      "providerDetails": "{{name}} 模型提供方详情",
      "unavailable": "连接到此主机以查看模型提供方",
      "addErrorTitle": "无法添加模型提供方",
      "updateErrorTitle": "无法更新模型提供方",
      "actions": {
        "menu": "{{name}} 操作",
        "remove": "移除模型提供方",
        "removing": "正在移除..."
      },
      "remove": {
        "confirmTitle": "移除 {{name}}？",
        "confirmMessage": "这会从 config.json 中删除该模型提供方配置，且无法撤销。",
        "confirm": "移除",
        "errorTitle": "无法移除模型提供方"
      },
      "models": {
        "one": "1 个模型",
        "many": "{{count}} 个模型",
        "addModel": "添加 模型",
        "addCustomTitle": "添加自定义 模型",
        "modelId": "模型 ID",
        "failedToSave": "保存 模型 失败",
        "searchPlaceholder": "搜索 模型",
        "loading": "正在加载 模型...",
        "noSearchMatches": "没有匹配搜索的 模型",
        "noneDetected": "未检测到 模型",
        "custom": "自定义 模型"
      }
    },
    "project": {
      "noEditableTarget": "此项目无法在这个主机上编辑。",
      "backToProjects": "返回项目列表",
      "edit": {
        "title": "编辑项目",
        "nameLabel": "项目名称",
        "savedToast": "项目已更新"
      },
      "readFailures": {
        "missingTitle": "这个主机没有此项目",
        "missingSingleHost": "所选主机没有此项目的记录。",
        "transportFallback": "主机没有响应。"
      },
      "worktree": {
        "title": "工作树生命周期钩子",
        "info": "为此项目创建或清理工作树时运行的命令",
        "setup": "初始化",
        "setupAccessibility": "工作树初始化命令",
        "teardown": "清理",
        "teardownAccessibility": "工作树清理命令"
      },
      "scripts": {
        "title": "脚本",
        "info": "可从此项目中的任意智能体启动的长期服务和一次性命令",
        "empty": "还没有脚本。",
        "untitled": "未命名脚本",
        "menuAccessibility": "打开脚本菜单",
        "removeTitle": "移除脚本？",
        "removeFallbackName": "此脚本",
        "nameAccessibility": "脚本名称",
        "commandAccessibility": "脚本命令",
        "newScript": "新建脚本",
        "actions": {
          "add": "添加脚本"
        }
      },
      "metadata": {
        "info": "注入到 Paseo 元数据生成提示词中的项目专属指令，可用于强制执行团队约定，例如分支命名、提交风格或合并请求格式",
        "pullRequest": "合并请求",
        "pullRequestPlaceholder": "先写一段摘要，并包含测试计划部分"
      },
      "actions": {
        "saved": "项目已保存"
      }
    }
  }
} as const;
