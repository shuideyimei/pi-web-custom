import { describe, expect, it } from "vitest";
import type { GitStatusResponse } from "./api";
import { buildSessionWorkSummary } from "./sessionWorkSummary";
import type { ChatLine, ToolExecutionPart } from "./components/shared";

describe("buildSessionWorkSummary", () => {
  it("derives request, sources, edits, commands, tests, and artifacts from transcript state", () => {
    const messages: ChatLine[] = [
      line("user", [{ type: "text", text: "Please fix the menu" }]),
      line("tool", [
        tool("read", "success", { path: "src/App.ts" }),
        tool("edit", "success", { path: "src/App.ts" }, { diff: "-old\n+new" }),
        tool("bash", "success", { command: "npm test" }, undefined, "42 passed\nexit 0"),
      ]),
    ];

    const summary = buildSessionWorkSummary({
      messages,
      gitStatus: gitStatus("src/App.ts"),
      selectedFilePath: "src/App.ts",
      selectedDiffPath: "src/App.ts",
      activeTerminalCount: 1,
      selectedWorkspace: { label: "pi-web", path: "/repo" },
    });

    expect(summary.workspace).toBe("pi-web");
    expect(summary.plan).toEqual([{ label: "Current request", detail: "Please fix the menu" }]);
    expect(summary.sources).toEqual([{ label: "Read file", detail: "src/App.ts", status: "success" }]);
    expect(summary.filesChanged).toHaveLength(2);
    expect(summary.filesChanged[0]).toMatchObject({ label: "Edited file", path: "src/App.ts", detail: "src/App.ts · +1 -1", status: "success", added: 1, removed: 1 });
    expect(summary.filesChanged[0]?.reviewDiff).toMatchObject({ path: "src/App.ts", diff: "-old\n+new", source: "session" });
    expect(summary.filesChanged[1]).toEqual({ label: "Git change", path: "src/App.ts", detail: "modified · src/App.ts", status: "idle" });
    expect(summary.commandsRun).toEqual([{ label: "Tests passed", command: "npm test", detail: "exit 0", status: "success", exitCode: 0 }]);
    expect(summary.testResults).toHaveLength(1);
    expect(summary.artifacts).toEqual([
      { label: "Selected file", detail: "src/App.ts" },
      { label: "Selected diff", detail: "src/App.ts" },
      { label: "Open terminals", detail: "1" },
    ]);
  });

  it("does not expose thinking content as plan or source material", () => {
    const summary = buildSessionWorkSummary({
      messages: [
        line("assistant", [{ type: "thinking", text: "private reasoning should stay private" }]),
      ],
    });

    expect(summary.plan).toEqual([]);
    expect(summary.sources).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain("private reasoning");
  });

  it("normalizes file mutation paths inside the selected workspace", () => {
    const summary = buildSessionWorkSummary({
      messages: [
        line("tool", [
          tool("edit", "success", { path: "/repo/src/App.ts" }, { diff: "-old\n+new" }),
        ]),
      ],
      selectedWorkspace: { label: "pi-web", path: "/repo" },
    });

    expect(summary.filesChanged).toHaveLength(1);
    expect(summary.filesChanged[0]).toMatchObject({ label: "Edited file", path: "src/App.ts", detail: "src/App.ts · +1 -1", status: "success", added: 1, removed: 1 });
    expect(summary.filesChanged[0]?.reviewDiff).toMatchObject({ path: "src/App.ts", diff: "-old\n+new", source: "session" });
  });

  it("splits multi-file diffs into per-file edit counts", () => {
    const summary = buildSessionWorkSummary({
      messages: [
        line("tool", [
          tool("apply_patch", "success", {}, {
            diff: [
              "diff --git a/src/a.ts b/src/a.ts",
              "--- a/src/a.ts",
              "+++ b/src/a.ts",
              "@@ -1 +1,2 @@",
              "-old",
              "+new",
              "+more",
              "diff --git a/src/b.ts b/src/b.ts",
              "--- a/src/b.ts",
              "+++ b/src/b.ts",
              "@@ -3,2 +3 @@",
              "-drop",
              " keep",
            ].join("\n"),
          }),
        ]),
      ],
    });

    expect(summary.filesChanged).toHaveLength(2);
    expect(summary.filesChanged[0]).toMatchObject({ label: "Edited file", path: "src/a.ts", detail: "src/a.ts · +2 -1", status: "success", added: 2, removed: 1 });
    expect(summary.filesChanged[0]?.reviewDiff).toMatchObject({ path: "src/a.ts", source: "session" });
    expect(summary.filesChanged[1]).toMatchObject({ label: "Edited file", path: "src/b.ts", detail: "src/b.ts · +0 -1", status: "success", added: 0, removed: 1 });
    expect(summary.filesChanged[1]?.reviewDiff).toMatchObject({ path: "src/b.ts", source: "session" });
  });

  it("uses unified patches as saved review diffs when available", () => {
    const summary = buildSessionWorkSummary({
      messages: [
        line("tool", [
          tool("edit", "success", { path: "src/App.ts" }, { diff: "-old\n+new", patch: "--- a/src/App.ts\n+++ b/src/App.ts\n@@ -1 +1 @@\n-old\n+new" }),
        ]),
      ],
    });

    expect(summary.filesChanged[0]?.reviewDiff).toEqual(expect.objectContaining({
      path: "src/App.ts",
      diff: "--- a/src/App.ts\n+++ b/src/App.ts\n@@ -1 +1 @@\n-old\n+new",
      source: "session",
    }));
  });
});

function line(role: ChatLine["role"], parts: ChatLine["parts"]): ChatLine {
  return { role, parts };
}

function tool(toolName: string, status: ToolExecutionPart["status"], args: unknown, details?: unknown, resultText?: string): ToolExecutionPart {
  return {
    type: "toolExecution",
    toolName,
    summary: "",
    status,
    args,
    ...(details === undefined ? {} : { details }),
    ...(resultText === undefined ? {} : { resultText }),
  };
}

function gitStatus(path: string): GitStatusResponse {
  return {
    isGitRepo: true,
    hash: "abc",
    files: [{ path, index: "unmodified", workingTree: "modified" }],
  };
}
