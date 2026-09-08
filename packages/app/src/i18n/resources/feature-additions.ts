// Restores feature-branch translations that were lost while rebasing onto upstream.
// Keep these additions separate so upstream resource updates can be merged without dropping Paseo features.
export const featureTranslationAdditions = {
  en: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "Edit queued message",
        save: "Save queued message",
        cancelEdit: "Cancel editing queued message",
        remove: "Remove queued message",
        moveUp: "Move queued message up",
        moveDown: "Move queued message down",
        steer: "Steer",
      },
    },
    agentControls: {
      memory: {
        title: "Conversation memory",
        open: "Configure conversation memory",
        enabledTitle: "Use memory in this conversation",
        enabledHint:
          "When off, this Agent neither reads existing memory nor learns new memory from the conversation.",
        instructionsTitle: "What should Paseo remember from this conversation?",
        instructionsHint:
          "Add durable topics to prioritize, such as confirmed conclusions, recurring preferences, or decisions. Temporary logs, guesses, and secrets are still excluded.",
        instructionsPlaceholder:
          "Example: Remember confirmed root causes and final decisions. Ignore intermediate experiments.",
        save: "Save",
        saving: "Saving...",
        saved: "Saved",
        saveError: "Couldn't save conversation memory",
      },
    },
    agentStream: {
      scrollToOldest: "Jump to first message",
      locatingOldest: "Locating first message",
      chatOutline: {
        question: "Question",
        answer: "Answer",
        model: "Model",
        time: "Time",
        pendingAnswer: "Waiting for an answer",
        unknownModel: "Unknown model",
      },
      reasoningTranslation: {
        translating: "Translating reasoning to Chinese...",
        failed: "Reasoning translation failed.",
        unavailable: "This Paseo server does not support reasoning translation.",
      },
      process: {
        show: "Show process",
        hide: "Hide process",
        processed: "Processed",
        processedWithDuration: "Processed {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "No sessions for this project",
      projectFilter: {
        label: "Project",
        title: "Filter by project",
        all: "All projects",
        empty: "No projects available",
        search: "Search projects",
        hostCount: "{{count}} hosts",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "Sort by",
          activity: "Recent activity",
          name: "Project name",
          manual: "Manual",
        },
      },
      actions: {
        collapseAllWorkspaces: "Collapse all Projects",
        expandAllWorkspaces: "Expand all Projects",
      },
      project: {
        actions: {
          hide: "Hide project",
          show: "Show project",
        },
        hidden: {
          title: "Hidden projects ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "Delete workspace",
          removing: "Deleting...",
        },
        bulkArchive: {
          select: "Select workspaces",
          selected: "{{count}} selected",
          cancel: "Cancel selection",
          title: "Archive {{count}} workspaces?",
          message: "The selected workspaces will be archived and removed from the sidebar.",
          riskyWorktrees:
            "{{count}} selected worktree(s) have uncommitted or unpushed changes. Their directories may be deleted.",
          confirm: "Archive selected",
          failed: "Failed to archive {{count}} workspace(s)",
          removeTitle: "Delete {{count}} workspaces?",
          removeMessage:
            "Permanently delete the Paseo-managed data for the selected workspaces?\n\nExternal source directories and all files in them will not be deleted or modified. This cannot be undone.",
          removeConfirm: "Delete selected",
          removeFailed: "Failed to delete {{count}} workspace(s)",
          removeUnsupported:
            "{{count}} selected workspace(s) cannot be deleted until their Host is updated",
        },
        confirmations: {
          removeTitle: "Delete workspace?",
          removeMessage:
            'Permanently delete "{{workspaceName}}" and its Paseo-managed data at ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}?\n\nThe external source directory and all files in it will not be deleted or modified. This cannot be undone.',
          removeConfirm: "Delete",
        },
        toasts: {
          removeFailed: "Failed to delete workspace",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "Working on the task...",
        dockTest: "Test Dock alert",
        dockTestHint:
          "Bounce the Dock icon, show the attention badge, and play the configured alert sound.",
        dockTestSuccess: "Dock alert triggered",
        dockTestSuccessHint: "Check the Paseo icon in the macOS Dock.",
        dockTestFailed: "Unable to test Dock alert",
        dockTestFailedHint: "Dock alerts are available in the Paseo app on macOS.",
      },
      general: {
        clientIdentity: {
          hostname: "Client hostname",
          hostnameDescription: "Shown in the daemon's client management page",
          editHostname: "Edit client hostname",
          editHostnameTitle: "Edit client hostname",
          hostnamePlaceholder: "My Mac",
          identityId: "Client identity ID",
          identityIdDescription: "Unique identity for this Paseo client; it cannot be changed",
          unavailable: "Unavailable",
        },
        aidenClaudeReasoningTranslation: {
          label: "Translate Aiden Claude reasoning to Chinese",
          description:
            "Show only the Simplified Chinese translation of Aiden Claude reasoning. Turn this off to show the original text.",
        },
      },
      permissions: {
        test: "Test",
        backgroundAttention: {
          title: "Background attention",
          soundVolume: "Alert sound volume",
          description:
            "When any connected local or remote host finishes a task or needs user intervention while Paseo is unfocused, bounce the Dock icon, play a sound, and show an attention badge.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint:
              "Leave empty to derive it automatically from the listen address and current LAN IP.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "Identity information",
            serverId: "Server identity ID",
            serverIdDescription: "Unique identity for this daemon; it cannot be changed",
          },
        },
      },
      project: {
        switchHost: "Switch host",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "No Project directory",
          description:
            "You can edit this Project's name, icon, and memory. Settings stored in paseo.json become available after the Project is attached to a directory.",
        },
        memory: {
          title: "Project memory",
          info: "Control whether this Project contributes scoped memory and define what durable Project knowledge Paseo should learn.",
          policyTitle: "Memory rules",
          enabledTitle: "Use memory for this Project",
          enabledHint:
            "When off, Agents in this Project do not read or create Project-scoped memory. Global memory remains available.",
          instructionsTitle: "What should Paseo remember for this Project?",
          instructionsHint:
            "Describe durable Project knowledge such as conventions, architecture decisions, recurring procedures, and stable environment facts.",
          instructionsPlaceholder:
            "Example: Remember architecture decisions and release procedures. Ignore temporary failures, raw logs, and secrets.",
          save: "Save",
          saving: "Saving...",
          saved: "Saved",
          saveError: "Couldn't save Project memory",
          content: {
            title: "Memory content",
            description:
              "View, edit, or delete long-term memory saved for this Project. Project is the finest-grained memory scope.",
            scope: "Memory scope",
            scopes: {
              project: "Current Project",
              workspace: "Workspace",
            },
            selectScope: "Select a memory scope",
            noScopes: "No memory scopes available",
            selectWorkspace: "Select a Workspace",
            noWorkspace: "This Project has no available Workspaces",
            loading: "Loading memory...",
            empty: "No memories in this scope match the current filters",
            errorTitle: "Unable to manage Project memory",
            deleteTitle: "Delete “{{title}}”?",
            deleteDescription: "This memory and its source information cannot be recovered.",
            deleteConfirm: "Delete",
          },
        },
        rename: {
          renamedToast: "Project renamed",
          errorFallback: "Couldn't rename project",
          renameLabel: "Rename project",
          resetLabel: "Reset project name to default",
          projectNameLabel: "Project name",
          saveLabel: "Save project name",
          cancelLabel: "Cancel renaming",
          reset: "Reset",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  ar: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "تحرير الرسالة في قائمة الانتظار",
        save: "حفظ الرسالة في قائمة الانتظار",
        cancelEdit: "إلغاء تحرير الرسالة",
        remove: "إزالة الرسالة من قائمة الانتظار",
        moveUp: "نقل الرسالة لأعلى",
        moveDown: "نقل الرسالة لأسفل",
        steer: "توجيه",
      },
    },
    agentControls: {
      memory: {
        title: "ذاكرة المحادثة",
        open: "إعداد ذاكرة المحادثة",
        enabledTitle: "استخدام الذاكرة في هذه المحادثة",
        enabledHint:
          "عند الإيقاف، لا يقرأ هذا الوكيل الذاكرة الحالية ولا يتعلم ذاكرة جديدة من المحادثة.",
        instructionsTitle: "ماذا يجب أن يتذكر Paseo من هذه المحادثة؟",
        instructionsHint:
          "حدد الاستنتاجات المؤكدة أو التفضيلات المتكررة أو القرارات. تبقى السجلات المؤقتة والتخمينات والأسرار مستبعدة.",
        instructionsPlaceholder:
          "مثال: تذكر الأسباب المؤكدة والقرارات النهائية وتجاهل التجارب الوسيطة.",
        save: "حفظ",
        saving: "جارٍ الحفظ...",
        saved: "تم الحفظ",
        saveError: "تعذر حفظ ذاكرة المحادثة",
      },
    },
    agentStream: {
      scrollToOldest: "انتقل إلى الرسالة الأولى",
      locatingOldest: "جارٍ تحديد الرسالة الأولى",
      reasoningTranslation: {
        translating: "جارٍ ترجمة التفكير إلى الصينية...",
        failed: "فشلت ترجمة التفكير.",
        unavailable: "خادم Paseo الحالي لا يدعم ترجمة التفكير.",
      },
      process: {
        show: "إظهار العملية",
        hide: "إخفاء العملية",
        processed: "تمت المعالجة",
        processedWithDuration: "تمت المعالجة {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "لا توجد جلسات لهذا المشروع",
      projectFilter: {
        label: "المشروع",
        title: "تصفية حسب المشروع",
        all: "كل المشاريع",
        empty: "لا توجد مشاريع متاحة",
        search: "البحث في المشاريع",
        hostCount: "{{count}} مضيفين",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "الترتيب حسب",
          activity: "النشاط الأخير",
          name: "اسم المشروع",
          manual: "يدوي",
        },
      },
      actions: {
        collapseAllWorkspaces: "طي جميع مساحات العمل",
        expandAllWorkspaces: "توسيع جميع مساحات العمل",
      },
      project: {
        actions: {
          hide: "إخفاء المشروع",
          show: "إظهار المشروع",
        },
        hidden: {
          title: "المشاريع المخفية ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "حذف مساحة العمل",
          removing: "جارٍ الحذف...",
        },
        bulkArchive: {
          select: "تحديد مساحات العمل",
          selected: "تم تحديد {{count}}",
          cancel: "إلغاء التحديد",
          title: "أرشفة {{count}} من مساحات العمل؟",
          message: "ستتم أرشفة مساحات العمل المحددة وإزالتها من الشريط الجانبي.",
          riskyWorktrees:
            "تحتوي {{count}} من أشجار العمل المحددة على تغييرات غير ملتزم بها أو غير مدفوعة. قد يتم حذف أدلتها.",
          confirm: "أرشفة المحدد",
          failed: "فشلت أرشفة {{count}} من مساحات العمل",
        },
        confirmations: {
          removeTitle: "حذف مساحة العمل؟",
          removeMessage:
            'هل تريد حذف "{{workspaceName}}" وبيانات Paseo الخاصة بها نهائيًا من ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}؟\n\nلن يتم حذف دليل الشفرة الخارجي المرتبط أو تعديل أي ملفات بداخله. لا يمكن التراجع عن هذا الإجراء.',
          removeConfirm: "حذف",
        },
        toasts: {
          removeFailed: "فشل حذف مساحة العمل",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "جارٍ تنفيذ المهمة...",
      },
      general: {
        clientIdentity: {
          hostname: "اسم مضيف العميل",
          hostnameDescription: "يظهر في صفحة إدارة عملاء daemon",
          editHostname: "تعديل اسم مضيف العميل",
          editHostnameTitle: "تعديل اسم مضيف العميل",
          hostnamePlaceholder: "جهاز Mac الخاص بي",
          identityId: "معرّف هوية العميل",
          identityIdDescription: "هوية فريدة لعميل Paseo هذا ولا يمكن تعديلها",
          unavailable: "غير متاح",
        },
        aidenClaudeReasoningTranslation: {
          label: "ترجمة تفكير Aiden Claude إلى الصينية",
          description: "عرض الترجمة الصينية المبسطة فقط، أو النص الأصلي عند إيقافها.",
        },
      },
      permissions: {
        test: "امتحان",
        backgroundAttention: {
          title: "تنبيهات الخلفية",
          soundVolume: "مستوى صوت التنبيه",
          description:
            "ينبهك Paseo عندما يكمل مضيف محلي أو بعيد متصل مهمة أو يحتاج إلى تدخل المستخدم.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint: "Leave empty to generate it automatically.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "معلومات الهوية",
            serverId: "معرّف هوية الخادم",
            serverIdDescription: "هوية فريدة لـ daemon ولا يمكن تعديلها",
          },
        },
      },
      project: {
        switchHost: "تبديل المضيف",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "لا يوجد مجلد للمشروع",
          description:
            "يمكنك تعديل اسم المشروع وأيقونته وذاكرته. تصبح الإعدادات المخزنة في paseo.json متاحة بعد ربط المشروع بمجلد.",
        },
        memory: {
          title: "ذاكرة المشروع",
          info: "تحكم في ذاكرة هذا المشروع وحدد المعرفة الدائمة التي يجب أن يتعلمها Paseo.",
          policyTitle: "قواعد الذاكرة",
          enabledTitle: "استخدام الذاكرة لهذا المشروع",
          enabledHint:
            "عند الإيقاف، لا تقرأ الوكلاء ذاكرة المشروع ولا تنشئها. تبقى الذاكرة العامة متاحة.",
          instructionsTitle: "ماذا يجب أن يتذكر Paseo لهذا المشروع؟",
          instructionsHint:
            "صف الاتفاقيات وقرارات البنية والإجراءات المتكررة وحقائق البيئة المستقرة.",
          instructionsPlaceholder:
            "مثال: تذكر قرارات البنية وإجراءات الإصدار وتجاهل الأعطال المؤقتة والسجلات والأسرار.",
          save: "حفظ",
          saving: "جارٍ الحفظ...",
          saved: "تم الحفظ",
          saveError: "تعذر حفظ ذاكرة المشروع",
          content: {
            title: "محتوى الذاكرة",
            description:
              "اعرض أو عدّل أو احذف الذاكرة طويلة المدى لهذا المشروع ومساحات العمل التابعة له. لا يمكن تغيير نطاق الذاكرة هنا.",
            scope: "نطاق الذاكرة",
            scopes: {
              project: "المشروع الحالي",
              workspace: "مساحة العمل",
            },
            selectScope: "اختر نطاق الذاكرة",
            noScopes: "لا توجد نطاقات ذاكرة متاحة",
            selectWorkspace: "اختر مساحة عمل",
            noWorkspace: "لا توجد مساحات عمل متاحة لهذا المشروع",
            loading: "جارٍ تحميل الذاكرة...",
            empty: "لا توجد ذكريات مطابقة في هذا النطاق",
            errorTitle: "تعذر إدارة ذاكرة المشروع",
            deleteTitle: "حذف «{{title}}»؟",
            deleteDescription: "لا يمكن استعادة هذه الذاكرة ومعلومات مصدرها.",
            deleteConfirm: "حذف",
          },
        },
        rename: {
          renamedToast: "تمت إعادة تسمية المشروع",
          errorFallback: "تعذرت إعادة تسمية المشروع",
          renameLabel: "إعادة تسمية المشروع",
          resetLabel: "إعادة تعيين اسم المشروع إلى الافتراضي",
          projectNameLabel: "اسم المشروع",
          saveLabel: "احفظ اسم المشروع",
          cancelLabel: "إلغاء إعادة التسمية",
          reset: "إعادة ضبط",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  es: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "Editar mensaje en cola",
        save: "Guardar mensaje en cola",
        cancelEdit: "Cancelar edición del mensaje",
        remove: "Quitar mensaje de la cola",
        moveUp: "Mover mensaje hacia arriba",
        moveDown: "Mover mensaje hacia abajo",
        steer: "Guiar",
      },
    },
    agentControls: {
      memory: {
        title: "Memoria de la conversación",
        open: "Configurar memoria de la conversación",
        enabledTitle: "Usar memoria en esta conversación",
        enabledHint:
          "Si se desactiva, este agente no leerá memoria existente ni aprenderá memoria nueva de la conversación.",
        instructionsTitle: "¿Qué debe recordar Paseo de esta conversación?",
        instructionsHint:
          "Indica temas duraderos como conclusiones confirmadas, preferencias recurrentes o decisiones. Los registros temporales, suposiciones y secretos se excluyen.",
        instructionsPlaceholder:
          "Ejemplo: recordar causas confirmadas y decisiones finales; ignorar experimentos intermedios.",
        save: "Guardar",
        saving: "Guardando...",
        saved: "Guardado",
        saveError: "No se pudo guardar la memoria de la conversación",
      },
    },
    agentStream: {
      scrollToOldest: "Ir al primer mensaje",
      locatingOldest: "Buscando el primer mensaje",
      reasoningTranslation: {
        translating: "Traduciendo el razonamiento al chino...",
        failed: "No se pudo traducir el razonamiento.",
        unavailable: "Este servidor de Paseo no admite la traducción del razonamiento.",
      },
      process: {
        show: "Mostrar proceso",
        hide: "Ocultar proceso",
        processed: "Procesado",
        processedWithDuration: "Procesado {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "No hay sesiones para este proyecto",
      projectFilter: {
        label: "Proyecto",
        title: "Filtrar por proyecto",
        all: "Todos los proyectos",
        empty: "No hay proyectos disponibles",
        search: "Buscar proyectos",
        hostCount: "{{count}} hosts",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "Ordenar por",
          activity: "Actividad reciente",
          name: "Nombre del proyecto",
          manual: "Manual",
        },
      },
      actions: {
        collapseAllWorkspaces: "Contraer todos los espacios de trabajo",
        expandAllWorkspaces: "Expandir todos los espacios de trabajo",
      },
      project: {
        actions: {
          hide: "Ocultar proyecto",
          show: "Mostrar proyecto",
        },
        hidden: {
          title: "Proyectos ocultos ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "Eliminar espacio de trabajo",
          removing: "Eliminando...",
        },
        bulkArchive: {
          select: "Seleccionar espacios de trabajo",
          selected: "{{count}} seleccionados",
          cancel: "Cancelar selección",
          title: "¿Archivar {{count}} espacios de trabajo?",
          message:
            "Los espacios de trabajo seleccionados se archivarán y se quitarán de la barra lateral.",
          riskyWorktrees:
            "{{count}} worktree(s) seleccionados tienen cambios sin confirmar o sin enviar. Sus directorios podrían eliminarse.",
          confirm: "Archivar seleccionados",
          failed: "No se pudieron archivar {{count}} espacios de trabajo",
        },
        confirmations: {
          removeTitle: "¿Eliminar espacio de trabajo?",
          removeMessage:
            '¿Eliminar permanentemente "{{workspaceName}}" y sus datos administrados por Paseo en ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}?\n\nEl directorio de código externo asociado y sus archivos no se eliminarán ni modificarán. Esta acción no se puede deshacer.',
          removeConfirm: "Eliminar",
        },
        toasts: {
          removeFailed: "No se pudo eliminar el espacio de trabajo",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "Procesando la tarea...",
      },
      general: {
        clientIdentity: {
          hostname: "Nombre del host cliente",
          hostnameDescription: "Se muestra en la gestión de clientes del daemon",
          editHostname: "Editar nombre del host cliente",
          editHostnameTitle: "Editar nombre del host cliente",
          hostnamePlaceholder: "Mi Mac",
          identityId: "ID de identidad del cliente",
          identityIdDescription: "Identidad única de este cliente Paseo; no se puede modificar",
          unavailable: "No disponible",
        },
        aidenClaudeReasoningTranslation: {
          label: "Traducir el razonamiento de Aiden Claude al chino",
          description:
            "Muestra solo la traducción al chino simplificado; al desactivarlo muestra el texto original.",
        },
      },
      permissions: {
        test: "Prueba",
        backgroundAttention: {
          title: "Avisos en segundo plano",
          soundVolume: "Volumen del sonido de aviso",
          description:
            "Paseo te avisa cuando un host local o remoto conectado termina una tarea o necesita la intervención del usuario.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint: "Leave empty to generate it automatically.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "Información de identidad",
            serverId: "ID de identidad del servidor",
            serverIdDescription: "Identidad única de este daemon; no se puede modificar",
          },
        },
      },
      project: {
        switchHost: "Cambiar de anfitrión",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "El proyecto no tiene directorio",
          description:
            "Puedes editar el nombre, el icono y la memoria del proyecto. Los ajustes guardados en paseo.json estarán disponibles al asociar un directorio.",
        },
        memory: {
          title: "Memoria del proyecto",
          info: "Controla la memoria de este proyecto y define qué conocimiento duradero debe aprender Paseo.",
          policyTitle: "Reglas de memoria",
          enabledTitle: "Usar memoria para este proyecto",
          enabledHint:
            "Si se desactiva, los agentes no leerán ni crearán memoria del proyecto. La memoria global seguirá disponible.",
          instructionsTitle: "¿Qué debe recordar Paseo para este proyecto?",
          instructionsHint:
            "Describe convenciones, decisiones de arquitectura, procedimientos recurrentes y datos estables del entorno.",
          instructionsPlaceholder:
            "Ejemplo: recordar decisiones de arquitectura y procesos de publicación; ignorar fallos temporales, registros y secretos.",
          save: "Guardar",
          saving: "Guardando...",
          saved: "Guardado",
          saveError: "No se pudo guardar la memoria del proyecto",
          content: {
            title: "Contenido de memoria",
            description:
              "Consulta, edita o elimina la memoria a largo plazo de este proyecto y sus espacios de trabajo. Aquí no se puede cambiar el ámbito.",
            scope: "Ámbito de memoria",
            scopes: {
              project: "Proyecto actual",
              workspace: "Espacio de trabajo",
            },
            selectScope: "Selecciona un ámbito de memoria",
            noScopes: "No hay ámbitos de memoria disponibles",
            selectWorkspace: "Selecciona un espacio de trabajo",
            noWorkspace: "Este proyecto no tiene espacios de trabajo disponibles",
            loading: "Cargando memoria...",
            empty: "No hay memorias que coincidan en este ámbito",
            errorTitle: "No se pudo gestionar la memoria del proyecto",
            deleteTitle: "¿Eliminar «{{title}}»?",
            deleteDescription: "Esta memoria y la información de su origen no se pueden recuperar.",
            deleteConfirm: "Eliminar",
          },
        },
        rename: {
          renamedToast: "Proyecto renombrado",
          errorFallback: "No se pudo cambiar el nombre del proyecto",
          renameLabel: "Cambiar nombre del proyecto",
          resetLabel: "Restablecer el nombre del proyecto al valor predeterminado",
          projectNameLabel: "Nombre del proyecto",
          saveLabel: "Guardar nombre del proyecto",
          cancelLabel: "Cancelar cambio de nombre",
          reset: "Reiniciar",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Variables del proyecto",
          info: "Las variables están disponibles en las plantillas como {{variableName}}.",
          empty: "No hay variables configuradas.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  fr: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "Modifier le message en file d'attente",
        save: "Enregistrer le message en file d'attente",
        cancelEdit: "Annuler la modification du message",
        remove: "Retirer le message de la file d'attente",
        moveUp: "Déplacer le message vers le haut",
        moveDown: "Déplacer le message vers le bas",
        steer: "Guider",
      },
    },
    agentControls: {
      memory: {
        title: "Mémoire de la conversation",
        open: "Configurer la mémoire de la conversation",
        enabledTitle: "Utiliser la mémoire dans cette conversation",
        enabledHint:
          "Si elle est désactivée, cet agent ne lit aucune mémoire existante et n'apprend rien de cette conversation.",
        instructionsTitle: "Que doit retenir Paseo de cette conversation ?",
        instructionsHint:
          "Indiquez les conclusions confirmées, préférences récurrentes ou décisions à conserver. Les journaux temporaires, suppositions et secrets restent exclus.",
        instructionsPlaceholder:
          "Exemple : retenir les causes confirmées et les décisions finales, ignorer les essais intermédiaires.",
        save: "Enregistrer",
        saving: "Enregistrement...",
        saved: "Enregistré",
        saveError: "Impossible d'enregistrer la mémoire de la conversation",
      },
    },
    agentStream: {
      scrollToOldest: "Aller au premier message",
      locatingOldest: "Recherche du premier message",
      reasoningTranslation: {
        translating: "Traduction du raisonnement en chinois...",
        failed: "Échec de la traduction du raisonnement.",
        unavailable: "Ce serveur Paseo ne prend pas en charge la traduction du raisonnement.",
      },
      process: {
        show: "Afficher le processus",
        hide: "Masquer le processus",
        processed: "Traité",
        processedWithDuration: "Traité en {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "Aucune séance pour ce projet",
      projectFilter: {
        label: "Projet",
        title: "Filtrer par projet",
        all: "Tous les projets",
        empty: "Aucun projet disponible",
        search: "Rechercher des projets",
        hostCount: "{{count}} hôtes",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "Trier par",
          activity: "Activité récente",
          name: "Nom du projet",
          manual: "Manuel",
        },
      },
      actions: {
        collapseAllWorkspaces: "Réduire tous les espaces de travail",
        expandAllWorkspaces: "Développer tous les espaces de travail",
      },
      project: {
        actions: {
          hide: "Masquer le projet",
          show: "Afficher le projet",
        },
        hidden: {
          title: "Projets masqués ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "Supprimer l’espace de travail",
          removing: "Suppression...",
        },
        bulkArchive: {
          select: "Sélectionner des espaces de travail",
          selected: "{{count}} sélectionnés",
          cancel: "Annuler la sélection",
          title: "Archiver {{count}} espaces de travail ?",
          message:
            "Les espaces de travail sélectionnés seront archivés et retirés de la barre latérale.",
          riskyWorktrees:
            "{{count}} worktree(s) sélectionnés contiennent des modifications non validées ou non envoyées. Leurs dossiers peuvent être supprimés.",
          confirm: "Archiver la sélection",
          failed: "Échec de l’archivage de {{count}} espaces de travail",
        },
        confirmations: {
          removeTitle: "Supprimer l’espace de travail ?",
          removeMessage:
            "Supprimer définitivement « {{workspaceName}} » et ses données gérées par Paseo dans ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}} ?\n\nLe répertoire de code externe associé et ses fichiers ne seront ni supprimés ni modifiés. Cette action est irréversible.",
          removeConfirm: "Supprimer",
        },
        toasts: {
          removeFailed: "Échec de la suppression de l’espace de travail",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "Traitement de la tâche...",
      },
      general: {
        clientIdentity: {
          hostname: "Nom d’hôte du client",
          hostnameDescription: "Affiché dans la gestion des clients du daemon",
          editHostname: "Modifier le nom d’hôte du client",
          editHostnameTitle: "Modifier le nom d’hôte du client",
          hostnamePlaceholder: "Mon Mac",
          identityId: "ID d’identité du client",
          identityIdDescription: "Identité unique de ce client Paseo, non modifiable",
          unavailable: "Indisponible",
        },
        aidenClaudeReasoningTranslation: {
          label: "Traduire le raisonnement Aiden Claude en chinois",
          description:
            "Afficher uniquement la traduction en chinois simplifié, sinon le texte original.",
        },
      },
      permissions: {
        test: "Test",
        backgroundAttention: {
          title: "Alertes en arrière-plan",
          soundVolume: "Volume du son d’alerte",
          description:
            "Paseo vous avertit lorsqu’un hôte local ou distant connecté termine une tâche ou nécessite l’intervention de l’utilisateur.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint: "Leave empty to generate it automatically.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "Informations d’identité",
            serverId: "ID d’identité du serveur",
            serverIdDescription: "Identité unique de ce daemon, non modifiable",
          },
        },
      },
      project: {
        switchHost: "Changer d'hôte",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "Aucun dossier de projet",
          description:
            "Vous pouvez modifier le nom, l’icône et la mémoire du projet. Les réglages stockés dans paseo.json seront disponibles après l’association d’un dossier.",
        },
        memory: {
          title: "Mémoire du projet",
          info: "Contrôlez la mémoire propre à ce projet et définissez les connaissances durables que Paseo doit apprendre.",
          policyTitle: "Règles de mémoire",
          enabledTitle: "Utiliser la mémoire pour ce projet",
          enabledHint:
            "Si elle est désactivée, les agents ne lisent ni ne créent de mémoire de projet. La mémoire globale reste disponible.",
          instructionsTitle: "Que doit retenir Paseo pour ce projet ?",
          instructionsHint:
            "Décrivez les conventions, décisions d'architecture, procédures récurrentes et faits stables de l'environnement.",
          instructionsPlaceholder:
            "Exemple : retenir les décisions d'architecture et les procédures de publication, ignorer les erreurs temporaires, journaux et secrets.",
          save: "Enregistrer",
          saving: "Enregistrement...",
          saved: "Enregistré",
          saveError: "Impossible d'enregistrer la mémoire du projet",
          content: {
            title: "Contenu de la mémoire",
            description:
              "Affichez, modifiez ou supprimez la mémoire à long terme de ce projet et de ses espaces de travail. La portée ne peut pas être modifiée ici.",
            scope: "Portée de la mémoire",
            scopes: {
              project: "Projet actuel",
              workspace: "Espace de travail",
            },
            selectScope: "Sélectionner une portée",
            noScopes: "Aucune portée disponible",
            selectWorkspace: "Sélectionner un espace de travail",
            noWorkspace: "Ce projet ne contient aucun espace de travail disponible",
            loading: "Chargement de la mémoire...",
            empty: "Aucune mémoire correspondante dans cette portée",
            errorTitle: "Impossible de gérer la mémoire du projet",
            deleteTitle: "Supprimer « {{title}} » ?",
            deleteDescription:
              "Cette mémoire et les informations sur sa source ne pourront pas être récupérées.",
            deleteConfirm: "Supprimer",
          },
        },
        rename: {
          renamedToast: "Projet renommé",
          errorFallback: "Impossible de renommer le projet",
          renameLabel: "Renommer le projet",
          resetLabel: "Réinitialiser le nom du projet par défaut",
          projectNameLabel: "Nom du projet",
          saveLabel: "Enregistrer le nom du projet",
          cancelLabel: "Annuler le changement de nom",
          reset: "Réinitialiser",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  ja: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "キューのメッセージを編集",
        save: "キューのメッセージを保存",
        cancelEdit: "メッセージの編集をキャンセル",
        remove: "キューからメッセージを削除",
        moveUp: "メッセージを上へ移動",
        moveDown: "メッセージを下へ移動",
        steer: "誘導",
      },
    },
    agentControls: {
      memory: {
        title: "会話メモリ",
        open: "会話メモリを設定",
        enabledTitle: "この会話でメモリを使用",
        enabledHint:
          "無効にすると、このエージェントは既存メモリを参照せず、会話から新しいメモリも学習しません。",
        instructionsTitle: "この会話から Paseo に何を記憶させますか？",
        instructionsHint:
          "確定した結論、繰り返し現れる設定、最終決定など長期的な情報を指定します。一時ログ、推測、秘密情報は除外されます。",
        instructionsPlaceholder: "例：確定した原因と最終決定を記憶し、途中の実験は無視する。",
        save: "保存",
        saving: "保存中...",
        saved: "保存しました",
        saveError: "会話メモリを保存できませんでした",
      },
    },
    agentStream: {
      scrollToOldest: "最初のメッセージに移動",
      locatingOldest: "最初のメッセージを検索中",
      reasoningTranslation: {
        translating: "思考プロセスを中国語に翻訳しています...",
        failed: "思考プロセスの翻訳に失敗しました。",
        unavailable: "現在の Paseo サーバーは思考翻訳に対応していません。",
      },
      process: {
        show: "プロセスを表示",
        hide: "プロセスを非表示",
        processed: "処理済み",
        processedWithDuration: "処理済み {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "このプロジェクトのセッションはありません",
      projectFilter: {
        label: "プロジェクト",
        title: "プロジェクトで絞り込む",
        all: "すべてのプロジェクト",
        empty: "利用可能なプロジェクトがありません",
        search: "プロジェクトを検索",
        hostCount: "{{count}} 台のホスト",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "並び順",
          activity: "最近のアクティビティ",
          name: "プロジェクト名",
          manual: "手動",
        },
      },
      actions: {
        collapseAllWorkspaces: "すべてのワークスペースを折りたたむ",
        expandAllWorkspaces: "すべてのワークスペースを展開",
      },
      project: {
        actions: {
          hide: "プロジェクトを非表示",
          show: "プロジェクトを表示",
        },
        hidden: {
          title: "非表示のプロジェクト（{{count}}）",
        },
      },
      workspace: {
        actions: {
          remove: "ワークスペースを削除",
          removing: "削除中...",
        },
        bulkArchive: {
          select: "ワークスペースを選択",
          selected: "{{count}} 件選択中",
          cancel: "選択を解除",
          title: "{{count}} 件のワークスペースをアーカイブしますか？",
          message: "選択したワークスペースはアーカイブされ、サイドバーから削除されます。",
          riskyWorktrees:
            "選択した worktree のうち {{count}} 件に未コミットまたは未プッシュの変更があります。ディレクトリが削除される可能性があります。",
          confirm: "選択項目をアーカイブ",
          failed: "{{count}} 件のワークスペースをアーカイブできませんでした",
        },
        confirmations: {
          removeTitle: "ワークスペースを削除しますか？",
          removeMessage:
            "「{{workspaceName}}」と ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}} にある Paseo 管理データを完全に削除しますか？\n\n関連する外部コードディレクトリとその中のファイルは削除も変更もされません。この操作は取り消せません。",
          removeConfirm: "削除",
        },
        toasts: {
          removeFailed: "ワークスペースの削除に失敗しました",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "タスクを処理しています...",
      },
      general: {
        clientIdentity: {
          hostname: "クライアントのホスト名",
          hostnameDescription: "daemon のクライアント管理画面に表示されます",
          editHostname: "クライアントのホスト名を編集",
          editHostnameTitle: "クライアントのホスト名を編集",
          hostnamePlaceholder: "自分の Mac",
          identityId: "クライアント ID",
          identityIdDescription: "この Paseo クライアント固有の ID。変更できません",
          unavailable: "利用できません",
        },
        aidenClaudeReasoningTranslation: {
          label: "Aiden Claude の思考を中国語に翻訳",
          description: "簡体字中国語の翻訳のみを表示し、オフの場合は原文を表示します。",
        },
      },
      permissions: {
        test: "テスト",
        backgroundAttention: {
          title: "バックグラウンド通知",
          soundVolume: "通知音量",
          description:
            "接続中のローカルまたはリモート Host がタスクを完了するか、ユーザーの介入が必要になったときに通知します。",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint: "Leave empty to generate it automatically.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "ID 情報",
            serverId: "サーバー ID",
            serverIdDescription: "この daemon 固有の ID。変更できません",
          },
        },
      },
      project: {
        switchHost: "ホストを切り替え",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "プロジェクトディレクトリがありません",
          description:
            "プロジェクトの名前、アイコン、メモリは編集できます。ディレクトリを関連付けると、paseo.json に保存される設定も編集できます。",
        },
        memory: {
          title: "プロジェクトメモリ",
          info: "このプロジェクト固有のメモリを制御し、Paseo が学習する長期的な知識を定義します。",
          policyTitle: "メモリ規則",
          enabledTitle: "このプロジェクトでメモリを使用",
          enabledHint:
            "無効にすると、エージェントはプロジェクトメモリを参照・作成しません。グローバルメモリは引き続き利用できます。",
          instructionsTitle: "このプロジェクトについて何を記憶させますか？",
          instructionsHint:
            "規約、アーキテクチャ決定、繰り返し使う手順、安定した環境情報を記述します。",
          instructionsPlaceholder:
            "例：アーキテクチャ決定とリリース手順を記憶し、一時的な障害、ログ、秘密情報は無視する。",
          save: "保存",
          saving: "保存中...",
          saved: "保存しました",
          saveError: "プロジェクトメモリを保存できませんでした",
          content: {
            title: "メモリ内容",
            description:
              "このプロジェクトとワークスペースの長期メモリを表示、編集、削除します。ここではメモリのスコープを変更できません。",
            scope: "メモリのスコープ",
            scopes: {
              project: "現在のプロジェクト",
              workspace: "ワークスペース",
            },
            selectScope: "メモリのスコープを選択",
            noScopes: "利用可能なメモリスコープがありません",
            selectWorkspace: "ワークスペースを選択",
            noWorkspace: "このプロジェクトには利用可能なワークスペースがありません",
            loading: "メモリを読み込み中...",
            empty: "このスコープには条件に一致するメモリがありません",
            errorTitle: "プロジェクトメモリを管理できません",
            deleteTitle: "「{{title}}」を削除しますか？",
            deleteDescription: "このメモリとソース情報は復元できません。",
            deleteConfirm: "削除",
          },
        },
        rename: {
          renamedToast: "プロジェクト名を変更しました",
          errorFallback: "プロジェクト名を変更できませんでした",
          renameLabel: "プロジェクトの名前を変更",
          resetLabel: "プロジェクト名をデフォルトにリセット",
          projectNameLabel: "プロジェクト名",
          saveLabel: "プロジェクト名を保存",
          cancelLabel: "名前変更をキャンセル",
          reset: "リセット",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  ko: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "Edit queued message",
        save: "Save queued message",
        cancelEdit: "Cancel editing queued message",
        remove: "Remove queued message",
        moveUp: "Move queued message up",
        moveDown: "Move queued message down",
        steer: "Steer",
      },
    },
    agentControls: {
      memory: {
        title: "대화 메모리",
        open: "대화 메모리 설정",
        enabledTitle: "이 대화에서 메모리 사용",
        enabledHint:
          "끄면 이 에이전트는 기존 메모리를 읽지 않고 대화에서 새 메모리를 학습하지 않습니다.",
        instructionsTitle: "Paseo가 이 대화에서 무엇을 기억해야 하나요?",
        instructionsHint:
          "확인된 결론, 반복되는 선호, 최종 결정처럼 오래 유지할 정보를 지정하세요. 임시 로그, 추측, 비밀은 제외됩니다.",
        instructionsPlaceholder: "예: 확인된 원인과 최종 결정을 기억하고 중간 실험은 무시합니다.",
        save: "저장",
        saving: "저장 중...",
        saved: "저장됨",
        saveError: "대화 메모리를 저장할 수 없습니다",
      },
    },
    agentStream: {
      scrollToOldest: "Jump to first message",
      locatingOldest: "Locating first message",
      reasoningTranslation: {
        translating: "Translating reasoning to Chinese...",
        failed: "Reasoning translation failed.",
        unavailable: "This Paseo server does not support reasoning translation.",
      },
      process: {
        show: "Show process",
        hide: "Hide process",
        processed: "Processed",
        processedWithDuration: "Processed {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "이 프로젝트의 세션이 없습니다",
      projectFilter: {
        label: "프로젝트",
        title: "프로젝트로 필터링",
        all: "모든 프로젝트",
        empty: "사용 가능한 프로젝트가 없습니다",
        search: "프로젝트 검색",
        hostCount: "호스트 {{count}}개",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "Sort by",
          activity: "Recent activity",
          name: "프로젝트 이름",
          manual: "Manual",
        },
      },
      actions: {
        collapseAllWorkspaces: "모든 워크스페이스 접기",
        expandAllWorkspaces: "모든 워크스페이스 펼치기",
      },
      project: {
        actions: {
          hide: "프로젝트 숨기기",
          show: "프로젝트 표시",
        },
        hidden: {
          title: "숨겨진 프로젝트 ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "워크스페이스 삭제",
          removing: "삭제 중...",
        },
        bulkArchive: {
          select: "워크스페이스 선택",
          selected: "{{count}}개 선택됨",
          cancel: "선택 취소",
          title: "워크스페이스 {{count}}개를 보관할까요?",
          message: "선택한 워크스페이스가 보관되고 사이드바에서 제거됩니다.",
          riskyWorktrees:
            "선택한 worktree 중 {{count}}개에 커밋하지 않았거나 푸시하지 않은 변경 사항이 있습니다. 해당 디렉터리가 삭제될 수 있습니다.",
          confirm: "선택 항목 보관",
          failed: "워크스페이스 {{count}}개를 보관하지 못했습니다",
        },
        confirmations: {
          removeTitle: "워크스페이스를 삭제하시겠습니까?",
          removeMessage:
            '"{{workspaceName}}" 및 ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}의 Paseo 관리 데이터를 영구 삭제하시겠습니까?\n\n연결된 외부 코드 디렉터리와 그 안의 파일은 삭제되거나 수정되지 않습니다. 이 작업은 취소할 수 없습니다.',
          removeConfirm: "삭제",
        },
        toasts: {
          removeFailed: "워크스페이스를 삭제하지 못했습니다",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "작업을 처리하는 중...",
      },
      general: {
        clientIdentity: {
          hostname: "Client hostname",
          hostnameDescription: "Shown in the daemon's client management page",
          editHostname: "Edit client hostname",
          editHostnameTitle: "Edit client hostname",
          hostnamePlaceholder: "My Mac",
          identityId: "Client identity ID",
          identityIdDescription: "Unique identity for this Paseo client; it cannot be changed",
          unavailable: "Unavailable",
        },
        aidenClaudeReasoningTranslation: {
          label: "Translate Aiden Claude reasoning to Chinese",
          description:
            "Show only the Simplified Chinese translation of Aiden Claude reasoning. Turn this off to show the original text.",
        },
      },
      permissions: {
        test: "Test",
        backgroundAttention: {
          title: "Background attention",
          soundVolume: "Alert sound volume",
          description:
            "When any connected local or remote host finishes a task or needs user intervention while Paseo is unfocused, bounce the Dock icon, play a sound, and show an attention badge.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint:
              "Leave empty to derive it automatically from the listen address and current LAN IP.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "Identity information",
            serverId: "Server identity ID",
            serverIdDescription: "Unique identity for this daemon; it cannot be changed",
          },
        },
      },
      project: {
        switchHost: "Switch host",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "프로젝트 디렉터리가 없습니다",
          description:
            "프로젝트 이름, 아이콘, 메모리는 편집할 수 있습니다. 디렉터리를 연결하면 paseo.json에 저장되는 설정도 편집할 수 있습니다.",
        },
        memory: {
          title: "프로젝트 메모리",
          info: "이 프로젝트의 메모리 사용 여부와 Paseo가 학습할 장기 지식을 설정합니다.",
          policyTitle: "Memory rules",
          enabledTitle: "이 프로젝트에서 메모리 사용",
          enabledHint:
            "끄면 에이전트가 프로젝트 메모리를 읽거나 만들지 않습니다. 전역 메모리는 계속 사용할 수 있습니다.",
          instructionsTitle: "Paseo가 이 프로젝트에서 무엇을 기억해야 하나요?",
          instructionsHint: "규칙, 아키텍처 결정, 반복 절차, 안정적인 환경 정보를 설명하세요.",
          instructionsPlaceholder:
            "예: 아키텍처 결정과 릴리스 절차를 기억하고 임시 오류, 로그, 비밀은 무시합니다.",
          save: "저장",
          saving: "저장 중...",
          saved: "저장됨",
          saveError: "프로젝트 메모리를 저장할 수 없습니다",
          content: {
            title: "Memory content",
            description:
              "View, edit, or delete long-term memory saved for this Project. Project is the finest-grained memory scope.",
            scope: "Memory scope",
            scopes: {
              project: "Current Project",
              workspace: "Workspace",
            },
            selectScope: "Select a memory scope",
            noScopes: "No memory scopes available",
            selectWorkspace: "Select a Workspace",
            noWorkspace: "This Project has no available Workspaces",
            loading: "Loading memory...",
            empty: "No memories in this scope match the current filters",
            errorTitle: "Unable to manage Project memory",
            deleteTitle: "Delete “{{title}}”?",
            deleteDescription: "This memory and its source information cannot be recovered.",
            deleteConfirm: "Delete",
          },
        },
        rename: {
          renamedToast: "Project renamed",
          errorFallback: "Couldn't rename project",
          renameLabel: "Rename project",
          resetLabel: "Reset project name to default",
          projectNameLabel: "Project name",
          saveLabel: "Save project name",
          cancelLabel: "Cancel renaming",
          reset: "Reset",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  "pt-BR": {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "Editar mensagem na fila",
        save: "Salvar mensagem na fila",
        cancelEdit: "Cancelar edição da mensagem",
        remove: "Remover mensagem da fila",
        moveUp: "Mover mensagem para cima",
        moveDown: "Mover mensagem para baixo",
        steer: "Orientar",
      },
    },
    agentControls: {
      memory: {
        title: "Memória da conversa",
        open: "Configurar memória da conversa",
        enabledTitle: "Usar memória nesta conversa",
        enabledHint:
          "Quando desativada, este agente não lê memórias existentes nem aprende novas memórias da conversa.",
        instructionsTitle: "O que o Paseo deve lembrar desta conversa?",
        instructionsHint:
          "Defina tópicos duradouros, como conclusões confirmadas, preferências recorrentes ou decisões. Logs temporários, suposições e segredos continuam excluídos.",
        instructionsPlaceholder:
          "Exemplo: lembrar causas confirmadas e decisões finais; ignorar experimentos intermediários.",
        save: "Salvar",
        saving: "Salvando...",
        saved: "Salvo",
        saveError: "Não foi possível salvar a memória da conversa",
      },
    },
    agentStream: {
      scrollToOldest: "Ir para a primeira mensagem",
      locatingOldest: "Localizando a primeira mensagem",
      reasoningTranslation: {
        translating: "Traduzindo o raciocínio para chinês...",
        failed: "Falha ao traduzir o raciocínio.",
        unavailable: "Este servidor Paseo não oferece tradução do raciocínio.",
      },
      process: {
        show: "Mostrar processo",
        hide: "Ocultar processo",
        processed: "Processado",
        processedWithDuration: "Processado em {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "Nenhuma sessão para este projeto",
      projectFilter: {
        label: "Projeto",
        title: "Filtrar por projeto",
        all: "Todos os projetos",
        empty: "Nenhum projeto disponível",
        search: "Buscar projetos",
        hostCount: "{{count}} hosts",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "Ordenar por",
          activity: "Atividade recente",
          name: "Nome do projeto",
          manual: "Manual",
        },
      },
      actions: {
        collapseAllWorkspaces: "Recolher todos os workspaces",
        expandAllWorkspaces: "Expandir todos os workspaces",
      },
      project: {
        actions: {
          hide: "Ocultar projeto",
          show: "Mostrar projeto",
        },
        hidden: {
          title: "Projetos ocultos ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "Excluir workspace",
          removing: "Excluindo...",
        },
        bulkArchive: {
          select: "Selecionar workspaces",
          selected: "{{count}} selecionados",
          cancel: "Cancelar seleção",
          title: "Arquivar {{count}} workspaces?",
          message: "Os workspaces selecionados serão arquivados e removidos da barra lateral.",
          riskyWorktrees:
            "{{count}} worktree(s) selecionados têm alterações sem commit ou sem push. Seus diretórios podem ser excluídos.",
          confirm: "Arquivar selecionados",
          failed: "Falha ao arquivar {{count}} workspaces",
        },
        confirmations: {
          removeTitle: "Excluir workspace?",
          removeMessage:
            'Excluir permanentemente "{{workspaceName}}" e os dados gerenciados pelo Paseo em ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}?\n\nO diretório de código externo associado e seus arquivos não serão excluídos nem modificados. Esta ação não pode ser desfeita.',
          removeConfirm: "Excluir",
        },
        toasts: {
          removeFailed: "Falha ao excluir workspace",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "Processando a tarefa...",
      },
      general: {
        clientIdentity: {
          hostname: "Nome do host do cliente",
          hostnameDescription: "Exibido no gerenciamento de clientes do daemon",
          editHostname: "Editar nome do host do cliente",
          editHostnameTitle: "Editar nome do host do cliente",
          hostnamePlaceholder: "Meu Mac",
          identityId: "ID de identidade do cliente",
          identityIdDescription: "Identidade única deste cliente Paseo; não pode ser alterada",
          unavailable: "Indisponível",
        },
        aidenClaudeReasoningTranslation: {
          label: "Traduzir o raciocínio do Aiden Claude para chinês",
          description:
            "Mostra apenas a tradução em chinês simplificado; desativado, mostra o texto original.",
        },
      },
      permissions: {
        test: "Testar",
        backgroundAttention: {
          title: "Alertas em segundo plano",
          soundVolume: "Volume do som de alerta",
          description:
            "O Paseo avisa quando um host local ou remoto conectado conclui uma tarefa ou precisa da intervenção do usuário.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint: "Leave empty to generate it automatically.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "Informações de identidade",
            serverId: "ID de identidade do servidor",
            serverIdDescription: "Identidade única deste daemon; não pode ser alterada",
          },
        },
      },
      project: {
        switchHost: "Trocar host",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "O projeto não tem diretório",
          description:
            "Você pode editar o nome, o ícone e a memória do projeto. As configurações salvas em paseo.json ficam disponíveis após associar um diretório.",
        },
        memory: {
          title: "Memória do projeto",
          info: "Controle a memória deste projeto e defina quais conhecimentos duradouros o Paseo deve aprender.",
          policyTitle: "Regras de memória",
          enabledTitle: "Usar memória neste projeto",
          enabledHint:
            "Quando desativada, os agentes não leem nem criam memórias do projeto. A memória global continua disponível.",
          instructionsTitle: "O que o Paseo deve lembrar deste projeto?",
          instructionsHint:
            "Descreva convenções, decisões de arquitetura, procedimentos recorrentes e fatos estáveis do ambiente.",
          instructionsPlaceholder:
            "Exemplo: lembrar decisões de arquitetura e procedimentos de lançamento; ignorar falhas temporárias, logs e segredos.",
          save: "Salvar",
          saving: "Salvando...",
          saved: "Salvo",
          saveError: "Não foi possível salvar a memória do projeto",
          content: {
            title: "Conteúdo da memória",
            description:
              "Veja, edite ou exclua a memória de longo prazo deste projeto e de seus espaços de trabalho. O escopo não pode ser alterado aqui.",
            scope: "Escopo da memória",
            scopes: {
              project: "Projeto atual",
              workspace: "Espaço de trabalho",
            },
            selectScope: "Selecione um escopo de memória",
            noScopes: "Nenhum escopo de memória disponível",
            selectWorkspace: "Selecione um espaço de trabalho",
            noWorkspace: "Este projeto não tem espaços de trabalho disponíveis",
            loading: "Carregando memória...",
            empty: "Nenhuma memória corresponde aos filtros neste escopo",
            errorTitle: "Não foi possível gerenciar a memória do projeto",
            deleteTitle: "Excluir “{{title}}”?",
            deleteDescription:
              "Esta memória e suas informações de origem não podem ser recuperadas.",
            deleteConfirm: "Excluir",
          },
        },
        rename: {
          renamedToast: "Projeto renomeado",
          errorFallback: "Não foi possível renomear projeto",
          renameLabel: "Renomear projeto",
          resetLabel: "Redefinir nome do projeto para o padrão",
          projectNameLabel: "Nome do projeto",
          saveLabel: "Salvar nome do projeto",
          cancelLabel: "Cancelar renomeação",
          reset: "Redefinir",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  ru: {
    composer: {
      instructionTemplates: {
        title: "Instruction template",
        hint: "Insert a global template and fill it with the active Project's variables.",
        chooseAccessibility: "Choose instruction template",
        loading: "Loading…",
        choose: "Choose template",
        empty: "No templates",
        missingVariables:
          "Missing Project variables: {{variables}}. The unresolved placeholders were kept.",
      },
      attachments: {
        selectMcpServers: "Select MCP servers",
        selectSkills: "Select skills",
        mcpPickerTitle: "MCP servers for this session",
        skillPickerTitle: "Skills for this session",
        searchMcpServers: "Search MCP servers...",
        searchSkills: "Search skills...",
        noMcpServers: "No enabled MCP servers.",
        noSkills: "No enabled skills.",
        openMcpPicker: "Open MCP server picker",
        openSkillPicker: "Open skill picker",
        removeMcp: "Remove MCP server {{name}} from this session",
        removeSkill: "Remove skill {{name}} from this session",
      },
      queue: {
        edit: "Изменить сообщение в очереди",
        save: "Сохранить сообщение в очереди",
        cancelEdit: "Отменить редактирование сообщения",
        remove: "Удалить сообщение из очереди",
        moveUp: "Переместить сообщение вверх",
        moveDown: "Переместить сообщение вниз",
        steer: "Направить",
      },
    },
    agentControls: {
      memory: {
        title: "Память разговора",
        open: "Настроить память разговора",
        enabledTitle: "Использовать память в этом разговоре",
        enabledHint:
          "Если отключено, агент не читает существующую память и не извлекает новую память из разговора.",
        instructionsTitle: "Что Paseo должен запомнить из этого разговора?",
        instructionsHint:
          "Укажите подтверждённые выводы, повторяющиеся предпочтения и решения. Временные журналы, догадки и секреты по-прежнему исключаются.",
        instructionsPlaceholder:
          "Пример: запоминать подтверждённые причины и окончательные решения, игнорировать промежуточные эксперименты.",
        save: "Сохранить",
        saving: "Сохранение...",
        saved: "Сохранено",
        saveError: "Не удалось сохранить память разговора",
      },
    },
    agentStream: {
      scrollToOldest: "Перейти к первому сообщению",
      locatingOldest: "Поиск первого сообщения",
      reasoningTranslation: {
        translating: "Перевод рассуждений на китайский...",
        failed: "Не удалось перевести рассуждения.",
        unavailable: "Этот сервер Paseo не поддерживает перевод рассуждений.",
      },
      process: {
        show: "Показать процесс",
        hide: "Скрыть процесс",
        processed: "Обработано",
        processedWithDuration: "Обработано за {{duration}}",
      },
      hooks: {
        title: "Hooks",
        calls_one: "{{count}} hook call",
        calls_other: "{{count}} hook calls",
      },
      changes: {
        added: "Added {{fileName}}",
        deleted: "Deleted {{fileName}}",
        edited: "Edited {{fileName}}",
        open: "Open",
        openFile: "Open {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "No sessions for this project",
      projectFilter: {
        label: "Проект",
        title: "Фильтр по проекту",
        all: "Все проекты",
        empty: "Нет доступных проектов",
        search: "Поиск проектов",
        hostCount: "{{count}} хостов",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "Project directories",
          empty: "No directories configured for this type.",
          missing: "Directory does not exist",
          types: {
            project: "Project",
            knowledge: "General knowledge",
            indexSkill: "Index Skill",
            workspaceData: "Workspace data",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "Сортировать по",
          activity: "Недавняя активность",
          name: "Название проекта",
          manual: "Вручную",
        },
      },
      actions: {
        collapseAllWorkspaces: "Свернуть все рабочие пространства",
        expandAllWorkspaces: "Развернуть все рабочие пространства",
      },
      project: {
        actions: {
          hide: "Hide project",
          show: "Show project",
        },
        hidden: {
          title: "Скрытые проекты ({{count}})",
        },
      },
      workspace: {
        actions: {
          remove: "Delete workspace",
          removing: "Удаление...",
        },
        bulkArchive: {
          select: "Выбрать рабочие пространства",
          selected: "Выбрано: {{count}}",
          cancel: "Отменить выбор",
          title: "Архивировать {{count}} рабочих пространств?",
          message: "Выбранные рабочие пространства будут архивированы и удалены с боковой панели.",
          riskyWorktrees:
            "В {{count}} выбранных worktree есть незафиксированные или неотправленные изменения. Их каталоги могут быть удалены.",
          confirm: "Архивировать выбранные",
          failed: "Не удалось архивировать {{count}} рабочих пространств",
        },
        confirmations: {
          removeTitle: "Delete workspace?",
          removeMessage:
            'Permanently delete "{{workspaceName}}" and its Paseo-managed data at ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}?\n\nThe external source directory and all files in it will not be deleted or modified. This cannot be undone.',
          removeConfirm: "Delete",
        },
        toasts: {
          removeFailed: "Failed to delete workspace",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "This Project is not available on the selected Host",
        projectDirectoryUnavailable:
          "This Project has no workspace directory on the selected Host. Update the Host or configure a Project directory.",
      },
    },
    pairing: {
      link: {
        awaitingApproval:
          "Waiting for the server to approve this connection. Pairing will continue automatically.",
        actions: {
          awaitingApproval: "Waiting for approval...",
        },
      },
      scan: {
        awaitingApprovalStatus: "Waiting for approval",
        awaitingApprovalTitle: "Approve this device on the server",
        awaitingApprovalBody:
          "Approve this device under Client management on the Paseo server. It will connect automatically.",
      },
      device: {
        access: {
          historyTitle: "Client connection history",
          historyEmpty: "No historical client connections.",
          connectedAt: "Connected at",
          disconnectedAt: "Disconnected at",
          stillConnected: "Still connected",
          historyRetention:
            "History is automatically retained for {{days}} days and can be deleted manually.",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "Выполняется задача...",
      },
      general: {
        clientIdentity: {
          hostname: "Client hostname",
          hostnameDescription: "Shown in the daemon's client management page",
          editHostname: "Edit client hostname",
          editHostnameTitle: "Edit client hostname",
          hostnamePlaceholder: "My Mac",
          identityId: "Client identity ID",
          identityIdDescription: "Unique identity for this Paseo client; it cannot be changed",
          unavailable: "Unavailable",
        },
        aidenClaudeReasoningTranslation: {
          label: "Переводить рассуждения Aiden Claude на китайский",
          description:
            "Показывать только перевод на упрощённый китайский; иначе показывать оригинал.",
        },
      },
      permissions: {
        test: "Тест",
        backgroundAttention: {
          title: "Фоновые оповещения",
          soundVolume: "Громкость сигнала",
          description:
            "Paseo оповещает, когда подключённый локальный или удалённый Host завершает задачу или требует вмешательства пользователя.",
        },
      },
      host: {
        badges: {
          direct: "Direct to server",
          viaRelay: "Via Relay",
        },
        relay: {
          title: "Relay",
          serviceColumn: "WS / WSS address",
          pairingColumn: "HTTP / HTTPS connection address",
          serviceListHint:
            "Configure one or more Relay service addresses used by Paseo. Default public Relay: {{addresses}}.",
          pairingListHint:
            "Configure pairing frontends, including paths such as /app. Default HTTP/HTTPS address: {{addresses}}. Every Relay gets a pairing link for every address in this list.",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "How to fill in the Relay list above",
          addressPairHint:
            "Relay service addresses and pairing frontend addresses are configured independently. With multiple HTTP/HTTPS addresses, every Relay generates multiple pairing links.",
          incompleteRow: "Each Relay requires both a service address and a connection address",
          duplicateRow: "Relay service addresses must be unique",
          duplicatePairingUrl: "HTTP / HTTPS connection addresses must be unique",
          addRow: "Add Relay",
          addPairingUrl: "Add connection address",
          removeRow: "Remove Relay",
          removePairingUrl: "Remove connection address",
          save: "Save",
          saving: "Saving...",
          lan: {
            title: "Use this Paseo as a LAN Relay",
            hint: "Devices on the same local network can connect through this Host.",
            listenLabel: "LAN Relay listen address",
            listenHint:
              "Use 0.0.0.0 to listen on every interface. A specific IP must be assigned to this machine.",
            pairingUrlLabel: "LAN Relay HTTP connection address",
            pairingUrlPlaceholder: "For example http://10.71.95.148:6769",
            pairingUrlHint:
              "Leave empty to derive it automatically from the listen address and current LAN IP.",
            webApp: {
              title: "Host the Paseo pairing web app",
              hint: "Serve a web page on this Relay that parses pairing offers and connects to Paseo.",
              pathLabel: "Pairing web app path",
              pathHint: "For example /app. Links use http://local-ip:port/app/#offer=....",
            },
          },
          management: {
            title: "Relay connections",
            count: "{{count}} connections",
            empty: "No clients or servers are connected to this Relay.",
            loading: "Loading Relay connections...",
            unavailable: "Relay runtime information is unavailable.",
            unknownPeer: "Unknown peer",
            pairingAddress: "Pairing page address",
            relayAddress: "Relay WebSocket address",
            deviceType: "Device type",
            deviceTypes: {
              mac: "Mac app",
              windows: "Windows app",
              linux: "Linux app",
              android: "Android app",
              ios: "iOS app",
              web: "Web app",
              cli: "CLI",
              mcp: "MCP",
              unknown: "Unknown",
            },
            hostname: "Server hostname",
            clientHostname: "Client hostname",
            clientId: "Client identity ID",
            serverId: "Server identity ID",
            connectionId: "Connection ID",
            peerEndpoint: "IP / port",
            clients: "Clients",
            servers: "Servers",
            noClients: "No clients are connected to this Relay.",
            noServers: "No servers are connected to this Relay.",
            clientHistory: "Client connection history",
            serverHistory: "Server connection history",
            noClientHistory: "No historical client connections.",
            noServerHistory: "No historical server connections.",
            connectionHistory: "Connection history",
            connectionCount: "{{count}} connections",
            expandHistory: "Show all {{count}} connections",
            collapseHistory: "Collapse connection history",
            connectedAt: "Connected at",
            disconnectedAt: "Disconnected at",
            stillConnected: "Still connected",
            historyRetention:
              "History is automatically retained for {{days}} days and can be deleted manually.",
            delete: "Delete",
            deleting: "Deleting...",
            roles: {
              client: "Client",
              server: "Server",
              server_control: "Server control connection",
              server_data: "Server data connection",
            },
          },
        },
        daemon: {
          identity: {
            title: "Сведения об идентификаторах",
            serverId: "ID сервера",
            serverIdDescription: "Уникальный идентификатор daemon; изменить нельзя",
          },
        },
      },
      project: {
        switchHost: "Switch host",
        projectId: "Project ID",
        parentProjectId: "Parent Project ID",
        projectPath: "Project path",
        directoryless: {
          title: "No Project directory",
          description:
            "You can edit this Project's name, icon, and memory. Settings stored in paseo.json become available after the Project is attached to a directory.",
        },
        memory: {
          title: "Project memory",
          info: "Control whether this Project contributes scoped memory and define what durable Project knowledge Paseo should learn.",
          policyTitle: "Memory rules",
          enabledTitle: "Use memory for this Project",
          enabledHint:
            "When off, Agents in this Project do not read or create Project-scoped memory. Global memory remains available.",
          instructionsTitle: "What should Paseo remember for this Project?",
          instructionsHint:
            "Describe durable Project knowledge such as conventions, architecture decisions, recurring procedures, and stable environment facts.",
          instructionsPlaceholder:
            "Example: Remember architecture decisions and release procedures. Ignore temporary failures, raw logs, and secrets.",
          save: "Save",
          saving: "Saving...",
          saved: "Saved",
          saveError: "Couldn't save Project memory",
          content: {
            title: "Memory content",
            description:
              "View, edit, or delete long-term memory saved for this Project. Project is the finest-grained memory scope.",
            scope: "Memory scope",
            scopes: {
              project: "Current Project",
              workspace: "Workspace",
            },
            selectScope: "Select a memory scope",
            noScopes: "No memory scopes available",
            selectWorkspace: "Select a Workspace",
            noWorkspace: "This Project has no available Workspaces",
            loading: "Loading memory...",
            empty: "No memories in this scope match the current filters",
            errorTitle: "Unable to manage Project memory",
            deleteTitle: "Delete “{{title}}”?",
            deleteDescription: "This memory and its source information cannot be recovered.",
            deleteConfirm: "Delete",
          },
        },
        rename: {
          renamedToast: "Project renamed",
          errorFallback: "Couldn't rename project",
          renameLabel: "Rename project",
          resetLabel: "Reset project name to default",
          projectNameLabel: "Project name",
          saveLabel: "Save project name",
          cancelLabel: "Cancel renaming",
          reset: "Reset",
        },
        resources: {
          title: "Project resources",
          info: "Configure writable Project directories, generated index Skill directories, and Workspace review data directories. Relative paths resolve from the single project directory when present, otherwise from the managed Project path; Project knowledge is managed separately below.",
          emptyDirectories: "No directories configured.",
          removeDirectory: "Remove {{title}} entry",
          project: {
            title: "Project directories",
            hint: "Single-directory mode requires one path and automatically includes AI general knowledge folders under it. Multiple-directory mode allows zero or more paths and does not add general knowledge folders automatically.",
            single: "Single directory",
            multiple: "Multiple directories",
            validation: {
              singleRequired: "Single-directory mode requires exactly one enabled path.",
            },
          },
          knowledge: {
            title: "General knowledge directories",
            hint: "Agents read and adopt content from these directories only when it is relevant to the task.",
          },
          indexSkill: {
            title: "Index Skill directories",
            hint: "Each directory may contain a SKILL.md index generated from Project and knowledge directories.",
          },
          workspaceData: {
            title: "Workspace data directories",
            hint: "Defaults to ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}, grouping durable progress notes, review artifacts, and outputs by Project.",
          },
        },
        indexSkill: {
          title: "Project index Skill",
          info: "Automatic generation is off by default. Git-backed Project or knowledge directories receive an isolated index for every branch; deleted branches remove their indexes.",
          autoGenerate: "Automatically generate index Skill",
          autoGenerateHint: "Generate SKILL.md in every configured index Skill directory.",
          projectInterval: "Project update interval (minutes)",
          projectIntervalHint: "Leave blank to inherit {{minutes}} minutes.",
          globalInterval: "Global update interval (minutes)",
          globalIntervalHint: "Used by Projects that do not define a custom interval.",
          apply: "Apply",
          validation: {
            interval:
              "Use a positive whole number of minutes, or leave blank to inherit the global value.",
          },
        },
        variables: {
          title: "Project variables",
          info: "Variables are available to instruction templates as {{variableName}}.",
          empty: "No variables configured.",
          namePlaceholder: "variableName",
          valuePlaceholder: "Value",
          remove: "Remove variable",
          validation: {
            invalidName: "Invalid variable name: {{name}}",
            duplicateName: "Duplicate variable name: {{name}}",
          },
        },
        instructionTemplates: {
          title: "Global instruction templates",
          info: "Templates are shared across Projects on this host and filled with the active Project's variables.",
          empty: "No instruction templates configured.",
          idPlaceholder: "template-id",
          namePlaceholder: "Template name",
          descriptionPlaceholder: "Optional description",
          contentPlaceholder: "Markdown instruction using {{variables}}",
          remove: "Remove instruction template",
          validation: {
            incomplete: "Each instruction template requires an ID, name, and Markdown content.",
            duplicateId: "Duplicate template ID: {{id}}",
          },
        },
      },
    },
  },
  "zh-CN": {
    composer: {
      instructionTemplates: {
        title: "指令模板",
        hint: "插入全局指令模板，并自动填充当前项目 的变量。",
        chooseAccessibility: "选择指令模板",
        loading: "正在加载…",
        choose: "选择模板",
        empty: "暂无模板",
        missingVariables: "缺少项目变量：{{variables}}。未解析的占位符已保留。",
      },
      attachments: {
        selectMcpServers: "选择 MCP 服务器",
        selectSkills: "选择 技能",
        mcpPickerTitle: "本次会话的 MCP 服务器",
        skillPickerTitle: "本次会话的 技能",
        searchMcpServers: "搜索 MCP 服务器...",
        searchSkills: "搜索 技能...",
        noMcpServers: "没有已启用的 MCP 服务器。",
        noSkills: "没有已启用的 技能。",
        openMcpPicker: "打开 MCP 服务器选择器",
        openSkillPicker: "打开 技能 选择器",
        removeMcp: "从本次会话移除 MCP 服务器 {{name}}",
        removeSkill: "从本次会话移除 技能 {{name}}",
      },
      queue: {
        edit: "编辑排队消息",
        save: "保存排队消息",
        cancelEdit: "取消编辑排队消息",
        remove: "撤销排队消息",
        moveUp: "上移排队消息",
        moveDown: "下移排队消息",
        steer: "引导",
      },
    },
    agentControls: {
      memory: {
        title: "会话记忆",
        open: "配置会话记忆",
        enabledTitle: "在当前会话中使用记忆",
        enabledHint: "关闭后，当前智能体不会读取已有记忆，也不会从当前会话学习新记忆。",
        instructionsTitle: "Paseo 应该从当前会话记住什么？",
        instructionsHint:
          "填写需要优先沉淀的长期信息，例如已确认的结论、反复出现的偏好或最终决策。临时日志、猜测和密钥仍会被排除。",
        instructionsPlaceholder: "例如：记住已确认的根因和最终决策，忽略中间实验过程。",
        save: "保存",
        saving: "正在保存...",
        saved: "已保存",
        saveError: "无法保存会话记忆",
      },
    },
    agentStream: {
      scrollToOldest: "跳转到第一条消息",
      locatingOldest: "正在定位第一条消息",
      chatOutline: {
        question: "问题",
        answer: "回答",
        model: "模型",
        time: "时间",
        pendingAnswer: "等待回答",
        unknownModel: "未知模型",
      },
      reasoningTranslation: {
        translating: "正在翻译思考过程…",
        failed: "思考过程翻译失败。",
        unavailable: "当前 Paseo 服务不支持思考翻译。",
      },
      process: {
        show: "展开过程",
        hide: "隐藏过程",
        processed: "已处理",
        processedWithDuration: "已处理 {{duration}}",
      },
      hooks: {
        title: "钩子调用",
        calls_one: "{{count}} 次钩子调用",
        calls_other: "{{count}} 次钩子调用",
      },
      changes: {
        added: "已新增 {{fileName}}",
        deleted: "已删除 {{fileName}}",
        edited: "已编辑 {{fileName}}",
        open: "打开",
        openFile: "打开 {{fileName}}",
      },
    },
    sessions: {
      noProjectSessions: "这个项目 暂无历史会话",
      projectFilter: {
        label: "项目",
        title: "按 项目 筛选",
        all: "全部项目",
        empty: "暂无可用 项目",
        search: "搜索 项目",
        hostCount: "{{count}} 台主机",
      },
    },
    workspace: {
      fileExplorer: {
        resources: {
          title: "项目 目录",
          empty: "此类型暂未配置目录。",
          missing: "目录不存在",
          types: {
            project: "项目目录",
            knowledge: "通用知识",
            indexSkill: "索引 技能",
            workspaceData: "工作区 数据",
          },
        },
      },
    },
    sidebar: {
      display: {
        sorting: {
          label: "排序方式",
          activity: "最近活动",
          name: "项目名称",
          manual: "手动",
        },
      },
      actions: {
        collapseAllWorkspaces: "一键折叠全部 Project",
        expandAllWorkspaces: "一键展开全部 Project",
      },
      project: {
        actions: {
          hide: "隐藏 项目",
          show: "显示 项目",
        },
        hidden: {
          title: "隐藏的项目（{{count}}）",
        },
      },
      workspace: {
        actions: {
          remove: "删除 工作区",
          removing: "正在删除...",
        },
        bulkArchive: {
          select: "批量选择工作区",
          selected: "已选择 {{count}} 项",
          cancel: "取消选择",
          title: "归档 {{count}} 个工作区？",
          message: "选中的工作区将被归档，并从侧边栏移除。",
          riskyWorktrees: "其中 {{count}} 个 工作树 存在未提交或未推送的更改，其目录可能会被删除。",
          confirm: "归档所选项",
          failed: "{{count}} 个工作区归档失败",
          removeTitle: "删除 {{count}} 个工作区？",
          removeMessage:
            "永久删除所选工作区的 Paseo 托管数据？\n\n不会删除或修改关联的外部源目录及其中任何文件。此操作无法撤销。",
          removeConfirm: "删除所选项",
          removeFailed: "{{count}} 个工作区删除失败",
          removeUnsupported: "所选项中有 {{count}} 个工作区所在主机不支持删除，请先更新主机",
        },
        confirmations: {
          removeTitle: "删除 工作区？",
          removeMessage:
            "永久删除「{{workspaceName}}」及其 Paseo 工作区 数据（~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}）？\n\n不会删除或修改该 工作区 关联的外部代码目录及其中任何文件。此操作无法撤销。",
          removeConfirm: "删除",
        },
        toasts: {
          removeFailed: "删除 工作区 失败",
        },
      },
    },
    newWorkspace: {
      errors: {
        projectHostUnavailable: "当前项目 未绑定到所选 主机",
        projectDirectoryUnavailable:
          "当前项目 在所选 主机 上没有可用的 workspace 目录，请更新 主机 或配置 项目 目录。",
      },
    },
    pairing: {
      link: {
        awaitingApproval: "正在等待服务端通过连接申请。通过后将自动完成连接。",
        actions: {
          awaitingApproval: "等待服务端授权...",
        },
      },
      scan: {
        awaitingApprovalStatus: "等待授权",
        awaitingApprovalTitle: "等待服务端通过连接申请",
        awaitingApprovalBody: "请在 Paseo 服务端的“客户端管理”中通过此设备。通过后将自动连接。",
      },
      device: {
        access: {
          historyTitle: "历史客户端连接",
          historyEmpty: "暂无历史客户端连接。",
          connectedAt: "开始连接时间",
          disconnectedAt: "结束连接时间",
          stillConnected: "当前仍在连接",
          historyRetention: "历史记录自动保留 {{days}} 天，可手动删除。",
        },
      },
    },
    settings: {
      notifications: {
        islandWorking: "正在处理任务...",
      },
      general: {
        clientIdentity: {
          hostname: "客户端主机名",
          hostnameDescription: "展示在服务端的客户端管理页面",
          editHostname: "修改客户端主机名",
          editHostnameTitle: "修改客户端主机名",
          hostnamePlaceholder: "我的 Mac",
          identityId: "客户端身份 ID",
          identityIdDescription: "当前 Paseo 客户端的唯一身份，不支持修改",
          unavailable: "暂不可用",
        },
        aidenClaudeReasoningTranslation: {
          label: "将 Aiden Claude 思考过程翻译为中文",
          description: "开启后仅展示简体中文译文；关闭后展示原始思考内容。",
        },
      },
      permissions: {
        test: "测试",
        backgroundAttention: {
          title: "后台提醒",
          soundVolume: "提醒声音大小",
          description:
            "当任意已连接的本地或远端 主机 完成任务或需要用户介入，且 Paseo 未获得焦点时，抖动程序坞图标、播放声音并显示醒目标记。",
        },
      },
      host: {
        badges: {
          direct: "直连服务端",
          viaRelay: "通过 Relay",
        },
        relay: {
          title: "中继连接",
          serviceColumn: "WS / WSS 地址",
          pairingColumn: "HTTP / HTTPS 连接地址",
          serviceListHint:
            "配置 Paseo 连接的 Relay 服务地址，可添加多个。默认公网 Relay 地址：{{addresses}}。",
          pairingListHint:
            "配置配对前端地址，可包含 /app 等路径。默认 HTTP/HTTPS 地址：{{addresses}}。每个 Relay 都会为列表中的每个地址生成配对链接。",
          servicePlaceholder: "wss://relay.paseo.sh:443",
          pairingPlaceholder: "https://app.paseo.sh",
          addressPairHintTitle: "上方 Relay 列表填写说明",
          addressPairHint:
            "Relay 服务地址与配对前端地址独立配置。配置多个 HTTP/HTTPS 地址时，每个 Relay 都会生成对应的多个配对链接。",
          incompleteRow: "每个 Relay 必须同时填写服务地址和连接地址",
          duplicateRow: "Relay 服务地址不能重复",
          duplicatePairingUrl: "HTTP / HTTPS 连接地址不能重复",
          addRow: "添加 Relay",
          addPairingUrl: "添加连接地址",
          removeRow: "删除 Relay",
          removePairingUrl: "删除连接地址",
          save: "保存",
          saving: "保存中...",
          lan: {
            title: "将当前 Paseo 作为局域网 Relay",
            hint: "同一局域网内的设备可通过这个 主机 连接。",
            listenLabel: "局域网 Relay 监听地址",
            listenHint: "建议使用 0.0.0.0 监听所有网卡；指定 IP 时，该 IP 必须属于当前机器。",
            pairingUrlLabel: "局域网 Relay HTTP 连接地址",
            pairingUrlPlaceholder: "例如 http://10.71.95.148:6769",
            pairingUrlHint: "留空时，将根据监听地址和当前局域网 IP 自动生成。",
            webApp: {
              title: "托管 Paseo 配对前端",
              hint: "通过此 Relay 的 HTTP 地址提供可解析的配对信息，并连接 Paseo Web 页面。",
              pathLabel: "配对前端路径",
              pathHint: "例如 /app。生成的标准链接格式为 http://本机IP:端口/app/#offer=...。",
            },
          },
          management: {
            title: "Relay 连接管理",
            count: "{{count}} 个连接",
            empty: "当前没有客户端或服务端连接到此 Relay。",
            loading: "正在读取 Relay 连接...",
            unavailable: "暂时无法读取 Relay 运行信息。",
            unknownPeer: "未知来源",
            pairingAddress: "配对页面地址",
            relayAddress: "Relay WebSocket 地址",
            deviceType: "设备类型",
            deviceTypes: {
              mac: "Mac 版",
              windows: "Windows 版",
              linux: "Linux 版",
              android: "Android 版",
              ios: "iOS 版",
              web: "Web 版",
              cli: "CLI 版",
              mcp: "MCP",
              unknown: "未知",
            },
            hostname: "服务端主机名",
            clientHostname: "客户端主机名",
            clientId: "客户端身份 ID",
            serverId: "服务端身份 ID",
            connectionId: "连接 ID",
            peerEndpoint: "IP / 端口",
            clients: "客户端连接",
            servers: "服务端连接",
            noClients: "当前没有客户端连接到此 Relay。",
            noServers: "当前没有服务端连接到此 Relay。",
            clientHistory: "历史客户端连接",
            serverHistory: "历史服务端连接",
            noClientHistory: "暂无历史客户端连接。",
            noServerHistory: "暂无历史服务端连接。",
            connectionHistory: "历史连接时间",
            connectionCount: "{{count}} 次连接",
            expandHistory: "展开全部 {{count}} 次连接",
            collapseHistory: "收起连接记录",
            connectedAt: "开始连接时间",
            disconnectedAt: "结束连接时间",
            stillConnected: "当前仍在连接",
            historyRetention: "历史记录自动保留 {{days}} 天，可手动删除。",
            delete: "删除",
            deleting: "正在删除...",
            roles: {
              client: "客户端",
              server: "服务端",
              server_control: "服务端控制连接",
              server_data: "服务端数据连接",
            },
          },
        },
        daemon: {
          identity: {
            title: "身份信息",
            serverId: "服务端身份 ID",
            serverIdDescription: "当前 daemon 的唯一身份，不支持修改",
          },
        },
      },
      project: {
        switchHost: "切换主机",
        projectId: "项目 ID",
        parentProjectId: "父项目 ID",
        projectPath: "项目路径",
        directoryless: {
          title: "项目尚未关联目录",
          description:
            "你仍可编辑项目的名称、图标和记忆。项目关联目录后，可继续编辑存储在 paseo.json 中的设置。",
        },
        memory: {
          title: "项目记忆",
          info: "控制当前项目是否使用独立作用域的记忆，并定义 Paseo 应沉淀哪些长期项目知识。",
          policyTitle: "记忆规范",
          enabledTitle: "为当前项目开启记忆",
          enabledHint:
            "关闭后，当前项目中的智能体不再读取或创建项目作用域的记忆；全局记忆仍可使用。",
          instructionsTitle: "Paseo 应该为当前项目记住什么？",
          instructionsHint:
            "填写需要长期保留的项目知识，例如开发规范、架构决策、重复流程和稳定的环境事实。",
          instructionsPlaceholder: "例如：记住架构决策和发布流程，忽略临时故障、原始日志和密钥。",
          save: "保存",
          saving: "正在保存...",
          saved: "已保存",
          saveError: "无法保存项目记忆",
          content: {
            title: "记忆内容",
            description: "查看、编辑或删除当前项目保存的长期记忆。项目是最细粒度记忆范围。",
            scope: "记忆范围",
            scopes: {
              project: "当前项目",
              workspace: "工作区",
            },
            selectScope: "选择记忆范围",
            noScopes: "没有可用的记忆范围",
            selectWorkspace: "选择工作区",
            noWorkspace: "当前项目没有可用的工作区",
            loading: "正在加载记忆...",
            empty: "当前范围内没有符合条件的记忆",
            errorTitle: "无法管理项目记忆",
            deleteTitle: "删除记忆“{{title}}”？",
            deleteDescription: "该记忆及其来源信息删除后无法恢复。",
            deleteConfirm: "删除",
          },
        },
        rename: {
          renamedToast: "项目已重命名",
          errorFallback: "无法重命名项目",
          renameLabel: "重命名项目",
          resetLabel: "将项目名称重置为默认值",
          projectNameLabel: "项目名称",
          saveLabel: "保存项目名称",
          cancelLabel: "取消重命名",
          reset: "重置",
        },
        resources: {
          title: "项目资源目录",
          info: "可分别配置多个可写项目目录、索引技能目录和工作区审查数据目录。存在单项目目录时，相对路径基于该目录解析；否则基于 Paseo 管理的项目路径解析。项目知识在下方独立管理。",
          emptyDirectories: "尚未配置目录。",
          removeDirectory: "移除“{{title}}”条目",
          project: {
            title: "项目目录",
            hint: "单目录模式必须选择一个路径，并自动加入该目录下的 AI 通用知识目录；多目录模式可为空或配置多个路径，不会自动加入通用知识目录。",
            single: "单目录",
            multiple: "多目录",
            validation: {
              singleRequired: "单目录模式必须且只能启用一个路径。",
            },
          },
          knowledge: {
            title: "通用知识目录",
            hint: "智能体按任务需要读取和采纳这些目录中的内容。",
          },
          indexSkill: {
            title: "索引技能目录",
            hint: "每个目录可包含基于项目目录和知识目录生成的 SKILL.md 索引。",
          },
          workspaceData: {
            title: "工作区数据目录",
            hint: "默认使用 ~/.paseo/projects/{{projectId}}/workspaces/{{workspaceId}}，按项目隔离保存进度记录、审查材料和输出结果。",
          },
        },
        indexSkill: {
          title: "项目索引技能",
          info: "自动生成默认关闭。Git 类型的项目或知识目录会为每个分支生成独立索引；分支删除时同步删除对应索引。",
          autoGenerate: "自动生成索引技能",
          autoGenerateHint: "在每个已配置的索引技能目录中生成 SKILL.md。",
          projectInterval: "项目更新频率（分钟）",
          projectIntervalHint: "留空则继承全局的 {{minutes}} 分钟。",
          globalInterval: "全局更新频率（分钟）",
          globalIntervalHint: "用于未设置自定义更新频率的项目。",
          apply: "应用",
          validation: {
            interval: "请输入正整数分钟数，或留空以继承全局值。",
          },
        },
        variables: {
          title: "项目变量",
          info: "指令模板可通过 {{variableName}} 使用变量。",
          empty: "尚未配置变量。",
          namePlaceholder: "变量名",
          valuePlaceholder: "变量值",
          remove: "移除变量",
          validation: {
            invalidName: "变量名无效：{{name}}",
            duplicateName: "变量名重复：{{name}}",
          },
        },
        instructionTemplates: {
          title: "全局指令模板",
          info: "模板在当前主机的所有项目间共享，并使用当前项目的变量自动填充。",
          empty: "尚未配置指令模板。",
          idPlaceholder: "模板 ID",
          namePlaceholder: "模板名称",
          descriptionPlaceholder: "可选说明",
          contentPlaceholder: "使用 {{variables}} 的 Markdown 指令",
          remove: "移除指令模板",
          validation: {
            incomplete: "每个指令模板都必须填写 ID、名称和 Markdown 内容。",
            duplicateId: "模板 ID 重复：{{id}}",
          },
        },
      },
    },
  },
} as const;
