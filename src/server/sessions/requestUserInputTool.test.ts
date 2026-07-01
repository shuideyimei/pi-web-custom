import { describe, expect, it } from "vitest";
import { createRequestUserInputToolDefinition, executeRequestUserInput, type RequestUserInputUi } from "./requestUserInputTool.js";

describe("request_user_input tool", () => {
  it("returns text answers as tool result details and content", async () => {
    const tool = createRequestUserInputToolDefinition();
    const details = await executeRequestUserInput({
      questions: [{ question: "Ship it?", id: "ship" }],
    }, undefined, fakeUi({ input: () => Promise.resolve("Yes") }));

    expect(tool.name).toBe("request_user_input");
    expect(details).toMatchObject({
      questions: [{ question: "Ship it?", id: "ship", options: [] }],
      answers: [{ question: "Ship it?", id: "ship", answer: "Yes", wasCustom: true }],
    });
  });

  it("returns selected option answers", async () => {
    const details = await executeRequestUserInput({
      questions: [{
        question: "How should changes be committed?",
        options: [
          { label: "Split commits", description: "Separate fixes." },
          { label: "One feature commit" },
        ],
      }],
    }, undefined, fakeUi({ selectInput: "2" }));

    expect(details).toMatchObject({
      answers: [{
        question: "How should changes be committed?",
        answer: "One feature commit",
        selectedOption: "One feature commit",
        wasCustom: false,
      }],
    });
  });
});

function fakeUi(options: { input?: () => Promise<string | undefined>; selectInput?: string }): RequestUserInputUi {
  return {
    input: options.input ?? (() => Promise.resolve(undefined)),
    custom: <T>(factory: (tui: unknown, theme: unknown, keys: unknown, done: (value: T) => void) => { handleInput?: (data: string) => void }) => new Promise<T | undefined>((resolve) => {
      const component = factory({}, {}, {}, resolve);
      component.handleInput?.(options.selectInput ?? "1");
    }),
  };
}
