// English resource changes that extend or intentionally replace upstream copy.
// Runtime resources merge these overrides after the stable upstream resource and feature additions.
export const englishTranslationOverrides = {
  common: {
    actions: {
      save: "Save",
    },
  },
  errors: {
    unableToSave: "Unable to save",
  },
  composer: {
    errors: {
      daemonClientDisconnected: "Daemon client is disconnected",
    },
  },
  agentStream: {
    changes: {
      summary: "Changed files ({{count}})",
      undo: "Undo",
      review: "Review",
      reviewFile: "Review {{fileName}}",
      confirmUndoTitle: "Undo changes from this turn?",
      confirmUndoMessage:
        "This will discard the uncommitted changes to {{count}} files from this turn. This action cannot be undone.",
      confirmUndo: "Undo changes",
      showMore: "Show {{count}} more files",
      showLess: "Show less",
    },
  },
  agentPanel: {
    taskSummary: {
      title: "Task summary",
      subtitle: "To-dos, outputs, and references for the current task",
      open: "Open task summary",
      close: "Close task summary",
      todos: "To-dos",
      outputs: "Task outputs",
      references: "References",
      emptyTodos: "No to-dos yet",
      emptyOutputs: "No task outputs yet",
      emptyReferences: "No references yet",
      emptyTitle: "No active task",
      emptyDescription: "Open an agent conversation to view its task summary.",
      openFile: "Open {{fileName}}",
    },
  },
  message: {
    compaction: {
      loading: "Compacting...",
      loadingAuto: "Automatically compacting context",
      loadingManual: "Manually compacting context",
    },
  },
  workspaceLabels: {
    manage: {
      deleteMessage: "This removes the label from {{count}} workspaces on this host.",
    },
  },
  sidebar: {
    project: {
      confirmations: {
        removeTitle: "Delete project?",
      },
      toasts: {
        updateHostToRemove: "Update the host to delete projects.",
      },
    },
  },
  memoryPolicies: {
    globalDisabledTitle: "Global memory is off",
    globalDisabledDescription:
      "This policy is saved, but Paseo will not use it until Memory is enabled in host settings.",
    users: {
      title: "Global memory user",
      description:
        "Agents only read and learn global memory for the selected user. Project and Assistant memory remains shared.",
      currentUser: "Current user",
      deleteUser: "Delete current user",
      newUserName: "New user name",
      newUserPlaceholder: "For example: Alex",
      createAndSwitch: "Create and switch",
      selectUser: "Select a user",
      noUsers: "No users",
      deleteTitle: 'Delete global memory user "{{name}}"?',
      deleteDescription:
        "This user's global memories, summary, and extraction rules will be permanently deleted. Other memory scopes are not affected.",
      deleteConfirm: "Delete user",
    },
    sync: {
      sectionTitle: "Multi-host memory sync",
      title: "Share memory between hosts",
      description:
        "Merge Global, Project, and Assistant memories with another connected Paseo host. Existing target memories are preserved.",
      targetHost: "Other host",
      selectHost: "Select a connected host",
      noHosts: "No other compatible hosts are connected",
      scope: "Memory scope",
      selectScope: "Select memory to synchronize",
      noScopes: "No memory scopes are available",
      scopes: {
        global: "Global memory (current user)",
        project: "Project · {{name}}",
        assistant: "Assistant · {{name}}",
      },
      online: "Online",
      offline: "Offline",
      push: "Sync to host",
      pull: "Sync from host",
      twoWay: "Two-way sync",
      syncing: "Syncing…",
      disconnected: "Both hosts must be online before memory can be synchronized.",
      failed: "Memory sync failed",
      completed: "Memory sync completed",
      result: "{{source}} → {{target}}: {{total}} memories after sync ({{added}} added)",
      scopeHint:
        "Each operation synchronizes only the selected Global, Project, or Assistant memory. Sync is idempotent; Projects and Assistants match by ID.",
    },
    scopeManager: {
      title: "Memory rules",
      description:
        "Manage which durable information Global, Project, and Assistant memory may save.",
      scopeType: "Memory scope",
      target: "Target",
      selectScopeType: "Select a memory scope",
      selectTarget: "Select a target",
      noScopes: "No memory scopes",
      noTargets: "No matching Projects or Assistants",
      types: {
        global: "Global",
        project: "Project",
        workspace: "Workspace",
        assistant: "Assistant",
      },
      enabledTitle: "{{scope}} memory",
      enabledHint:
        "Use memory from this scope in matching conversations and allow automatic learning into it.",
      instructionsTitle: "What should be saved",
      instructionsHint:
        "Describe the durable information that belongs in this scope. These rules guide learning and are not added to visible Agent prompts.",
      instructionsPlaceholder:
        "Example: Save confirmed conventions, reusable procedures, and stable decisions. Ignore temporary failures and one-off requests.",
      save: "Save rules",
      saving: "Saving…",
      saved: "Saved",
      saveError: "Unable to save memory rules",
    },
    contentManager: {
      title: "Memory content",
      description:
        "Browse long-term memory by Global, Project, or Assistant scope. Project is the finest-grained memory level and can roll up to Assistant and Global.",
      pageTitle: "Memory management",
      detailTitle: "Memory details",
      manage: "Manage memory content",
      manageDescription:
        "{{count}} memories are available. View the memory overview and details in the right pane.",
      openManager: "Open",
      backToList: "Back to memory list",
      loading: "Loading memory…",
      notFound: "This memory does not exist or has been deleted.",
      errorTitle: "Unable to manage memory",
      scopeEditHint:
        "Changing the scope moves this memory to the selected Global, Project, or Assistant scope.",
      search: "Search",
      searchPlaceholder: "Search titles, content, or keywords",
      status: "Status",
      allStatuses: "All statuses",
      noStatuses: "No statuses",
      targetDescription: "{{id}} · {{count}} memories",
      selectTargetFirst: "Select a target to manage its memory.",
      empty: "No long-term memory has been saved yet.",
      noMatches: "No memories in this scope match the current filters.",
      views: {
        overview: "Overview",
        details: "Memory details",
      },
      overviewTitle: "Memory overview",
      overviewDescription:
        "The overview and detail index for this scope. Paseo rebuilds the index from active memories after saving.",
      overviewPath: "File path",
      saveOverview: "Save overview",
      overviewUnavailable: "No memory overview has been generated for this scope.",
      pagination: {
        pageSize: "Items per page",
        noPageSizes: "No page sizes available",
        page: "Page {{page}} of {{totalPages}}",
        range: "Showing {{start}}–{{end}} of {{total}}",
        previous: "Previous",
        next: "Next",
      },
    },
  },
  workflows: {
    title: "Local workflows",
    actions: {
      refresh: "Refresh",
      new: "New workflow",
      save: "Save",
      delete: "Delete",
      discard: "Discard",
      run: "Run",
      cancel: "Cancel",
      retry: "Try again",
      create: "Create one",
      guide: "Usage guide",
    },
    guide: {
      title: "Workflow usage guide",
      intro:
        "A workflow is a reusable JSON script stored on the selected Paseo host. It can be started from Paseo, by an Agent, from the CLI, or from server code.",
      contract: {
        title: "Input and output contract",
        description:
          "Paseo assembles every node input: data comes from the previous node output data, origin_input keeps the original Workflow launch input unchanged, and the Workflow framework fills workflow.var and node.var.",
        note: 'Every node result must contain {"data":{}} with a JSON object. Include modify only to update Workflow variables and base_resp only to report a business error. node.var is read-only, and the framework fills artifacts.',
      },
      internal: {
        title: "Use inside Paseo",
        visualTitle: "Run from this page",
        visualDescription:
          "Select a workflow, enter the initial JSON under Test run, choose the whole workflow or one node, and click Run. The latest run and every node input/output are shown below.",
        agentTitle: "Run from an Agent",
        agentDescription:
          "An Agent can call list_workflows, inspect_workflow, run_workflow, get_workflow_run, and cancel_workflow. Set targetNodeId to test one node. Example run_workflow arguments:",
        serverTitle: "Run from server code",
        serverDescription:
          "Internal server integrations can call WorkflowService directly and wait for the terminal result:",
      },
      external: {
        title: "Use outside Paseo",
        cliTitle: "Run from CLI or a shell script",
        cliDescription:
          "Use the CLI for local scripts, CI, cron jobs, and other processes that can connect to the daemon. Add --node <node-id> to test one node:",
        backgroundTitle: "Start asynchronously",
        backgroundDescription:
          "Use --background to return immediately. The returned run ID can be inspected or cancelled later.",
        hostNote:
          "The workflow path is resolved on the daemon host. Use --host with the CLI when connecting to another Paseo daemon.",
      },
      nodes: {
        title: "Node behavior",
        bash: "• Bash: receives the input JSON in the configured input variable and assigns exactly one result JSON string to the configured output variable. Paseo writes it to file descriptor 3; stdout/stderr are logs.",
        python:
          "• Python: receives the parsed input object in the configured input variable and assigns exactly one result object to the configured output variable. Paseo serializes it to file descriptor 3.",
        agent:
          "• Agent: Normal mode writes the final reply to data.answer. Custom mode requires the Agent to return the complete result envelope.",
        switch: "• Switch: resolves switchVar and selects the matching branch.",
        for: "• For: iterates an array, counts down a number, or runs continuously. Each iteration starts from the For node input.data; use loop variables for cross-iteration state.",
      },
    },
    host: {
      select: "Select host",
      empty: "No hosts",
      title: "Workflow host",
      notConfigured: "No host configured",
      offline: "Selected host is offline",
      hint: "Workflows are stored on the selected host under ~/.paseo/workflows.",
    },
    inputContract: {
      title: "Workflow data contract",
      description:
        "The first node input schema is the workflow input schema. Define shared variables, the final output schema, and reusable payloads here.",
      contract: "Workflow variables",
      contractHint: 'Variable types are "string" and "int64". int64 values use decimal strings.',
      outputSchema: "Workflow output.data schema",
      outputSchemaHint: "Validates the final output.data before the Workflow succeeds",
      nodeVariables: "Node variables",
      nodeVariablesHint:
        'Declare read-only constants visible only to this node. Types are "string" and "int64".',
      invalidVariables: "Workflow variables must be a JSON object.",
      invalidOutputSchema: "Workflow output schema must be a JSON object.",
      invalidPresets: "Input presets must be a JSON array.",
      presets: "Input presets",
      presetsHint:
        "Store fixed resource URLs and smoke, prepare-only, or full-run payloads as reusable presets.",
      preset: "Input preset",
      presetHint: "Selecting a preset copies its payload into the editable run input.",
      selectPreset: "Select a preset",
      noPresets: "No input presets",
      selectValue: "Select a value",
      true: "True",
      false: "False",
    },
    environment: {
      title: "Command environment",
      description:
        "Configure the environment inherited by Bash and Python nodes. Agent nodes keep their provider-managed environment.",
      inherit: "Inherited environment",
      daemon: "Daemon environment",
      daemonHint: "Use the environment that started the Paseo daemon.",
      loginShell: "Login shell environment",
      loginShellHint: "Load the user's login shell once, including its PATH.",
      variables: "Environment variables (JSON)",
      variablesHint: "These string values override inherited variables for every command node.",
    },
    graph: {
      title: "Workflow graph",
      designHint:
        "Shows dependencies, order, branches, merges, and loops. Drag nodes or connection handles to adjust the layout.",
      runHint:
        "Shows live status, active paths, duration, and execution count. Select a node for I/O.",
      nodeCount: "{{count}} nodes",
      leftToRight: "Left to right",
      start: "Start",
      end: "End",
      dependencies: "Depends on",
      startNode: "Workflow start",
      branches: "Branches",
      caseBranch: "control = {{value}}",
      defaultBranch: "Default branch",
      loopBody: "Loop body",
      loopBack: "Next iteration",
      emptyBranch: "No nodes in this branch",
      merge: "Merge and continue",
      executions: "Executions",
      executionCount: "{{count}} runs",
      selectNodeHint: "Select a node to inspect every attempt and its complete input and output.",
      nodeDetails: "Selected node details",
      nodeNotRun: "This node has not run",
      executionAttempt: "Attempt {{attempt}} of {{count}}",
      fullView: "Full plan",
      fullViewTitle: "Complete workflow graph",
      fullViewHint:
        "Inspect the full dependency graph and execution path, zoom it, or open a node.",
      zoomIn: "Zoom in workflow graph",
      zoomOut: "Zoom out workflow graph",
      resetZoom: "Reset workflow graph zoom",
      resetLayout: "Reset layout",
      nodeName: "Node name",
      nodeId: "Node ID",
      nodeType: "Node type",
      configuration: "Complete node configuration",
      status: {
        not_run: "Not run",
        running: "Running",
        succeeded: "Succeeded",
        failed: "Failed",
        cancelled: "Cancelled",
        timed_out: "Timed out",
        skipped: "Skipped",
      },
    },
    dialogs: {
      discardTitle: "Discard unsaved changes?",
      discardMessage: "Your current workflow changes have not been saved.",
      deleteTitle: "Delete workflow?",
      deleteMessage: "This permanently deletes {{name}}.",
    },
    messages: {
      notFound: "Workflow was not found",
      saveFailed: "Workflow could not be saved",
      fieldRequired: "This field is required",
      saved: "Workflow saved",
      deleted: "Workflow deleted",
      inputRequired: "Enter an input JSON object",
      invalidInputJson: "Input must be a valid JSON object matching the first node input schema",
      invalidNodeInputJson:
        "Direct node input must contain data, origin_input, workflow.var, and node.var objects",
      startFailed: "Workflow could not be started",
      started: "Workflow started",
      cancelFailed: "Workflow run could not be cancelled",
      cancelled: "Workflow cancelled",
      loadFailed: "Unable to load workflows",
      agentNotFound: "The Agent created by this workflow could not be found",
    },
    editor: {
      untitled: "Untitled workflow",
      unsaved: "Unsaved",
      generatedFileName: "A file name will be generated on first save",
      name: "Workflow name",
      nodes: "nodes",
      description: "Description",
      descriptionPlaceholder: "What does this workflow do?",
      workflowTimeout: "Workflow timeout (seconds)",
      workflowTimeoutHint: "Maximum duration for the whole run.",
      taskTimeout: "Task timeout (seconds)",
      taskTimeoutHint: "Default for Bash, Python, Agent, and Workflow nodes.",
      defaultAttempts: "Default attempts",
      defaultAttemptsHint: "Includes the first execution.",
      promptTemplates: "Prompt templates",
      promptTemplatesHint:
        "Create reusable templates for this host. Selecting one on an Agent node copies its content, so node edits never change the original template.",
      flow: "Flow",
      flowHint: "JSON payloads pass automatically from top to bottom.",
      testRun: "Test run",
      testRunHint: "Run this workflow on the selected host with an initial JSON payload.",
      testRunUpstreamHint:
        "Test the selected node using the previous node output or the original Workflow input.",
      testRunNodeInputHint:
        "Test the selected node by passing its complete input directly, without framework mapping or variable filling.",
      inputJson: "Input JSON",
      nodeInputJson: "Node input JSON",
      inputJsonHint:
        "Enter workflow business inputs. Node mappings select the fields each node receives.",
      nodeInputJsonHint:
        "Enter the complete node input JSON, including origin_input. Paseo passes it directly without input mapping or filling Workflow, Loop, or Node variables.",
      runTarget: "Run target",
      runTargetHint: "Run the whole workflow, or test one node with the configured input JSON.",
      runEntireWorkflow: "Entire workflow",
      noRunTargets: "No runnable nodes",
      inputMode: "Input type",
      inputModeHint: "Choose how the JSON above becomes the selected node input.",
      selectInputMode: "Select input type",
      inputModes: {
        upstreamOutput: "Previous node output / Workflow original input",
        upstreamOutputDescription:
          "Apply input mapping and let Paseo fill Workflow, Loop, and Node variables.",
        nodeInput: "This node's input",
        nodeInputDescription:
          "Pass the complete node input, including origin_input, without mapping or variable filling.",
      },
      emptyTitle: "Select or create a workflow",
      emptyDescription:
        "Build Bash, Python, Agent, Workflow, Switch, and For nodes without editing JSON.",
    },
    list: {
      title: "Saved workflows",
      empty: "No workflows yet",
      nodeCount: "{{count}} nodes",
    },
    run: {
      output: "Output: {{path}}",
      payload: "Payload: {{payload}}",
      startedAt: "Started",
      endedAt: "Ended",
      duration: "Duration",
      targetNode: "Target node",
      notFinished: "Not finished",
      input: "Input",
      outputPayload: "Output",
      inputFile: "Input file",
      outputFile: "Output file",
      control: "Control",
      iteration: "Iteration path",
      processOutput: "Bash output",
      pythonProcessOutput: "Python output",
      stdout: "Standard output (stdout)",
      stderr: "Error output (stderr)",
      nodeOutput: "Node output",
      userInput: "User input",
      agentAnswer: "Agent answer",
      agentProcess: "Agent process",
      errorCode: "Error code",
      workflow: "Workflow",
      workflowRunId: "Child run ID",
      expandedInstruction: "Expanded command or prompt",
      cwd: "Working directory",
      environment: "Environment source",
      path: "PATH",
      exitCode: "Exit code",
      signal: "Signal",
      skippedReason: "Skipped because",
      environmentSource: {
        daemon: "Daemon environment",
        "login-shell": "Login shell environment",
      },
      status: {
        running: "Running",
        succeeded: "Succeeded",
        failed: "Failed",
        cancelled: "Cancelled",
        timed_out: "Timed out",
      },
    },
    nodes: {
      emptyBranch: "No nodes in this branch.",
      add: "Add node",
      moveUp: "Move node up",
      moveDown: "Move node down",
      delete: "Delete node",
      openDetails: "Open {{name}} node details",
      id: "Node ID",
      displayName: "Display name",
      downstream: {
        label: "Downstream node",
        hint: "Choose the sibling node to run after this node completes.",
        sequential: "Follow list order",
        sequentialDescription: "Run the next node in the list.",
        end: "End sequence",
        endDescription: "End this sequence after the current node completes.",
        missing: "Missing node: {{id}}",
        placeholder: "Select downstream node",
        empty: "No downstream nodes available",
      },
      defaultNames: {
        bash: "Bash command",
        python: "Python code",
        agent: "Agent",
        switch: "Switch",
        for: "For each",
      },
      types: {
        bash: "Bash",
        python: "Python",
        agent: "Agent",
        switch: "Switch",
        for: "For",
      },
      typeDescriptions: {
        bash: "Run a shell command",
        python: "Run Python code",
        agent: "Run an AI agent",
        switch: "Branch on an explicit expression",
        for: "Iterate over an explicit array",
      },
      contract: {
        title: "Node data contract",
        description:
          "Build input.data, declare node variables, and validate the input.data and output.data objects.",
        inputs: "input.data mapping (optional)",
        inputsHint:
          "Builds this node's input.data before execution. Leave empty to use the previous node's output.data. Use it to select, rename, or combine fields. Example: {{nodes.scan.outputs.items}}.",
        inputSchema: "input.data schema validation",
        outputSchema: "output.data schema validation (optional)",
        schemaHint: "Optional. Paseo validates the object before continuing.",
        invalidJson: "Enter valid JSON.",
        objectRequired: "The value must be a JSON object.",
      },
      contractHints: {
        inputSchema: "Validates the input.data received by this node after mapping",
        outputSchema:
          "Validates the output.data produced by this node so output errors are attributed here. It does not replace downstream input.data schema validation.",
      },
      schemaCompatibility: {
        title: "data schema compatibility warnings",
        workflowOutput: "Workflow output.data",
        requiredNotGuaranteed:
          '{{source}} → {{target}}: the output.data schema does not guarantee required field "{{path}}"',
        fieldNotAccepted:
          '{{source}} → {{target}}: output.data may contain field "{{path}}", but the downstream input.data schema does not accept it',
        typeMismatch:
          '{{source}} → {{target}}: output.data field "{{path}}" is {{outputTypes}}, but the downstream input.data schema expects {{inputTypes}}',
      },
      help: {
        show: "Show {{type}} node input and output help",
        title: "{{type}} node input and output",
        inputTitle: "Read input",
        outputTitle: "Write output",
        initialValueTitle: "Initial example for new nodes",
        initialValueDescription:
          "New nodes are prefilled with this example and remain fully editable.",
        compositionTitle: "Run another workflow",
        compositionDescription:
          "Use a Bash node to call paseo workflow run, then assign the successful child outputPayload to the configured output variable.",
        bash: {
          input:
            "Paseo assembles the node input: data comes from the previous node output data, origin_input keeps the original Workflow launch input unchanged, and the framework fills workflow.var and node.var. Inside For, it also fills the innermost loop.var object. The configured input variable receives the complete JSON string from stdin.",
          output:
            "The result must contain a JSON object in data. Use modify.workflow.var for Workflow variables and modify.loop.var for custom variables of the innermost For loop. node.var and loop.var.item/index/count are read-only. Add base_resp only for a business error; the framework fills artifacts. Paseo writes the configured output variable to file descriptor 3; stdout/stderr remain logs.",
        },
        python: {
          input:
            "Paseo assembles the node input: data comes from the previous node output data, origin_input keeps the original Workflow launch input unchanged, and the framework fills workflow.var and node.var. Inside For, it also fills the innermost loop.var object. The configured input variable receives the complete parsed object.",
          output:
            "The result must contain a JSON object in data. Use modify.workflow.var for Workflow variables and modify.loop.var for custom variables of the innermost For loop. node.var and loop.var.item/index/count are read-only. Add base_resp only for a business error; the framework fills artifacts. Paseo serializes the configured output variable to file descriptor 3.",
        },
        agent: {
          input:
            "Paseo assembles one node input object: data comes from the previous node output data, origin_input keeps the original Workflow launch input unchanged, the framework fills workflow.var and node.var, project.var comes from the selected Project, and inside For it fills the innermost loop.var. Prompts read these fields directly with data.*, origin_input.*, workflow.var.*, project.var.*, loop.var.*, and node.var.*. Use {{input}} only when the complete object is needed.",
          output: 'Normal mode wraps the final Agent reply as {"data":{"answer":"..."}}.',
          controlOutput:
            "Custom mode requires the final Agent reply to contain a JSON object in data. Include modify.workflow.var or modify.loop.var only when needed; do not modify node.var or loop.var.item/index/count, and do not output artifacts.",
        },
        switch: {
          input: "Resolve switchVar, then compare the native value with each configured case.",
          output:
            "Switch does not rewrite data. The selected branch's final JSON becomes the node output.",
        },
        for: {
          input:
            "Array mode requires a JSON array; Number mode requires a non-negative integer; True mode runs continuously. Every iteration's first body node receives the original For input.data plus the innermost loop.var object.",
          output:
            'The final completed iteration becomes the For output. A "break" result stops scheduling iterations; "continue" skips the remaining body nodes. Persist cross-iteration state through custom loop variables.',
        },
      },
      expandedEditor: {
        defaultTitle: "Input content",
        open: "Expand {{field}}",
        subtitle: "Edit in a larger text area. Changes are applied only when you select Done.",
        done: "Done",
      },
      common: {
        workingDirectory: "Working directory",
        inputFileDirectory: "Input file directory",
        timeout: "Timeout (seconds)",
        providerDefault: "Provider default",
        optional: "Optional",
        inputVariable: "Input variable",
        bashInputVariableHint:
          'Variable name that receives the complete node input JSON string in the Bash command. For the default variable "input", mapped data is under input.data, the original Workflow input under input.origin_input, Workflow variables under input.workflow.var, the innermost For variables under input.loop.var, and node constants under input.node.var.',
        pythonInputVariableHint:
          'Variable name that receives the complete parsed node input object in Python. For the default variable "input", mapped data is under input["data"], the original Workflow input under input["origin_input"], Workflow variables under input["workflow"]["var"], the innermost For variables under input["loop"]["var"], and node constants under input["node"]["var"].',
        outputVariable: "Output variable",
        bashOutputVariableHint:
          "Before the command succeeds, assign a result JSON string containing the required data object to this variable.",
        pythonOutputVariableHint:
          "Before the code succeeds, assign a result object containing the required data object to this variable.",
        environment: "Node environment overrides (JSON)",
        environmentHint:
          "Optional string values merged over the Workflow command environment for this command node.",
        environmentStringValues: "Environment variable values must be strings.",
      },
      bash: {
        initialCommand: "Initial command",
        initialCommandHint:
          "Use template variables or the configured input variable. The result must contain a data object; add modify and base_resp only when needed. stdout/stderr are logs.",
        shell: "Shell",
      },
      python: {
        code: "Python code",
        codeHint:
          "Define inline code, or leave it empty and configure a module and function. Inline code reads the input variable and assigns the output variable.",
        module: "Python module",
        moduleHint:
          "Optional dotted module path. Configure it together with a function instead of inline code.",
        function: "Python function",
        functionHint:
          "Function that receives the complete parsed node input and returns the node result object. Async functions are supported.",
        interpreter: "Python interpreter",
        interpreterHint: 'Leave empty to use "python3".',
      },
      agent: {
        promptTemplate: "Prompt template",
        promptTemplateHint:
          "Copies the selected template into this node. The node remains independently editable.",
        selectPromptTemplate: "Choose a template to copy",
        systemPromptTemplate: "System prompt template",
        selectSystemPromptTemplate: "Choose a template to copy into the system prompt",
        noPromptTemplates: "No prompt templates are configured on this host.",
        outputType: "Agent node type",
        outputTypeHint:
          "Normal mode writes the final reply to data.answer. Custom mode expects a result containing the required data object.",
        selectOutputType: "Select an Agent node type",
        noOutputTypes: "No Agent node types are available.",
        outputTypes: {
          normal: "Normal",
          normalDescription: 'Converts the Agent reply to {"data":{"answer":"Agent reply"}}.',
          custom: "Custom",
          customDescription:
            "Parses the Agent reply as the node result. data is required; modify and base_resp are optional.",
        },
        initialPrompt: "Initial prompt",
        initialPromptHint:
          "All variables come from the node input. Use data.*, origin_input.*, workflow.var.*, project.var.*, loop.var.*, and node.var.* paths.",
        executionPolicy: "Execution policy",
        lifecycle: "Agent lifecycle",
        lifecycleHint:
          "Controls how long this Agent node reuses the same Agent. Reused Agent calls run in order.",
        selectLifecycle: "Select Agent lifecycle",
        lifecycleOptions: {
          workflow: "Entire Workflow",
          workflowDescription:
            "Create on first execution, reuse it, and release it when the Workflow ends.",
          for: "Current For loop",
          forDescription:
            "Create on the first iteration, reuse it within the current For loop, and release it when the loop exits.",
          single: "Single execution",
          singleDescription: "Create a new Agent for every execution without reuse.",
        },
        subsequentPromptMode: "Non-first prompt",
        subsequentPromptModeHint:
          "Choose what to send when this node invokes an Agent that was already initialized.",
        selectSubsequentPromptMode: "Select the non-first prompt behavior",
        subsequentPromptModes: {
          reuseInitial: "Reuse initial prompt",
          reuseInitialDescription: "Render the initial prompt again using the current node input.",
          custom: "Custom prompt",
          customDescription: "Use a separate prompt for every invocation after the first.",
        },
        subsequentPrompt: "Custom non-first prompt",
        subsequentPromptHint: "Uses the same node input paths as the initial prompt.",
        timeoutHint: "Leave empty to use the workflow task default.",
        provider: "Provider",
        model: "Model",
        mode: "Mode",
        thinking: "Thinking option",
        isolation: "Isolation",
        isolationSelect: "Select isolation",
        isolationEmpty: "No isolation modes",
        isolationTitle: "Agent isolation",
        localDirectory: "Local directory",
        isolatedWorktree: "Isolated worktree",
        approvalPolicy: "Approval policy",
        sandboxMode: "Sandbox mode",
        assistantOrTeam: "Assistant or team",
        systemPrompt: "System prompt",
        systemPromptPlaceholder: "Optional additional system prompt",
        systemPromptHint:
          "Uses the same node input paths as the user prompt and is sent separately through the provider's system-instruction channel.",
        systemPromptConfiguredHint:
          "Configured. Template variables are rendered at runtime and sent separately through the provider's system-instruction channel.",
        archive: "Archive agent after completion",
        archiveAtLifecycleEnd: "Automatically archive when the Agent lifecycle ends",
        network: "Allow network access",
        webSearch: "Allow web search",
        selectProvider: "Select a provider",
        noProviders: "No providers are available on this host.",
        selectModel: "Select a model",
        noModels: "No models are available for this provider.",
        selectMode: "Select a mode",
        noModes: "No modes are available for this provider.",
        selectThinking: "Select a thinking option",
        noThinking: "No thinking options are available for this model.",
        selectApprovalPolicy: "Select an approval policy",
        noApprovalPolicies: "No approval policies are available.",
        selectSandboxMode: "Select a sandbox mode",
        noSandboxModes: "No sandbox modes are available.",
        selectAssistantOrTeam: "Select an assistant or team",
        noAssistantsOrTeams: "No assistants or teams are available on this host.",
        teamOptionDescription: "Team · Leader: {{leader}} · {{count}} assistants",
        approvalOptions: {
          onRequest: "On request",
          never: "Never",
          untrusted: "Untrusted commands",
          onFailure: "On failure",
        },
        sandboxOptions: {
          readOnly: "Read only",
          workspaceWrite: "Workspace write",
          fullAccess: "Full access",
        },
      },
      variables: {
        bashTitle: "Bash variables",
        pythonTitle: "Python variables",
        agentTitle: "Agent input variables",
        bashDescription:
          "Define reusable values for the command. Values may reference payload paths or built-in variables.",
        pythonDescription:
          "Define reusable values for the Python code. Values may reference payload paths or built-in variables.",
        agentDescription:
          "Agent prompts use the node input as their only variable source. Read current business data from data.*, the original Workflow launch input from origin_input.*, Workflow variables from workflow.var.*, selected Project variables from project.var.*, the innermost For variables from loop.var.*, and node constants from node.var.*. Define Project variables in Project settings and node constants in the node data contract below.",
        examplesTitle: "Variable examples",
        inputExample: "With this input JSON:",
        nestedObjectExample: "Nested object field",
        arrayExample: "Array item field",
        controlExample: "Required control field",
        payloadExample: "Complete JSON payload",
        customExample: 'Custom variable, for example role = "reviewer"',
        bashUsageExample: "Bash command example:",
        pythonUsageExample: "Python code example:",
        agentUsageExample: "Agent user or system prompt example:",
        showHelp: "Show variable usage examples",
        add: "Add variable",
        name: "name",
        value: "value",
        delete: "Delete variable {{name}}",
      },
      retry: {
        title: "Retry policy",
        description: "Overrides workflow defaults. Retried commands should be idempotent.",
        attempts: "Attempts",
        workflowDefault: "Workflow default",
        initialDelay: "Initial delay (seconds)",
        maxDelay: "Max delay (seconds)",
        backoff: "Backoff",
        jitter: "Add jitter to retry delays",
      },
      switch: {
        switchOn: "Value expression",
        switchOnHint: "Select the value to compare, for example {{data.decision}}.",
        caseSensitive: "Case-sensitive matching",
        valueEquals: "Value equals",
        deleteBranch: "Delete branch",
        addBranch: "Add branch",
        defaultBranch: "Default branch",
        defaultDescription: "Runs when no case matches. It may be empty.",
      },
      for: {
        mode: "Loop type",
        modeArray: "Array",
        modeNumber: "Number",
        modeTrue: "True",
        selectMode: "Select loop type",
        executionMode: "Execution mode",
        executionModeHint:
          "Serial runs iterations in order; Parallel runs multiple iterations at once.",
        executionSerial: "Serial",
        executionParallel: "Parallel",
        selectExecutionMode: "Select execution mode",
        items: "Loop items expression",
        itemsHint:
          "Array mode must resolve to a JSON array; Number mode must resolve to a non-negative integer.",
        maximumIterations: "Maximum iterations",
        maximumIterationsHint: "Maximum number of iterations. Defaults to 100; 0 means unlimited.",
        concurrency: "Concurrency",
        concurrencyHint:
          "Iterations running at once in Parallel mode. Defaults to 1, maximum 100. Every iteration starts from the same For input.data.",
        control: "Loop control expression",
        controlHint:
          'Resolve a user-defined data field. "break" stops the loop, "continue" skips the remaining body nodes, and an empty or missing field continues normally.',
        breakWhen: "Break condition",
        breakWhenHint:
          "Optional expression that must resolve to a boolean. True ends the loop after the current body node.",
        continueWhen: "Continue condition",
        continueWhenHint:
          "Optional expression that must resolve to a boolean. True skips the remaining body nodes for this iteration.",
        loopBody: "Loop body",
        loopDescription:
          'A "continue" control skips the remaining nodes in the current iteration; "break" ends the loop.\nloop.var.item: array item; remaining number before the iteration; or true in True mode.\nloop.var.index: zero-based iteration index.\nloop.var.count: array length, initial number, or the True-mode maximum (0 when unlimited).\nEach iteration starts from the For input.data. Use custom loop.var variables to carry state into the next iteration.',
        loopVariables: "For loop variables",
        loopVariablesHint:
          "Stored under loop.var and shared only inside this For loop. Nested For bodies see only the innermost loop.var object. Serial mode can update custom variables through modify.loop.var.",
        parallelLoopVariablesHint:
          "Parallel iterations can read initial Loop variable values, but cannot update them through modify.loop.var, preventing concurrent conflicts.",
        loopVariableDefinitions: "Custom loop variables",
        loopVariableDefinitionsHint:
          'Declare additional loop.var.* variables using "string" or "int64". item, index, and count are built-in and read-only.',
      },
    },
  },
  desktop: {
    windowName: {
      renameTitle: "Rename window",
      placeholder: "Window name",
    },
  },
  communityLinks: {
    star: "Star",
    sponsor: "Sponsor",
    community: "Community",
  },
  pairing: {
    device: {
      relayListTitle: "Relay list",
      hintMultiple: "Use any available Relay pairing address to connect this device.",
      access: {
        title: "Client management",
        requireApproval: "Require client approval",
        requireApprovalHint:
          "When enabled, new clients must be approved here before they can connect.",
        empty: "No client connection requests.",
        pending: "Pending",
        allowed: "Allowed",
        approved: "Approved",
        paused: "Paused",
        connected: "Connected",
        disconnected: "Disconnected",
        hostname: "Hostname",
        identityId: "Identity ID",
        endpoint: "IP / port",
        endpointUnavailable: "Unavailable",
        lastConnectedAt: "Last connected",
        neverConnected: "No record",
        unknownName: "Unknown client",
        approve: "Approve",
        approving: "Approving...",
        pause: "Pause",
        pausing: "Pausing...",
        resume: "Resume",
        resuming: "Resuming...",
        delete: "Delete",
        deleting: "Deleting...",
        macClient: "Mac",
        androidClient: "Android",
        cliClient: "CLI",
        browserClient: "Browser",
      },
    },
  },
  settings: {
    projectList: {
      hostLoadTimedOut: "Host {{hostName}} did not respond in time. Try again.",
    },
    notifications: {
      enabled: "Send system notifications",
      enabledHint: "Send a macOS system notification when a task finishes or needs attention.",
      disabledHint: "Turn on system notifications before testing",
      island: "Dynamic Island",
      islandHint: "Show Paseo unread messages and task status at the top of the Mac screen.",
      islandShowWhenFocused: "Show while Paseo is focused",
      islandShowWhenFocusedHint:
        "Keep the Dynamic Island visible while Paseo is in the foreground.",
      islandTest: "Test Dynamic Island",
      islandTestHint: "Send a test message to verify that the Dynamic Island is working.",
      islandTestTitle: "Paseo Dynamic Island test",
      islandTestBody: "If you can see this message, the Dynamic Island is working.",
      islandTestSuccess: "Test message sent",
      islandTestSuccessHint: "Check the Paseo Dynamic Island at the top of the Mac screen.",
      islandTestFailed: "Unable to send test message",
      islandTestFailedHint: "Check your settings and try the Dynamic Island test again.",
    },
    hostSections: {
      assistants: "Assistants",
      memory: "Memory",
      knowledge: "Knowledge",
      mcp: "MCP",
      skills: "Skills",
      channels: "Channels",
    },
    appearance: {
      chatOutline: {
        title: "Prompt history navigation",
        description: "Show prompt markers beside the chat; hover to preview and click to jump",
      },
    },
    permissions: {
      notifications: "Notifications",
      actions: {
        busySuffix: "{{label}}...",
        busyExtraAction: "{{label}}...",
      },
    },
  },
} as const;
