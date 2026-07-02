import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type GitDiffResponse, type GitStatusResponse, type Project, type Workspace } from "../api";
import { initialAppState, type AppState } from "../appState";
import { GitController } from "./gitController";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
});

const project: Project = {
  id: "project-1",
  name: "Project",
  path: "/repo",
  createdAt: "2026-07-02T00:00:00.000Z",
};

const workspace: Workspace = {
  id: "workspace-1",
  projectId: project.id,
  path: "/repo",
  label: "repo",
  isMain: true,
  isGitRepo: true,
  isGitWorktree: false,
};

describe("GitController", () => {
  it("keeps a selected review diff after the edited file has already been committed", async () => {
    installWindowStub();
    const harness = createHarness({ selectedDiffPath: "src/App.ts" });
    const committedDiff = diffResponse({ path: "src/App.ts", diff: "diff --git a/src/App.ts b/src/App.ts\n+new", committed: true });
    const stagedDiff = diffResponse({ path: "src/App.ts", staged: true });
    vi.spyOn(api, "gitStatus").mockResolvedValue(gitStatus([]));
    vi.spyOn(api, "gitDiff")
      .mockResolvedValueOnce(committedDiff)
      .mockResolvedValueOnce(stagedDiff);

    await harness.controller.refreshGit();

    expect(api.gitDiff).toHaveBeenCalledWith("project-1", "workspace-1", { path: "src/App.ts" }, "local");
    expect(api.gitDiff).toHaveBeenCalledWith("project-1", "workspace-1", { path: "src/App.ts", staged: true }, "local");
    expect(harness.state.selectedDiffPath).toBe("src/App.ts");
    expect(harness.state.selectedDiff).toEqual(committedDiff);
    expect(harness.state.selectedStagedDiff).toEqual(stagedDiff);
  });

  it("clears selected diffs when the workspace is no longer a git repository", async () => {
    installWindowStub();
    const harness = createHarness({ selectedDiffPath: "src/App.ts", selectedDiff: diffResponse({ path: "src/App.ts" }), selectedStagedDiff: diffResponse({ path: "src/App.ts", staged: true }) });
    vi.spyOn(api, "gitStatus").mockResolvedValue({ isGitRepo: false, hash: "not-git", files: [] });
    const gitDiff = vi.spyOn(api, "gitDiff");

    await harness.controller.refreshGit();

    expect(gitDiff).not.toHaveBeenCalled();
    expect(harness.state.selectedDiffPath).toBeUndefined();
    expect(harness.state.selectedDiff).toBeUndefined();
    expect(harness.state.selectedStagedDiff).toBeUndefined();
  });
});

function createHarness(overrides: Partial<AppState> = {}): { controller: GitController; state: AppState } {
  const state = {
    ...initialAppState(),
    selectedProject: project,
    selectedWorkspace: workspace,
    ...overrides,
  };
  const controller = new GitController(
    () => state,
    (patch) => { Object.assign(state, patch); },
    vi.fn(),
  );
  return { controller, state };
}

function gitStatus(files: GitStatusResponse["files"]): GitStatusResponse {
  return { isGitRepo: true, hash: "status", files };
}

function diffResponse(overrides: Partial<GitDiffResponse>): GitDiffResponse {
  return { staged: false, hash: "diff", diff: "", truncated: false, ...overrides };
}

function installWindowStub(): void {
  Object.defineProperty(globalThis, "window", {
    value: {
      location: new URL("http://localhost/"),
      history: { pushState: vi.fn(), replaceState: vi.fn() },
      clearInterval: globalThis.clearInterval,
      setInterval: globalThis.setInterval,
    },
    configurable: true,
  });
}
