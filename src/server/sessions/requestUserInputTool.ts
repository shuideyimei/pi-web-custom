import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

const RequestUserInputOptionSchema = Type.Object({
  label: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
});

const RequestUserInputQuestionSchema = Type.Object({
  question: Type.String({ minLength: 1 }),
  header: Type.Optional(Type.String({ minLength: 1 })),
  id: Type.Optional(Type.String({ minLength: 1 })),
  options: Type.Optional(Type.Array(RequestUserInputOptionSchema)),
});

const RequestUserInputParams = Type.Object({
  questions: Type.Array(RequestUserInputQuestionSchema, { minItems: 1 }),
  autoResolutionMs: Type.Optional(Type.Number()),
  metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

interface RequestUserInputParams {
  questions: RequestUserInputQuestion[];
  autoResolutionMs?: number;
  metadata?: Record<string, unknown>;
}

interface RequestUserInputQuestion {
  question: string;
  header?: string;
  id?: string;
  options?: RequestUserInputOption[];
}

interface RequestUserInputOption {
  label: string;
  description?: string;
}

interface RequestUserInputAnswer {
  question: string;
  answer: string;
  id?: string;
  selectedOption?: string;
  wasCustom: boolean;
}

interface RequestUserInputDetails {
  questions: RequestUserInputQuestion[];
  answers: RequestUserInputAnswer[];
  answeredAt: number;
  metadata?: Record<string, unknown>;
}

interface OptionSelectionResult {
  answer: string;
  selectedOption?: string;
  wasCustom: boolean;
}

interface RequestUserInputComponent {
  render(width: number): string[];
  invalidate(): void;
  handleInput?(data: string): void;
}

export interface RequestUserInputUi {
  input(title: string, placeholder?: string): Promise<string | undefined>;
  custom<T>(
    factory: (
      tui: unknown,
      theme: unknown,
      keys: unknown,
      done: (result: T) => void,
    ) => RequestUserInputComponent,
    options?: { overlay?: boolean },
  ): Promise<T | undefined>;
}

export function createRequestUserInputToolDefinition() {
  return defineTool<typeof RequestUserInputParams, RequestUserInputDetails>({
    name: "request_user_input",
    label: "Request user input",
    description: "Ask the user one or more short questions when you need a decision, preference, or missing information. Questions may include suggested options. Use this instead of continuing with unsafe assumptions.",
    promptSnippet: "request_user_input: ask the user structured questions with optional choices",
    promptGuidelines: [
      "Use request_user_input only when the answer cannot be inferred safely.",
      "Keep questions short and include 2-3 concrete options when choices are known.",
      "Do not continue until request_user_input returns answers.",
    ],
    parameters: RequestUserInputParams,
    executionMode: "sequential",
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const details = await executeRequestUserInput(params, signal, ctx.ui);
      return {
        content: [{ type: "text", text: answerText(details.answers) }],
        details,
      };
    },
  });
}

export async function executeRequestUserInput(params: RequestUserInputParams, signal: AbortSignal | undefined, ui: RequestUserInputUi): Promise<RequestUserInputDetails> {
  const questions = params.questions.map(normalizeQuestion).filter((question) => question.question !== "");
  const answers: RequestUserInputAnswer[] = [];

  for (const question of questions) {
    if (signal?.aborted === true) throw new Error("Input request cancelled");
    const result = await askQuestion(question, ui);
    if (result === undefined) throw new Error("User cancelled the input request");
    answers.push({
      question: question.question,
      answer: result.answer,
      ...(question.id === undefined ? {} : { id: question.id }),
      ...(result.selectedOption === undefined ? {} : { selectedOption: result.selectedOption }),
      wasCustom: result.wasCustom,
    });
  }

  return {
    questions,
    answers,
    answeredAt: Date.now(),
    ...(params.metadata === undefined ? {} : { metadata: params.metadata }),
  };
}

async function askQuestion(question: RequestUserInputQuestion, ui: RequestUserInputUi): Promise<OptionSelectionResult | undefined> {
  const options = question.options ?? [];
  if (options.length === 0) {
    const answer = await ui.input(question.header ?? "Question", question.question);
    const trimmed = answer?.trim() ?? "";
    return trimmed === "" ? undefined : { answer: trimmed, wasCustom: true };
  }
  return ui.custom<OptionSelectionResult | undefined>((_tui, _theme, _keys, done) => optionSelector(question, options, done), { overlay: true });
}

function optionSelector(
  question: RequestUserInputQuestion,
  options: RequestUserInputOption[],
  done: (result: OptionSelectionResult | undefined) => void,
) {
  let selectedIndex = 0;
  let customMode = false;
  let customAnswer = "";

  const allOptions = [...options, { label: "Other", description: "Type a custom answer." }];

  function submitSelected(): void {
    const option = allOptions[selectedIndex];
    if (option === undefined) return;
    if (selectedIndex === allOptions.length - 1) {
      customMode = true;
      return;
    }
    done({ answer: option.label, selectedOption: option.label, wasCustom: false });
  }

  return {
    render: (width: number) => renderOptionSelector(question, allOptions, selectedIndex, customMode, customAnswer, width),
    invalidate: () => undefined,
    handleInput: (data: string) => {
      if (customMode) {
        if (data === "\x1b") {
          customMode = false;
          customAnswer = "";
          return;
        }
        if (data === "\r" || data === "\n") {
          const answer = customAnswer.trim();
          if (answer !== "") done({ answer, wasCustom: true });
          return;
        }
        if (data === "\x7f") {
          customAnswer = customAnswer.slice(0, -1);
          return;
        }
        if (data.length === 1 && data >= " ") customAnswer += data;
        return;
      }

      if (data === "\x1b") {
        done(undefined);
        return;
      }
      if (data === "\x1b[A") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        return;
      }
      if (data === "\x1b[B") {
        selectedIndex = Math.min(allOptions.length - 1, selectedIndex + 1);
        return;
      }
      if (data === "\r" || data === "\n") {
        submitSelected();
        return;
      }
      if (data.length === 1 && data >= "0" && data <= "9") {
        const index = data === "0" ? allOptions.length - 1 : Number(data) - 1;
        if (index < 0 || index >= allOptions.length) return;
        selectedIndex = index;
        submitSelected();
      }
    },
  };
}

