import { describe, expect, it } from "vitest";
import { detectPromptCompletionTrigger, fileCompletionInsertText, matchingSlashCommands } from "./promptCompletions";

describe("detectPromptCompletionTrigger", () => {
  it("keeps all-file suggestions active when an @ space query contains spaces", () => {
    expect(detectPromptCompletionTrigger("open @ A FILE")).toEqual({
      kind: "file",
      query: "A FILE",
      from: 5,
      to: 13,
      fileScope: "all",
      allPrefix: "@ ",
    });
  });

  it("keeps !@ all-file suggestions active when the query contains spaces", () => {
    expect(detectPromptCompletionTrigger("open !@A FILE")).toEqual({
      kind: "file",
      query: "A FILE",
      from: 5,
      to: 13,
      fileScope: "all",
      allPrefix: "!@",
    });
  });

  it("detects quoted all-file and tracked-file queries", () => {
    expect(detectPromptCompletionTrigger("open @ \"A F")).toEqual({
      kind: "file",
      query: "A F",
      from: 5,
      to: 11,
      fileScope: "all",
      allPrefix: "@ ",
      quoted: true,
    });
    expect(detectPromptCompletionTrigger("open @\"src/main")).toEqual({
      kind: "file",
      query: "src/main",
      from: 5,
      to: 15,
      fileScope: "tracked",
      quoted: true,
    });
  });

  it("detects normal tracked file and leading slash command queries", () => {
    expect(detectPromptCompletionTrigger("open @src/main")).toEqual({
      kind: "file",
      query: "src/main",
      from: 5,
      to: 14,
      fileScope: "tracked",
    });
    expect(detectPromptCompletionTrigger("/model")).toEqual({ kind: "command", query: "model", from: 0, to: 6 });
    expect(detectPromptCompletionTrigger("  /btw")).toEqual({ kind: "command", query: "btw", from: 2, to: 6 });
  });

  it("does not show slash command completions in non-leading text", () => {
    expect(detectPromptCompletionTrigger("please /btw")).toBeUndefined();
  });
});

describe("fileCompletionInsertText", () => {
  it("quotes completed file paths that contain spaces", () => {
    expect(fileCompletionInsertText("A FILE", false)).toBe('@"A FILE"');
  });

  it("preserves all-file prefixes for directories so completion can continue in that scope", () => {
    expect(fileCompletionInsertText("dir with space/", false, "@ ")).toBe('@ "dir with space/"');
    expect(fileCompletionInsertText("vendor/", false, "!@")).toBe("!@vendor/");
  });
});

describe("matchingSlashCommands", () => {
  it("keeps extension commands visible before builtins", () => {
    const commands = [
      { name: "compact", source: "builtin" as const },
      { name: "model", source: "builtin" as const },
      { name: "btw", source: "extension" as const },
      { name: "review", source: "prompt" as const },
      { name: "skill:planner", source: "skill" as const },
    ];

    expect(matchingSlashCommands(commands, "").map((command) => command.name)).toEqual(["btw", "review", "skill:planner", "compact", "model"]);
    expect(matchingSlashCommands(commands, "/bt").map((command) => command.name)).toEqual(["btw"]);
  });

  it("ranks prefix matches before contains matches", () => {
    const commands = [
      { name: "review", source: "prompt" as const },
      { name: "preview-plan", source: "extension" as const },
    ];

    expect(matchingSlashCommands(commands, "pre").map((command) => command.name)).toEqual(["preview-plan"]);
    expect(matchingSlashCommands(commands, "rev").map((command) => command.name)).toEqual(["review", "preview-plan"]);
  });
});
