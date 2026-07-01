import type { ExtensionOverlay } from "./api";
import type { SessionInputQuestion, SessionInputRequest } from "./sessionInputRequests";

export interface ActiveInputQuestion {
  question: SessionInputQuestion;
  index: number;
}

export function activeInputQuestionForOverlay(request: SessionInputRequest | undefined, overlay: ExtensionOverlay): ActiveInputQuestion | undefined {
  if (request === undefined || request.questions.length === 0) return undefined;
  const haystack = normalizedOverlayText(overlay);
  const matchedIndex = request.questions.findIndex((question) => {
    const questionText = normalizeText(question.question);
    const headerText = question.header === undefined ? "" : normalizeText(question.header);
    return (questionText !== "" && haystack.includes(questionText)) || (headerText !== "" && haystack.includes(headerText));
  });
  const index = matchedIndex >= 0 ? matchedIndex : request.questions.length === 1 ? 0 : -1;
  if (index < 0) return undefined;
  const question = request.questions[index];
  if (question === undefined) return undefined;
  return { question, index };
}

export function terminalInputSequenceForOption(index: number): string[] {
  if (index >= 0 && index < 9) return [String(index + 1)];
  if (index < 0) return [];
  return [...Array.from({ length: index }, () => "\x1b[B"), "\r"];
}

export function terminalInputSequenceForCustomAnswer(answer: string): string[] {
  return ["0", ...Array.from(answer), "\r"];
}

function normalizedOverlayText(overlay: ExtensionOverlay): string {
  return normalizeText(`${overlay.title}\n${overlay.body}`);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
