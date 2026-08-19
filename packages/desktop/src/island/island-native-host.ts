import { existsSync } from "node:fs";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";
import { parseNativeIslandHostMessage } from "./island-native-protocol.js";

const NATIVE_HOST_STARTUP_TIMEOUT_MS = 5_000;

export interface NativeIslandRendererState {
  expanded: boolean;
  items: readonly unknown[];
}

export interface NativeIslandHostCallbacks {
  onAction: (action: "open" | "dismiss" | "clear", id?: string) => void;
  onExpandedChange: (expanded: boolean) => void;
  onExit: () => void;
}

export function resolveIslandNativeHostPath(): string | null {
  if (process.platform !== "darwin" || !app.isPackaged) return null;
  const helperPath = path.join(process.resourcesPath, "native", "paseo-island-host");
  return existsSync(helperPath) ? helperPath : null;
}

export class NativeIslandHost {
  readonly #callbacks: NativeIslandHostCallbacks;
  #child: ChildProcessWithoutNullStreams | null = null;
  #stopping = false;
  #failureReported = false;
  #startupTimer: NodeJS.Timeout | null = null;

  constructor(callbacks: NativeIslandHostCallbacks) {
    this.#callbacks = callbacks;
  }

  get isRunning(): boolean {
    return this.#child !== null && this.#child.exitCode === null;
  }

  start(helperPath: string, html: string): boolean {
    if (this.isRunning) return true;
    this.#stopping = false;
    this.#failureReported = false;
    try {
      const child = spawn(helperPath, [], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });
      this.#child = child;
      createInterface({ input: child.stdout }).on("line", (line) => this.#handleLine(line));
      createInterface({ input: child.stderr }).on("line", (line) => {
        log.warn("[island-native] helper stderr", { line });
      });
      child.stdin.on("error", (error) => {
        log.warn("[island-native] helper stdin error", { error });
        this.#reportFailure(child);
        this.#terminate(child);
      });
      child.on("error", (error) => {
        log.error("[island-native] helper process error", { error });
        this.#reportFailure(child);
      });
      child.on("exit", (code, signal) => {
        if (this.#child === child) this.#child = null;
        this.#clearStartupTimer();
        log.info("[island-native] helper exited", {
          code,
          signal,
          stopping: this.#stopping,
        });
        if (!this.#stopping) this.#reportFailure(child);
      });
      this.#send({ type: "init", html });
      this.#startupTimer = setTimeout(() => {
        if (this.#child !== child || this.#stopping) return;
        log.error("[island-native] helper readiness timed out", {
          pid: child.pid,
          timeoutMs: NATIVE_HOST_STARTUP_TIMEOUT_MS,
        });
        this.#reportFailure(child);
        this.#terminate(child);
      }, NATIVE_HOST_STARTUP_TIMEOUT_MS);
      this.#startupTimer.unref();
      log.info("[island-native] helper started", { pid: child.pid, helperPath });
      return true;
    } catch (error) {
      this.#child = null;
      log.error("[island-native] failed to start helper", { error, helperPath });
      return false;
    }
  }

  render(input: {
    state: NativeIslandRendererState;
    displayId: number;
    width: number;
    height: number;
  }): void {
    this.#send({ type: "state", ...input });
  }

  hide(): void {
    this.#send({ type: "hide" });
  }

  stop(): void {
    const child = this.#child;
    if (!child) return;
    this.#stopping = true;
    this.#clearStartupTimer();
    this.#send({ type: "shutdown" });
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGTERM");
    }, 1_000);
    timer.unref();
  }

  #send(message: Record<string, unknown>): void {
    const child = this.#child;
    if (!child || child.exitCode !== null || child.stdin.destroyed) return;
    try {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    } catch (error) {
      log.warn("[island-native] failed to write helper message", { error });
      this.#reportFailure(child);
      this.#terminate(child);
    }
  }

  #handleLine(line: string): void {
    const message = parseNativeIslandHostMessage(line);
    if (!message) {
      log.warn("[island-native] ignored invalid helper message", { line });
      return;
    }
    if (message.type === "ready") {
      this.#clearStartupTimer();
      log.info("[island-native] helper ready", { pid: this.#child?.pid });
      return;
    }
    if (message.type === "setExpanded") {
      this.#callbacks.onExpandedChange(message.expanded);
      return;
    }
    if (message.type === "positioned") {
      log.info("[island-native] positioned", {
        displayId: message.displayId,
        x: message.x,
        top: message.top,
        width: message.width,
        height: message.height,
      });
      return;
    }
    if (message.type === "action") {
      this.#callbacks.onAction(message.action, message.id);
    }
  }

  #reportFailure(child: ChildProcessWithoutNullStreams): void {
    if (this.#child !== child || this.#stopping || this.#failureReported) return;
    this.#failureReported = true;
    this.#clearStartupTimer();
    this.#callbacks.onExit();
  }

  #terminate(child: ChildProcessWithoutNullStreams): void {
    if (child.exitCode === null && !child.killed) {
      child.kill("SIGTERM");
    }
  }

  #clearStartupTimer(): void {
    if (!this.#startupTimer) return;
    clearTimeout(this.#startupTimer);
    this.#startupTimer = null;
  }
}
