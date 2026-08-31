import { Command } from "commander";
import type {
  PluginLogEntry,
  PluginSourceStatusItem,
  PluginSourceUpdateItem,
  PluginSummary,
} from "@getpaseo/protocol/messages";
import type { CommandOptions, ListResult, OutputSchema, SingleResult } from "../../output/index.js";
import { withOutput } from "../../output/index.js";
import { addJsonAndDaemonHostOptions, addJsonOption } from "../../utils/command-options.js";
import { scaffoldPluginDirectory, type PluginScaffold } from "./scaffold.js";
import { withPluginLogsClient, withPluginSourceClient } from "./shared.js";
import {
  actOnUnifiedPlugin,
  installUnifiedPlugin,
  listUnifiedPlugins,
  removeUnifiedPlugin,
  unifiedPluginSchema,
} from "./unified-catalog.js";

interface PluginOptions extends CommandOptions {
  host?: string;
  id?: string;
  ref?: string;
  path?: string;
  all?: boolean;
}

const scaffoldSchema: OutputSchema<PluginScaffold> = {
  idField: "id",
  columns: [
    { header: "PLUGIN", field: "id", width: 20 },
    { header: "DIRECTORY", field: "directory", width: 60 },
  ],
};

const pluginLogsSchema: OutputSchema<PluginLogEntry> = {
  idField: (entry) => String(entry.sequence),
  columns: [
    { header: "TIME", field: "timestamp", width: 24 },
    { header: "STREAM", field: "stream", width: 8 },
    { header: "MESSAGE", field: "message", width: 80 },
  ],
};

function shortCommit(commit: string | undefined): string {
  return commit?.slice(0, 12) ?? "-";
}

const pluginStatusSchema: OutputSchema<PluginSourceStatusItem> = {
  idField: "id",
  columns: [
    { header: "PLUGIN", field: "id", width: 20 },
    { header: "SOURCE", field: "source", width: 10 },
    { header: "CURRENT", field: (plugin) => shortCommit(plugin.currentCommit), width: 14 },
    { header: "LATEST", field: (plugin) => shortCommit(plugin.latestCommit), width: 14 },
    { header: "COMMITS", field: (plugin) => String(plugin.commitsBehind ?? 0), width: 8 },
    { header: "REF", field: (plugin) => plugin.ref ?? "-", width: 24 },
  ],
};

const pluginUpdateSchema: OutputSchema<PluginSourceUpdateItem> = {
  idField: "id",
  columns: [
    { header: "PLUGIN", field: "id", width: 20 },
    { header: "PREVIOUS", field: (plugin) => shortCommit(plugin.previousCommit), width: 14 },
    { header: "CURRENT", field: (plugin) => shortCommit(plugin.currentCommit), width: 14 },
    { header: "COMMITS", field: (plugin) => String(plugin.commits), width: 8 },
    { header: "UPDATED", field: (plugin) => (plugin.updated ? "yes" : "no"), width: 8 },
  ],
};

export async function runPluginInitCommand(
  directory: string,
  options: PluginOptions,
  _command: Command,
): Promise<SingleResult<PluginScaffold>> {
  return {
    type: "single",
    data: await scaffoldPluginDirectory(directory, options.id),
    schema: scaffoldSchema,
  };
}

export async function runPluginListCommand(
  options: PluginOptions,
  _command: Command,
): Promise<ListResult<PluginSummary>> {
  return {
    type: "list",
    data: await listUnifiedPlugins(options.host),
    schema: unifiedPluginSchema,
  };
}

export async function runPluginLogsCommand(
  pluginId: string,
  options: PluginOptions,
  _command: Command,
): Promise<ListResult<PluginLogEntry>> {
  const data = await withPluginLogsClient(options.host, (client) => client.getPluginLogs(pluginId));
  return { type: "list", data, schema: pluginLogsSchema };
}

async function install(
  source: string,
  options: PluginOptions,
  _command: Command,
): Promise<SingleResult<PluginSummary>> {
  return {
    type: "single",
    data: await installUnifiedPlugin(source, options),
    schema: unifiedPluginSchema,
  };
}

async function status(
  pluginId: string | undefined,
  options: PluginOptions,
  _command: Command,
): Promise<ListResult<PluginSourceStatusItem>> {
  const data = await withPluginSourceClient(options.host, (client) =>
    client.getPluginSourceStatus(pluginId),
  );
  return { type: "list", data, schema: pluginStatusSchema };
}

async function update(
  pluginId: string | undefined,
  options: PluginOptions,
  _command: Command,
): Promise<ListResult<PluginSourceUpdateItem>> {
  if ((pluginId === undefined) === (options.all !== true)) {
    throw new Error("Choose one plugin ID or pass --all");
  }
  const data = await withPluginSourceClient(options.host, (client) =>
    client.updatePluginSources(pluginId),
  );
  return { type: "list", data, schema: pluginUpdateSchema };
}

async function act(
  action: "reload" | "enable" | "disable",
  pluginId: string,
  options: PluginOptions,
): Promise<SingleResult<PluginSummary>> {
  return {
    type: "single",
    data: await actOnUnifiedPlugin(action, pluginId, options.host),
    schema: unifiedPluginSchema,
  };
}

async function remove(
  pluginId: string,
  options: PluginOptions,
  _command: Command,
): Promise<SingleResult<PluginSummary>> {
  return {
    type: "single",
    data: await removeUnifiedPlugin(pluginId, options.host),
    schema: unifiedPluginSchema,
  };
}

export function createPluginCommand(): Command {
  const plugin = new Command("plugin").description("Manage trusted plugins");
  addJsonOption(
    plugin
      .command("init")
      .description("Create a typecheckable local plugin")
      .argument("<directory>")
      .option("--id <id>", "Manifest plugin ID (defaults to the directory name)"),
  ).action(withOutput(runPluginInitCommand));
  addJsonAndDaemonHostOptions(plugin.command("ls").description("List configured plugins")).action(
    withOutput(runPluginListCommand),
  );
  addJsonAndDaemonHostOptions(
    plugin.command("logs").description("Show recent plugin output").argument("<id>"),
  ).action(withOutput(runPluginLogsCommand));
  addJsonAndDaemonHostOptions(
    plugin
      .command("install")
      .alias("add")
      .description("Install a plugin from a directory or Git repository")
      .argument("<source>", "Host directory, owner/repo shorthand, or Git URL")
      .option("--id <id>", "Runtime plugin ID (defaults to paseo-plugin.json id)")
      .option("--ref <ref>", "Git branch, tag, or commit")
      .option("--path <path>", "Plugin directory within the repository"),
  ).action(withOutput(install));
  addJsonAndDaemonHostOptions(
    plugin.command("status").description("Check plugin source updates").argument("[id]"),
  ).action(withOutput(status));
  addJsonAndDaemonHostOptions(
    plugin
      .command("update")
      .description("Update a Git-managed plugin")
      .argument("[id]")
      .option("--all", "Update every Git-managed plugin"),
  ).action(withOutput(update));
  for (const action of ["reload", "enable", "disable"] as const) {
    addJsonAndDaemonHostOptions(
      plugin.command(action).description(`${action} a plugin`).argument("<id>"),
    ).action(
      withOutput((id: string, options: PluginOptions, _command: Command) =>
        act(action, id, options),
      ),
    );
  }
  addJsonAndDaemonHostOptions(
    plugin.command("remove").description("Remove plugin configuration").argument("<id>"),
  ).action(withOutput(remove));
  return plugin;
}