function renderOptionSelector(
  question: RequestUserInputQuestion,
  options: RequestUserInputOption[],
  selectedIndex: number,
  customMode: boolean,
  customAnswer: string,
  width: number,
): string[] {
  const lines: string[] = [];
  const push = (text: string) => { lines.push(text.length > width ? text.slice(0, Math.max(0, width - 1)) : text); };
  if (question.header !== undefined) push(question.header);
  push(question.question);
  lines.push("");
  options.forEach((option, index) => {
    push(`${index === selectedIndex ? "> " : "  "}${String(index + 1)}. ${option.label}`);
    if (option.description !== undefined && option.description !== "") push(`     ${option.description}`);
  });
  if (customMode) {
    lines.push("");
    push(`Your answer: ${customAnswer}`);
  }
  lines.push("");
  push(customMode ? "Type and press Enter. Esc returns to options." : "Use ↑↓, number keys, Enter, or Esc.");
  return lines;
}

function normalizeQuestion(question: RequestUserInputQuestion): RequestUserInputQuestion {
  return {
    question: question.question.trim(),
    ...(question.header === undefined || question.header.trim() === "" ? {} : { header: question.header.trim() }),
    ...(question.id === undefined || question.id.trim() === "" ? {} : { id: question.id.trim() }),
    options: (question.options ?? []).map(normalizeOption).filter((option) => option.label !== ""),
  };
}

function normalizeOption(option: RequestUserInputOption): RequestUserInputOption {
  return {
    label: option.label.trim(),
    ...(option.description === undefined || option.description.trim() === "" ? {} : { description: option.description.trim() }),
  };
}

function answerText(answers: RequestUserInputAnswer[]): string {
  return answers.map((answer, index) => `Q${String(index + 1)}: ${answer.question}\nA${String(index + 1)}: ${answer.answer}`).join("\n\n");
}
