import { describe, expect, it, vi } from "vitest";
import { submitAgentInput } from "./submit";
describe("submitAgentInput", () => {
    it("queues while the agent is running and clears the composer immediately", async () => {
        const queueMessage = vi.fn();
        const submitMessage = vi.fn();
        const clearDraft = vi.fn();
        const setUserInput = vi.fn();
        const setAttachments = vi.fn();
        const setSendError = vi.fn();
        const setIsProcessing = vi.fn();
        await expect(submitAgentInput({
            message: "  queued message  ",
            attachments: [{ id: "img-1" }],
            isAgentRunning: true,
            canSubmit: true,
            queueMessage,
            submitMessage,
            clearDraft,
            setUserInput,
            setAttachments,
            setSendError,
            setIsProcessing,
        })).resolves.toBe("queued");
        expect(queueMessage).toHaveBeenCalledWith({
            message: "queued message",
            attachments: [{ id: "img-1" }],
        });
        expect(submitMessage).not.toHaveBeenCalled();
        expect(setUserInput).toHaveBeenCalledWith("");
        expect(setAttachments).toHaveBeenCalledWith([]);
        expect(setSendError).not.toHaveBeenCalled();
        expect(setIsProcessing).not.toHaveBeenCalled();
        expect(clearDraft).toHaveBeenCalledWith("sent");
    });
});
