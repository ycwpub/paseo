import { test, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDaemonTestContext, type DaemonTestContext, DaemonClient } from "./test-utils/index.js";
import { createTestPaseoDaemon } from "./test-utils/paseo-daemon.js";
import { getFullAccessConfig } from "./daemon-e2e/agent-configs.js";
import { parsePcm16MonoWav, wordSimilarity } from "./test-utils/dictation-e2e.js";
import type { AgentClient, AgentPersistenceHandle, AgentRunResult, AgentSession, AgentStreamEvent } from "./agent/agent-sdk-types.js";
const openaiApiKey = process.env.OPENAI_API_KEY ?? null;
const localModelsDir = process.env.PASEO_LOCAL_MODELS_DIR ?? path.join(homedir(), ".paseo", "models", "local-speech");
const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const appE2eFixturesDir = path.resolve(testFileDir, "../../../app/e2e/support/fixtures");
function fixturePath(fileName: string): string {
    return path.join(appE2eFixturesDir, fileName);
}
async function readFixture(fileName: string): Promise<Buffer> {
    return readFile(fixturePath(fileName));
}
function hasSherpaParakeetModels(modelsDir: string): boolean {
    return (existsSync(path.join(modelsDir, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8", "encoder.int8.onnx")) &&
        existsSync(path.join(modelsDir, "sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8", "tokens.txt")));
}
function hasSherpaKokoroModels(modelsDir: string): boolean {
    return (existsSync(path.join(modelsDir, "kokoro-en-v0_19", "model.onnx")) &&
        existsSync(path.join(modelsDir, "kokoro-en-v0_19", "voices.bin")) &&
        existsSync(path.join(modelsDir, "kokoro-en-v0_19", "tokens.txt")));
}
const hasLocalSpeech = hasSherpaParakeetModels(localModelsDir) && hasSherpaKokoroModels(localModelsDir);
const hasAnySpeech = hasLocalSpeech || Boolean(openaiApiKey);
const speechTest = hasAnySpeech ? test : test.skip;
function tmpCwd(): string {
    return mkdtempSync(path.join(tmpdir(), "daemon-client-"));
}
function resolveExpectedDesktopRelayDeviceType(): "mac" | "windows" | "linux" {
    if (process.platform === "darwin")
        return "mac";
    if (process.platform === "win32")
        return "windows";
    return "linux";
}
interface StubAgentOptions {
    sessionId: string;
    supportsStreaming: boolean;
    startError?: string;
    interruptError?: string;
}
class StubAgentSession implements AgentSession {
    readonly provider = "codex" as const;
    readonly capabilities;
    private activeTurnId: string | null = null;
    constructor(private readonly options: StubAgentOptions) {
        this.capabilities = {
            supportsStreaming: options.supportsStreaming,
            supportsSessionPersistence: true,
            supportsDynamicModes: false,
            supportsMcpServers: false,
            supportsReasoningStream: false,
            supportsToolInvocations: false,
            supportsRewindConversation: false,
            supportsRewindFiles: false,
            supportsRewindBoth: false,
        } as const;
    }
    get id(): string {
        return this.options.sessionId;
    }
    async run(): Promise<AgentRunResult> {
        return { sessionId: this.id, finalText: "", timeline: [] };
    }
    async startTurn(): Promise<{
        turnId: string;
    }> {
        if (this.options.startError)
            throw new Error(this.options.startError);
        if (this.activeTurnId)
            throw new Error("A foreground turn is already active");
        this.activeTurnId = "provider-owned-turn";
        return { turnId: this.activeTurnId };
    }
    subscribe(): () => void {
        return () => undefined;
    }
    async *streamHistory(): AsyncGenerator<AgentStreamEvent> { }
    async getRuntimeInfo() {
        return {
            provider: this.provider,
            sessionId: this.id,
            model: "gpt-5.4-mini",
            modeId: "full-access",
        };
    }
    async getAvailableModes() {
        return [{ id: "full-access", label: "Full access", description: "No prompts" }];
    }
    async getCurrentMode(): Promise<string> {
        return "full-access";
    }
    async setMode(): Promise<void> { }
    getPendingPermissions() {
        return [];
    }
    async respondToPermission(): Promise<void> { }
    describePersistence(): AgentPersistenceHandle {
        return { provider: this.provider, sessionId: this.id };
    }
    async interrupt(): Promise<void> {
        if (this.options.interruptError)
            throw new Error(this.options.interruptError);
    }
    async close(): Promise<void> {
        this.activeTurnId = null;
    }
}
class StubAgentClient implements AgentClient {
    readonly provider = "codex" as const;
    readonly capabilities;
    constructor(private readonly options: StubAgentOptions) {
        this.capabilities = new StubAgentSession(options).capabilities;
    }
    async isAvailable(): Promise<boolean> {
        return true;
    }
    async createSession(): Promise<AgentSession> {
        return new StubAgentSession(this.options);
    }
    async resumeSession(): Promise<AgentSession> {
        return new StubAgentSession(this.options);
    }
    async fetchCatalog() {
        return {
            models: [{ id: "gpt-5.4-mini", label: "GPT-5.4 mini", provider: this.provider }],
            modes: [{ id: "full-access", label: "Full access", description: "No prompts" }],
        };
    }
}
function createUninterruptibleClient(): AgentClient {
    return new StubAgentClient({
        sessionId: "uninterruptible-session",
        supportsStreaming: true,
        interruptError: "Provider did not acknowledge cancellation",
    });
}
test("DaemonClient rejects a replacement prompt when cancellation is not acknowledged", async () => {
    const cwd = tmpCwd();
    const daemon = await createTestPaseoDaemon({
        agentClients: { codex: createUninterruptibleClient() },
    });
    const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
    try {
        await client.connect();
        const agent = await client.createAgent({ provider: "codex", cwd, modeId: "full-access" });
        await client.sendMessage(agent.id, "Keep working on the first prompt.");
        await expect(client.sendMessage(agent.id, "Replace it with this prompt.")).rejects.toThrow(`Cannot replace agent ${agent.id} because its active run cancellation was not acknowledged`);
    }
    finally {
        await client.close();
        await daemon.close();
        rmSync(cwd, { recursive: true, force: true });
    }
}, 30000);
test("DaemonClient rejects Stop when cancellation is not acknowledged", async () => {
    const cwd = tmpCwd();
    const daemon = await createTestPaseoDaemon({
        agentClients: { codex: createUninterruptibleClient() },
    });
    const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws` });
    try {
        await client.connect();
        const agent = await client.createAgent({ provider: "codex", cwd, modeId: "full-access" });
        await client.sendMessage(agent.id, "Keep working until stopped.");
        await expect(client.cancelAgent(agent.id)).rejects.toThrow(`Cannot stop agent ${agent.id} because its active run cancellation was not acknowledged`);
    }
    finally {
        await client.close();
        await daemon.close();
        rmSync(cwd, { recursive: true, force: true });
    }
}, 30000);
function waitForSignal<T>(timeoutMs: number, setup: (resolve: (value: T) => void, reject: (error: Error) => void) => () => void): Promise<T> {
    return new Promise((resolve, reject) => {
        let cleanup: (() => void) | null = null;
        const timeout = setTimeout(() => {
            if (cleanup) {
                cleanup();
            }
            reject(new Error(`Timeout waiting for event after ${timeoutMs}ms`));
        }, timeoutMs);
        cleanup = setup((value) => {
            clearTimeout(timeout);
            cleanup?.();
            resolve(value);
        }, (error) => {
            clearTimeout(timeout);
            cleanup?.();
            reject(error);
        });
    });
}
function resolveSpeechConfig() {
    if (hasLocalSpeech) {
        return {
            providers: {
                dictationStt: { provider: "local" as const, explicit: true },
                voiceStt: { provider: "local" as const, explicit: true },
                voiceTts: { provider: "local" as const, explicit: true },
            },
            local: {
                modelsDir: localModelsDir,
                models: {
                    dictationStt: "parakeet-tdt-0.6b-v2-int8",
                    voiceStt: "parakeet-tdt-0.6b-v2-int8",
                    voiceTts: "kokoro-en-v0_19",
                    voiceTtsSpeakerId: 0,
                },
            },
        };
    }
    if (openaiApiKey) {
        return {
            providers: {
                dictationStt: { provider: "openai" as const, explicit: true },
                voiceStt: { provider: "openai" as const, explicit: true },
                voiceTts: { provider: "openai" as const, explicit: true },
            },
        };
    }
    return undefined;
}
let ctx: DaemonTestContext;
beforeAll(async () => {
    const speechConfig = resolveSpeechConfig();
    ctx = await createDaemonTestContext({
        dictationFinalTimeoutMs: 5000,
        ...(openaiApiKey
            ? { openai: { stt: { apiKey: openaiApiKey }, tts: { apiKey: openaiApiKey } } }
            : {}),
        ...(speechConfig ? { speech: speechConfig } : {}),
    });
}, 60000);
afterAll(async () => {
    await ctx.cleanup();
}, 60000);
test("receives server_info on websocket connect", async () => {
    const client = new DaemonClient({
        url: `ws://127.0.0.1:${ctx.daemon.port}/ws`,
        clientId: `cid-e2e-${randomUUID()}`,
        clientType: "cli",
    });
    await client.connect();
    const serverInfo = client.getLastServerInfoMessage();
    expect(serverInfo).not.toBeNull();
    expect(serverInfo?.serverId.length).toBeGreaterThan(0);
    expect(serverInfo?.features?.["terminal-restore-modes"]).toBe(true);
    expect(serverInfo?.features?.hubRelationship).toBe(true);
    expect(serverInfo?.features?.commitsList).toBe(true);
    expect(serverInfo?.features?.commitBaseClassification).toBe(true);
    expect(serverInfo?.desktopManaged).toBe(false);
    expect(serverInfo?.relayDeviceType).toBe("cli");
    expect(serverInfo?.features?.daemonSelfUpdate).toBe(true);
    expect(serverInfo?.features?.worktreeRestore).toBe(true);
    expect(serverInfo?.features?.workspaceRecovery).toBe(true);
    expect(serverInfo?.features).toMatchObject({
        plugins: true,
        pluginManagement: true,
    });
    await client.close();
}, 15000);
test("a Desktop-managed daemon does not advertise npm self-update", async () => {
    const daemon = await createTestPaseoDaemon({ desktopManaged: true });
    const client = new DaemonClient({
        url: `ws://127.0.0.1:${daemon.port}/ws`,
        clientId: `cid-desktop-managed-${randomUUID()}`,
        clientType: "cli",
    });
    try {
        await client.connect();
        const serverInfo = client.getLastServerInfoMessage();
        expect(serverInfo?.desktopManaged).toBe(true);
        expect(serverInfo?.relayDeviceType).toBe(resolveExpectedDesktopRelayDeviceType());
        expect(serverInfo?.features?.daemonSelfUpdate).toBe(false);
    }
    finally {
        await client.close();
        await daemon.close();
    }
}, 15000);
speechTest("does not process non-voice audio through the voice agent path", async () => {
    await ctx.client.setVoiceMode(false);
    let sawTranscriptLog = false;
    let sawAssistantChunk = false;
    let sawAssistantLog = false;
    const transcriptSeen = waitForSignal(60000, (resolve) => {
        const unsubscribeChunk = ctx.client.on("assistant_chunk", (message) => {
            if (message.type !== "assistant_chunk") {
                return;
            }
            if (message.payload.chunk.length > 0) {
                sawAssistantChunk = true;
            }
        });
        const unsubscribeActivity = ctx.client.on("activity_log", (message) => {
            if (message.type !== "activity_log") {
                return;
            }
            if (message.payload.type === "transcript") {
                sawTranscriptLog = true;
                resolve();
            }
            if (message.payload.type === "assistant") {
                sawAssistantLog = true;
            }
        });
        return () => {
            unsubscribeChunk();
            unsubscribeActivity();
        };
    });
    const wav = await readFixture("recording.wav");
    await ctx.client.sendVoiceAudioChunk(wav.toString("base64"), "audio/wav", true);
    await transcriptSeen;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(sawTranscriptLog).toBe(true);
    expect(sawAssistantChunk).toBe(false);
    expect(sawAssistantLog).toBe(false);
}, 90000);
speechTest("voice mode buffers audio until isLast and emits transcription_result", async () => {
    const voiceCwd = tmpCwd();
    const voiceAgent = await ctx.client.createAgent({
        config: {
            ...getFullAccessConfig("codex"),
            cwd: voiceCwd,
        },
    });
    await ctx.client.setVoiceMode(true, voiceAgent.id);
    const transcription = waitForSignal(30000, (resolve) => {
        const unsubscribe = ctx.client.on("transcription_result", (message) => {
            if (message.type !== "transcription_result") {
                return;
            }
            resolve(message.payload);
        });
        return unsubscribe;
    });
    const errorSignal = waitForSignal(30000, (resolve) => {
        const unsubscribeStatus = ctx.client.on("status", (message) => {
            if (message.type !== "status") {
                return;
            }
            if (message.payload.status !== "error") {
                return;
            }
            resolve(`status:error ${message.payload.message}`);
        });
        const unsubscribeLog = ctx.client.on("activity_log", (message) => {
            if (message.type !== "activity_log") {
                return;
            }
            if (message.payload.type !== "error") {
                return;
            }
            resolve(`activity_log:error ${message.payload.content}`);
        });
        return () => {
            unsubscribeStatus();
            unsubscribeLog();
        };
    });
    try {
        const wav = await readFixture("recording.wav");
        const { sampleRate, pcm16 } = parsePcm16MonoWav(wav);
        expect(sampleRate).toBe(16000);
        const format = "audio/pcm;rate=16000;bits=16";
        const earlyTranscription = waitForSignal(1000, (resolve) => {
            const unsubscribe = ctx.client.on("transcription_result", (message) => {
                if (message.type !== "transcription_result") {
                    return;
                }
                resolve(message.payload.text);
            });
            return unsubscribe;
        });
        const chunkBytes = 3200; // 100ms @ 16kHz mono PCM16
        const firstChunk = pcm16.subarray(0, Math.min(chunkBytes, pcm16.length));
        await ctx.client.sendVoiceAudioChunk(firstChunk.toString("base64"), format, false);
        await earlyTranscription
            .then(() => {
            throw new Error("Expected no transcription_result before isLast=true");
        })
            .catch(() => { });
        for (let offset = chunkBytes; offset < pcm16.length; offset += chunkBytes) {
            const chunk = pcm16.subarray(offset, Math.min(pcm16.length, offset + chunkBytes));
            const isLast = offset + chunkBytes >= pcm16.length;
            await ctx.client.sendVoiceAudioChunk(chunk.toString("base64"), format, isLast);
        }
        const outcome = await Promise.race([
            transcription.then((payload) => ({ kind: "ok" as const, payload })),
            errorSignal.then((error) => ({ kind: "error" as const, error })),
        ]);
        if (outcome.kind === "error") {
            throw new Error(outcome.error);
        }
        expect(typeof outcome.payload.text).toBe("string");
        if (outcome.payload.text.trim().length > 0) {
            expect(outcome.payload.text.toLowerCase()).toContain("voice note");
        }
        else {
            expect(outcome.payload.isLowConfidence).toBe(true);
        }
    }
    finally {
        await Promise.allSettled([transcription, errorSignal]);
        await ctx.client.setVoiceMode(false);
        rmSync(voiceCwd, { recursive: true, force: true });
    }
}, 90000);
speechTest("streams dictation PCM and returns final transcript", async () => {
    const wav = await readFixture("recording.wav");
    const { sampleRate, pcm16 } = parsePcm16MonoWav(wav);
    expect(sampleRate).toBe(16000);
    const dictationId = `dict-${Date.now()}`;
    const format = "audio/pcm;rate=16000;bits=16";
    await ctx.client.startDictationStream(dictationId, format);
    const chunkBytes = 3200; // ~100ms @ 16kHz mono PCM16 (1600 samples * 2 bytes)
    let seq = 0;
    for (let offset = 0; offset < pcm16.length; offset += chunkBytes) {
        const chunk = pcm16.subarray(offset, Math.min(pcm16.length, offset + chunkBytes));
        ctx.client.sendDictationStreamChunk(dictationId, seq, chunk.toString("base64"), format);
        seq += 1;
    }
    const finalSeq = seq - 1;
    const result = await ctx.client.finishDictationStream(dictationId, finalSeq);
    expect(result.dictationId).toBe(dictationId);
    expect(result.text.toLowerCase()).toContain("voice note");
}, 30000);
speechTest("realtime dictation transcript is similar to baseline fixture", async () => {
    const wav = await readFixture("recording.wav");
    const { sampleRate, pcm16 } = parsePcm16MonoWav(wav);
    expect(sampleRate).toBe(16000);
    const dictationId = `dict-baseline-${Date.now()}`;
    const format = "audio/pcm;rate=16000;bits=16";
    const baseline = (await readFile(fixturePath("recording.baseline.txt"), "utf-8")).trim();
    await ctx.client.startDictationStream(dictationId, format);
    const chunkBytes = 3200; // 100ms @ 16kHz mono PCM16
    let seq = 0;
    for (let offset = 0; offset < pcm16.length; offset += chunkBytes) {
        const chunk = pcm16.subarray(offset, Math.min(pcm16.length, offset + chunkBytes));
        ctx.client.sendDictationStreamChunk(dictationId, seq, chunk.toString("base64"), format);
        seq += 1;
    }
    const finalSeq = seq - 1;
    const result = await ctx.client.finishDictationStream(dictationId, finalSeq);
    expect(result.dictationId).toBe(dictationId);
    expect(wordSimilarity(result.text, baseline)).toBeGreaterThan(0.6);
}, 30000);
speechTest("fails fast if dictation finishes without sending required chunks", async () => {
    const dictationId = `dict-missing-chunks-${Date.now()}`;
    const format = "audio/pcm;rate=16000;bits=16";
    await ctx.client.startDictationStream(dictationId, format);
    // Claim that we sent chunk 0, but actually send no chunks.
    await expect(ctx.client.finishDictationStream(dictationId, 0)).rejects.toThrow(/no audio chunks were received/i);
}, 15000);
