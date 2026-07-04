import { api, type GitStatusResponse } from "../api";
import { queryNamespace, setNamespacedQueryKey } from "../namespacedQueryArgs";
import { workspaceRelativePath } from "../workspacePaths";
import { selectedMachineId, type GetState, type SetState, type UpdateUrl } from "./types";

const GIT_ROUTE_NAMESPACE = queryNamespace("core:workspace.git");

export class GitController {
  private pollTimer: number | undefined;

  constructor(private readonly getState: GetState, private readonly setState: SetState, private readonly updateUrl: UpdateUrl) {}

  dispose(): void {
    if (this.pollTimer !== undefined) window.clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async refreshGit(): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    try {
      const machineId = selectedMachineId(this.getState());
      const [status, gitLog] = await Promise.all([
        api.gitStatus(project.id, workspace.id, machineId),
        api.gitLog(project.id, workspace.id, machineId),
      ]);
      this.setState({ gitStatus: status, gitLog, gitStale: false, error: "" });
      const selectedDiffPath = this.getState().selectedDiffPath;
      if (selectedDiffPath !== undefined) {
        const diffPath = this.workspaceDiffPath(selectedDiffPath);
        if (diffPath !== selectedDiffPath) {
          this.setState({ selectedDiffPath: diffPath });
          setNamespacedQueryKey(GIT_ROUTE_NAMESPACE, "diff", diffPath, { replace: true });
        }
        if (status.isGitRepo) await this.refreshDiff(diffPath);
        else {
          this.setState({ selectedDiffPath: undefined, selectedDiff: undefined, selectedStagedDiff: undefined, gitLog });
          setNamespacedQueryKey(GIT_ROUTE_NAMESPACE, "diff", undefined, { replace: true });
        }
      }
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  async selectDiff(path: string): Promise<void> {
    const diffPath = this.workspaceDiffPath(path);
    this.setState({ selectedDiffPath: diffPath, selectedDiff: undefined, selectedStagedDiff: undefined, workspaceTool: "core:workspace.git", mainView: this.getState().mainView === "chat" ? "chat" : "core:workspace.git" });
    setNamespacedQueryKey(GIT_ROUTE_NAMESPACE, "diff", diffPath);
    this.updateUrl({ replace: true });
    await this.refreshDiff(diffPath);
  }

  async restoreDiff(path: string): Promise<void> {
    const diffPath = this.workspaceDiffPath(path);
    this.setState({ selectedDiffPath: diffPath, selectedDiff: undefined, selectedStagedDiff: undefined });
    await this.refreshDiff(diffPath);
  }

  async stageFile(path: string): Promise<void> {
    const diffPath = this.workspaceDiffPath(path);
    await this.applyGitStatusAction((projectId, workspaceId, machineId) => api.gitStage(projectId, workspaceId, { path: diffPath }, machineId));
  }

  async unstageFile(path: string): Promise<void> {
    const diffPath = this.workspaceDiffPath(path);
    await this.applyGitStatusAction((projectId, workspaceId, machineId) => api.gitUnstage(projectId, workspaceId, { path: diffPath }, machineId));
  }

  async stageAll(): Promise<void> {
    await this.applyGitStatusAction((projectId, workspaceId, machineId) => api.gitStage(projectId, workspaceId, {}, machineId));
  }

  async unstageAll(): Promise<void> {
    await this.applyGitStatusAction((projectId, workspaceId, machineId) => api.gitUnstage(projectId, workspaceId, {}, machineId));
  }

  async commit(message: string): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    const machineId = selectedMachineId(this.getState());
    try {
      const response = await api.gitCommit(project.id, workspace.id, { message }, machineId);
      const gitLog = await api.gitLog(project.id, workspace.id, machineId);
      await this.applyGitStatus(response.status);
      this.setState({ gitLog, error: "" });
    } catch (error) {
      this.setState({ error: String(error) });
      throw error;
    }
  }

  async refreshDiff(path: string): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    const diffPath = this.workspaceDiffPath(path);
    try {
      const [selectedDiff, selectedStagedDiff] = await Promise.all([
        api.gitDiff(project.id, workspace.id, { path: diffPath }, selectedMachineId(this.getState())),
        api.gitDiff(project.id, workspace.id, { path: diffPath, staged: true }, selectedMachineId(this.getState())),
      ]);
      this.setState({ selectedDiff, selectedStagedDiff, error: "" });
    } catch (error) {
      this.setState({ error: String(error) });
    }
  }

  private async applyGitStatusAction(action: (projectId: string, workspaceId: string, machineId: string) => Promise<{ status: GitStatusResponse }>): Promise<void> {
    const project = this.getState().selectedProject;
    const workspace = this.getState().selectedWorkspace;
    if (project === undefined || workspace === undefined) return;
    const machineId = selectedMachineId(this.getState());
    try {
      const response = await action(project.id, workspace.id, machineId);
      await this.applyGitStatus(response.status);
      this.setState({ error: "" });
    } catch (error) {
      this.setState({ error: String(error) });
      throw error;
    }
  }

  private async applyGitStatus(status: GitStatusResponse): Promise<void> {
    this.setState({ gitStatus: status, gitStale: false });
    const selectedDiffPath = this.getState().selectedDiffPath;
    if (selectedDiffPath === undefined || selectedDiffPath === "") return;
    await this.refreshDiff(selectedDiffPath);
  }

  updatePolling(): void {
    this.dispose();
    const state = this.getState();
    if (state.workspaceTool === "core:workspace.git" || state.mainView === "core:workspace.git") {
      this.pollTimer = window.setInterval(() => { void this.refreshGit(); }, 8000);
    }
  }

  private workspaceDiffPath(path: string): string {
    return workspaceRelativePath(path, this.getState().selectedWorkspace?.path);
  }
}
