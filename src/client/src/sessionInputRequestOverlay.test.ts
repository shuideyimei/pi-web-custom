import { describe, expect, it } from "vitest";
import type { ExtensionOverlay } from "./api";
import type { SessionInputRequest } from "./sessionInputRequests";
import { activeInputQuestionForOverlay, terminalInputSequenceForCustomAnswer, terminalInputSequenceForOption } from "./sessionInputRequestOverlay";

describe("session input request overlay helpers", () => {
  it("uses the only question when the overlay text is generic", () => {
    const request = inputRequest("Proceed?");
    expect(activeInputQuestionForOverlay(request, overlay("Extension", "Choose one"))).toEqual({
      index: 0,
      question: request.questions[0],
    });
  });

  it("matches the current question from overlay title and body", () => {
    const request: SessionInputRequest = {
      questions: [
        { question: "Use the current branch?", options: [] },
        { header: "Deploy", question: "Deploy now?", options: [{ label: "Yes" }] },
      ],
      metadataEntries: [],
    };

    expect(activeInputQuestionForOverlay(request, overlay("Deploy", "Deploy now?\n1. Yes"))).toEqual({
      index: 1,
      question: request.questions[1],
    });
  });

  it("does not guess among multiple questions without an overlay match", () => {
    const request: SessionInputRequest = {
      questions: [
        { question: "One?", options: [] },
        { question: "Two?", options: [] },
      ],
      metadataEntries: [],
    };

    expect(activeInputQuestionForOverlay(request, overlay("Extension", "Waiting"))).toBeUndefined();
  });

  it("builds direct and navigated option key sequences", () => {
    expect(terminalInputSequenceForOption(0)).toEqual(["1"]);
    expect(terminalInputSequenceForOption(8)).toEqual(["9"]);
    expect(terminalInputSequenceForOption(10)).toEqual([...Array.from({ length: 10 }, () => "\x1b[B"), "\r"]);
  });

  it("builds the ask-user custom-answer sequence", () => {
    expect(terminalInputSequenceForCustomAnswer("later")).toEqual(["0", "l", "a", "t", "e", "r", "\r"]);
  });
});

function inputRequest(question: string): SessionInputRequest {
  return {
    questions: [{ question, options: [] }],
    metadataEntries: [],
  };
}

function overlay(title: string, body: string): ExtensionOverlay {
  return {
    requestId: "req",
    title,
    body,
    status: "ready",
    closable: true,
  };
}
