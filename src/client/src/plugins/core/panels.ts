import { html, type TemplateResult } from "lit";
import { buildSessionWorkSummary } from "../../sessionWorkSummary";
import { renderBuiltinTabIcon } from "../../components/tabIcons";
import "../../components/SessionSummaryPanel";
import "../../components/WorkspaceFilesPanel";
import "../../components/WorkspaceGitPanel";
import type { WorkspacePanelContribution, WorkspacePanelContext } from "../types";

export function createCoreWorkspacePanels(): WorkspacePanelContribution[] {
  return [
    {
      id: "workspace.summary",
      title: "Summary",
      icon: renderBuiltinTabIcon("summary"),
      order: 5,
      render: renderSummary,
    },
    {
      id: "workspace.files",
      title: "Files",
      icon: renderBuiltinTabIcon("files"),
      order: 10,
      render: renderFiles,
    },
    {
      id: "workspace.git",
      title: "Git",
      icon: renderBuiltinTabIcon("git"),
      order: 20,
      visible: ({ workspace }) => workspace.isGitRepo,
      render: renderGit,
    },
    {
      id: "workspace.terminal",
      title: "Terminal",
      icon: renderBuiltinTabIcon("terminal"),
      order: 30,
      badge: (context) => context.activeTerminalCount > 0 ? context.activeTerminalCount : undefined,
      render: renderTerminal,
    },
  ];
}

function renderSummary(context: WorkspacePanelContext): TemplateResult {
  const summary = buildSessionWorkSummary({
    messages: context.state.messages,
    gitStatus: context.gitStatus,
    selectedFilePath: context.selectedFilePath,
    selectedDiffPath: context.selectedDiffPath,
    activeTerminalCount: context.activeTerminalCount,
    selectedWorkspace: context.workspace,
    status: context.state.status,
  });
  return html`<session-summary-panel .summary=${summary}></session-summary-panel>`;
}

function renderFiles(context: WorkspacePanelContext): TemplateResult {
  return html`<workspace-files-panel variant="sidebar-split" .context=${context}></workspace-files-panel>`;
}

function renderTerminal(context: WorkspacePanelContext): TemplateResult {
  loadTerminalPanel();
  return html`<terminal-panel .workspace=${context.workspace} .machineId=${context.machine.id} .selectedTerminalId=${context.selectedTerminalId} .autoStart=${context.terminalAutoStart} .onSelectTerminal=${context.onSelectTerminal}></terminal-panel>`;
}

function renderGit(context: WorkspacePanelContext): TemplateResult {
  return html`<workspace-git-panel .context=${context}></workspace-git-panel>`;
}

function loadTerminalPanel(): void {
  void import("../../components/TerminalPanel");
}
