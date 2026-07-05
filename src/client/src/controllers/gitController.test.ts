import { afterEach, describe, expect, it, vi } from "vitest";
import { api, type GitDiffResponse, type GitStatusResponse, type Project, type Workspace } from "../api";
import { initialAppState, type AppState } from "../appState";
import { GitController } from "./gitController";
import { createSessionReviewDiff } from "../reviewDiff";

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
    vi.spyOn(api, "gitLog").mockResolvedValue(gitLog());
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

  it("opens a saved review diff while still refreshing live git diffs", async () => {
    installWindowStub();
    const harness = createHarness();
    const reviewDiff = createSessionReviewDiff({ path: "src/App.ts", diff: "-old\n+new" });
    const unstagedDiff = diffResponse({ path: "src/App.ts" });
    const stagedDiff = diffResponse({ path: "src/App.ts", staged: true });
    vi.spyOn(api, "gitDiff")
      .mockResolvedValueOnce(unstagedDiff)
      .mockResolvedValueOnce(stagedDiff);

    await harness.controller.selectReviewDiff("src/App.ts", reviewDiff);

    expect(harness.state.selectedDiffPath).toBe("src/App.ts");
    expect(harness.state.selectedReviewDiff).toEqual(reviewDiff);
    expect(harness.state.selectedDiff).toEqual(unstagedDiff);
    expect(harness.state.selectedStagedDiff).toEqual(stagedDiff);
  });

  it("runs remote git actions and refreshes the log", async () => {
    installWindowStub();
    const harness = createHarness();
    const status = gitStatus([]);
    const log = gitLog();
    vi.spyOn(api, "gitPull").mockResolvedValue(remoteAction(status));
    vi.spyOn(api, "gitPush").mockResolvedValue(remoteAction(status));
    vi.spyOn(api, "gitFetchAll").mockResolvedValue(remoteAction(status));
    vi.spyOn(api, "gitLog").mockResolvedValue(log);

    await harness.controller.pull();
    await harness.controller.push();
    await harness.controller.fetchAll();

    expect(api.gitPull).toHaveBeenCalledWith("project-1", "workspace-1", "local");
    expect(api.gitPush).toHaveBeenCalledWith("project-1", "workspace-1", "local");
    expect(api.gitFetchAll).toHaveBeenCalledWith("project-1", "workspace-1", "local");
    expect(api.gitLog).toHaveBeenCalledTimes(3);
    expect(harness.state.gitStatus).toEqual(status);
    expect(harness.state.gitLog).toEqual(log);
    expect(harness.state.error).toBe("");
  });

  it("clears selected diffs when the workspace is no longer a git repository", async () => {
    installWindowStub();
    const harness = createHarness({ selectedDiffPath: "src/App.ts", selectedDiff: diffResponse({ path: "src/App.ts" }), selectedStagedDiff: diffResponse({ path: "src/App.ts", staged: true }), selectedReviewDiff: createSessionReviewDiff({ path: "src/App.ts", diff: "-old\n+new" }) });
    vi.spyOn(api, "gitStatus").mockResolvedValue({ isGitRepo: false, hash: "not-git", files: [] });
    vi.spyOn(api, "gitLog").mockResolvedValue({ isGitRepo: false, entries: [] });
    const gitDiff = vi.spyOn(api, "gitDiff");

    await harness.controller.refreshGit();

    expect(gitDiff).not.toHaveBeenCalled();
    expect(harness.state.selectedDiffPath).toBeUndefined();
    expect(harness.state.selectedDiff).toBeUndefined();
    expect(harness.state.selectedStagedDiff).toBeUndefined();
    expect(harness.state.selectedReviewDiff).toBeUndefined();
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

function gitLog() {
  return { isGitRepo: true, entries: [] };
}

function remoteAction(status: GitStatusResponse) {
  return { ok: true as const, summary: "ok", truncated: false, status };
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
