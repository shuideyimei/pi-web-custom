import { describe, expect, it } from "vitest";
import type { Workspace } from "@jmfederico/pi-web/plugin-api";
import { actionTerminalCols, actionTerminalRows, createWorkspaceTerminal, normalizeTerminalCommand, parseTerminalInfo, parseTerminalSocketMessage, terminalSocketUrl, type FetchLike } from "./terminalDispatcher";

const workspace: Workspace = {
  id: "workspace 1",
  projectId: "project/1",
  path: "/repo",
  label: "repo",
  isMain: false,
  isGitRepo: true,
  isGitWorktree: true,
};

describe("terminal dispatcher", () => {
  it("normalizes commands for terminal input", () => {
    expect(normalizeTerminalCommand("npm test")).toBe("npm test\r");
    expect(normalizeTerminalCommand("npm test\n")).toBe("npm test\r");
    expect(normalizeTerminalCommand("npm test\r\n")).toBe("npm test\r");
  });

  it("builds terminal socket URLs from the current host", () => {
    expect(terminalSocketUrl(workspace, "term/1", { protocol: "https:", host: "example.test" })).toBe(
      `wss://example.test/api/projects/project%2F1/workspaces/workspace%201/terminals/term%2F1/socket?cols=${String(actionTerminalCols)}&rows=${String(actionTerminalRows)}`,
    );
  });

  it("parses terminal socket messages", () => {
    expect(parseTerminalSocketMessage(JSON.stringify({ type: "error", message: "boom" }))).toEqual({ type: "error", message: "boom" });
    expect(parseTerminalSocketMessage(JSON.stringify({ type: "output", data: "hello" }))).toEqual({ type: "output" });
    expect(parseTerminalSocketMessage("not json")).toBeUndefined();
  });

  it("creates terminals through the private workspace terminal endpoint", async () => {
    let capturedRequest: { input: string; init: RequestInit | undefined } | undefined;
    const fetcher: FetchLike = (input, init) => {
      capturedRequest = { input, init };
      return Promise.resolve(new Response(JSON.stringify({ id: "t1", name: "Action: Build" }), { status: 200 }));
    };

    await expect(createWorkspaceTerminal(workspace, "Build", fetcher)).resolves.toEqual({ id: "t1", name: "Action: Build" });

    if (capturedRequest === undefined) throw new Error("Expected terminal request");
    expect(capturedRequest.input).toBe("/api/projects/project%2F1/workspaces/workspace%201/terminals");
    expect(capturedRequest.init?.method).toBe("POST");
    expect(capturedRequest.init?.body).toBe(JSON.stringify({ name: "Action: Build", cols: actionTerminalCols, rows: actionTerminalRows }));
  });

  it("falls back to a generated terminal name when the response omits one", () => {
    expect(parseTerminalInfo({ id: "t1" }, "Build")).toEqual({ id: "t1", name: "Action: Build" });
  });
});
