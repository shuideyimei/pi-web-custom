import type { ChatLine, ToolExecutionPart } from "./components/shared";

export interface SessionInputRequest {
  toolCallId?: string;
  toolName?: string;
  questions: SessionInputQuestion[];
  autoResolutionMs?: number;
  metadataEntries: [string, unknown][];
}

export interface SessionInputQuestion {
  question: string;
  header?: string;
  id?: string;
  options: SessionInputOption[];
}

export interface SessionInputOption {
  label: string;
  description?: string;
}

export function hasPendingInputRequest(messages: readonly ChatLine[]): boolean {
  return pendingInputRequestFromMessages(messages) !== undefined;
}

export function pendingInputRequestFromMessages(messages: readonly ChatLine[], options?: { active?: boolean }): SessionInputRequest | undefined {
  if (options?.active === false) return undefined;
  const completedInputToolCallIds = new Set<string>();
  for (let lineIndex = messages.length - 1; lineIndex >= 0; lineIndex--) {
    const line = messages[lineIndex];
    if (line === undefined) continue;
    for (let partIndex = line.parts.length - 1; partIndex >= 0; partIndex--) {
      const part = line.parts[partIndex];
      if (part === undefined) continue;
      if (part.type === "toolExecution" && isPendingToolExecution(part)) {
        const request = inputRequestFromArgs(part.args);
        if (request !== undefined) return withToolMetadata(request, part.toolName, part.toolCallId);
      }
      if (part.type === "toolExecution" && !isPendingToolExecution(part) && inputRequestFromArgs(part.args) !== undefined) {
        if (part.toolCallId === undefined || part.toolCallId === "") return undefined;
        completedInputToolCallIds.add(part.toolCallId);
      }
      if (part.type === "toolCall") {
        if (part.toolCallId !== undefined && completedInputToolCallIds.has(part.toolCallId)) continue;
        const request = inputRequestFromArgs(part.args);
        if (request !== undefined) return withToolMetadata(request, part.toolName, part.toolCallId);
      }
      if (part.type === "text" && line.role === "user") return undefined;
    }
    if (line.role === "user") return undefined;
  }
  return undefined;
}

function isPendingToolExecution(part: ToolExecutionPart): boolean {
  return part.status === "pending" || part.status === "running";
}

export function inputRequestFromArgs(args: unknown): SessionInputRequest | undefined {
  const record = argsRecord(args);
  if (record === undefined) return undefined;
  const questions = record["questions"];
  if (!Array.isArray(questions) || questions.length === 0) return undefined;
  const parsedQuestions = questions.map(inputQuestionFromValue).filter((question): question is SessionInputQuestion => question !== undefined);
  if (parsedQuestions.length === 0) return undefined;
  const autoResolutionMs = typeof record["autoResolutionMs"] === "number" ? record["autoResolutionMs"] : undefined;
  const metadata = record["metadata"];
  const metadataEntries = isRecord(metadata) && !Array.isArray(metadata)
    ? Object.entries(metadata).filter(([, value]) => value !== undefined && value !== null)
    : [];
  return {
    questions: parsedQuestions,
    ...(autoResolutionMs === undefined ? {} : { autoResolutionMs }),
    metadataEntries,
  };
}

function inputQuestionFromValue(value: unknown): SessionInputQuestion | undefined {
  if (!isRecord(value)) return undefined;
  const question = stringProperty(value, "question");
  if (question === undefined || question.trim() === "") return undefined;
  const header = stringProperty(value, "header");
  const id = stringProperty(value, "id");
  const optionsValue = value["options"];
  const options = Array.isArray(optionsValue)
    ? optionsValue.map(inputOptionFromValue).filter((option): option is SessionInputOption => option !== undefined)
    : [];
  return {
    question,
    ...(header === undefined || header === "" ? {} : { header }),
    ...(id === undefined || id === "" ? {} : { id }),
    options,
  };
}

function inputOptionFromValue(value: unknown): SessionInputOption | undefined {
  if (!isRecord(value)) return undefined;
  const label = stringProperty(value, "label");
  if (label === undefined || label.trim() === "") return undefined;
  const description = stringProperty(value, "description");
  return {
    label,
    ...(description === undefined || description === "" ? {} : { description }),
  };
}

function withToolMetadata(request: SessionInputRequest, toolName: string, toolCallId: string | undefined): SessionInputRequest {
  return {
    ...request,
    toolName,
    ...(toolCallId === undefined || toolCallId === "" ? {} : { toolCallId }),
  };
}

function stringProperty(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function argsRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value) && !Array.isArray(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
