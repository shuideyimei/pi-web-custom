import { describe, expect, it } from "vitest";
import type { ChatLine } from "./components/shared";
import { hasPendingInputRequest, inputRequestFromArgs, pendingInputRequestFromMessages } from "./sessionInputRequests";

describe("session input requests", () => {
  it("detects a pending structured question tool", () => {
    const messages: ChatLine[] = [{
      role: "tool",
      parts: [{
        type: "toolExecution",
        toolName: "ask_question",
        summary: "questions: 1 item",
        status: "running",
        args: { questions: [{ question: "直接 push 吗？" }] },
      }],
    }];

    expect(hasPendingInputRequest(messages)).toBe(true);
    expect(pendingInputRequestFromMessages(messages)).toMatchObject({
      toolName: "ask_question",
      questions: [{ question: "直接 push 吗？", options: [] }],
    });
  });

  it("ignores completed question tools", () => {
    const messages: ChatLine[] = [{
      role: "tool",
      parts: [{
        type: "toolExecution",
        toolName: "ask_question",
        summary: "questions: 1 item",
        status: "success",
        args: { questions: [{ question: "直接 push 吗？" }] },
      }],
    }];

    expect(hasPendingInputRequest(messages)).toBe(false);
  });

  it("ignores stale transcript-only requests when the session is no longer active", () => {
    const messages: ChatLine[] = [{
      role: "tool",
      parts: [{
        type: "toolCall",
        toolName: "ask_question",
        summary: "questions: 1 item",
        args: { questions: [{ question: "直接 push 吗？" }] },
      }],
    }];

    expect(pendingInputRequestFromMessages(messages, { active: false })).toBeUndefined();
    expect(pendingInputRequestFromMessages(messages, { active: true })).toMatchObject({
      questions: [{ question: "直接 push 吗？" }],
    });
  });

  it("does not treat an earlier tool call as pending after the execution completes", () => {
    const messages: ChatLine[] = [{
      role: "tool",
      parts: [
        {
          type: "toolCall",
          toolCallId: "call-1",
          toolName: "ask_question",
          summary: "questions: 1 item",
          args: { questions: [{ question: "直接 push 吗？" }] },
        },
        {
          type: "toolExecution",
          toolCallId: "call-1",
          toolName: "ask_question",
          summary: "questions: 1 item",
          status: "success",
          args: { questions: [{ question: "直接 push 吗？" }] },
        },
      ],
    }];

    expect(pendingInputRequestFromMessages(messages)).toBeUndefined();
  });

  it("stops at the next user boundary", () => {
    const messages: ChatLine[] = [
      {
        role: "tool",
        parts: [{
          type: "toolExecution",
          toolName: "ask_question",
          summary: "questions: 1 item",
          status: "running",
          args: { questions: [{ question: "直接 push 吗？" }] },
        }],
      },
      { role: "user", parts: [{ type: "text", text: "next task" }] },
    ];

    expect(hasPendingInputRequest(messages)).toBe(false);
  });

  it("parses structured question options and metadata", () => {
    expect(inputRequestFromArgs({
      autoResolutionMs: 120000,
      metadata: { source: "plugin", ignored: null },
      questions: [{
        header: "Confirm",
        id: "push",
        question: "直接 push 吗？",
        options: [
          { label: "Yes (Recommended)", description: "Push now." },
          { label: "No", description: "" },
        ],
      }],
    })).toEqual({
      autoResolutionMs: 120000,
      metadataEntries: [["source", "plugin"]],
      questions: [{
        header: "Confirm",
        id: "push",
        question: "直接 push 吗？",
        options: [
          { label: "Yes (Recommended)", description: "Push now." },
          { label: "No" },
        ],
      }],
    });
  });

  it("parses structured question arguments from JSON strings", () => {
    expect(inputRequestFromArgs(JSON.stringify({
      questions: [{ question: "Deploy now?", options: [{ label: "Yes" }] }],
    }))).toMatchObject({
      questions: [{ question: "Deploy now?", options: [{ label: "Yes" }] }],
    });
  });
});
