import { isSessionActive } from "../../../../shared/activity";
import { PI_WEB_CAPABILITIES, supportsPiWebCapability } from "../../../../shared/capabilities";
import type { AppState } from "../../appState";
import { isCachedNewSessionInfo } from "../../cachedNewSessions";
import { selectedMachineId } from "../../controllers/types";
import { isWorkspaceDeletionPending } from "../../workspaceDeletion";
import type { PluginAction } from "../types";

const PI_PACKAGE_MARKETPLACE_URL = "https://pi.dev/packages";

export function createCoreActions(): PluginAction[] {
  return [
    {
      id: "actions.show",
      title: "Show Actions",
      description: "Open the command palette",
      shortcut: "mod+k",
      group: "General",
      run: (context) => { context.openActionPalette(); },
    },
    {
      id: "prompt.focus",
      title: "Focus Prompt",
      description: "Move keyboard focus to the message composer",
      shortcut: "mod+g c",
      group: "General",
      run: (context) => { context.focusPrompt(); },
    },
    {
      id: "machine.add",
      title: "Add Machine",
      description: "Register another PI WEB runtime reachable from this gateway",
      group: "Machine",
      run: (context) => context.addMachine(),
    },
    {
      id: "machine.refresh",
      title: "Refresh Selected Machine",
      description: "Check whether the selected PI WEB runtime is online",
      group: "Machine",
      run: (context) => context.refreshSelectedMachine(),
    },
    {
      id: "machine.open",
      title: "Open Selected Machine PI WEB",
      description: "Open the selected remote PI WEB directly in a new tab",
      group: "Machine",
      enabled: (context) => context.state.selectedMachine?.kind === "remote" && context.state.selectedMachine.baseUrl !== undefined,
      run: (context) => context.openSelectedMachine(),
    },
    {
      id: "machine.remove",
      title: "Remove Selected Machine",
      description: "Remove the selected remote machine from this gateway",
      group: "Machine",
      enabled: (context) => context.state.selectedMachine?.kind === "remote",
      run: (context) => context.removeSelectedMachine(),
    },
    {
      id: "project.add",
      title: "Add Project",
      group: "Project",
      run: (context) => context.addProject(),
    },
    {
      id: "auth.login",
      title: "Configure Provider Authentication",
      description: "Run /login without tying authentication to a session",
      group: "General",
      run: (context) => context.configureAuth(),
    },
    {
      id: "auth.logout",
      title: "Remove Provider Authentication",
      description: "Run /logout for stored pi credentials",
      group: "General",
      run: (context) => context.logoutAuth(),
    },
    {
      id: "theme.select",
      title: "Select Theme",
      description: "Choose the PI WEB color theme",
      group: "Preferences",
      run: (context) => { context.openThemePicker(); },
    },
    {
      id: "settings.open",
      title: "Open Settings",
      description: "Manage PI WEB configuration and keyboard shortcuts",
      shortcut: "mod+,",
      group: "Preferences",
      run: (context) => { context.piWebUnstable?.openSettings?.(); },
    },
    {
      id: "marketplace.open",
      title: "Open Pi Package Marketplace",
      description: "Browse and install Pi plugins, MCP integrations, skills, prompts, and themes",
      group: "Marketplace",
      run: (context) => { context.piWebUnstable?.openSettings?.("marketplace"); },
    },
    {
      id: "marketplace.plugins",
      title: "Browse Pi Plugin Packages",
      description: "Open the official Pi extension/plugin marketplace in a new tab",
      group: "Marketplace",
      run: () => { openMarketplace(`${PI_PACKAGE_MARKETPLACE_URL}?type=extension`); },
    },
    {
      id: "marketplace.mcp",
      title: "Browse Pi MCP Packages",
      description: "Find MCP adapters and MCP-related packages for Pi",
      group: "Marketplace",
      run: () => { openMarketplace(`${PI_PACKAGE_MARKETPLACE_URL}?q=mcp`); },
    },
    {
      id: "marketplace.skills",
      title: "Browse Pi Skill Packages",
      description: "Open the official Pi skill package marketplace in a new tab",
      group: "Marketplace",
      run: () => { openMarketplace(`${PI_PACKAGE_MARKETPLACE_URL}?type=skill`); },
    },
    {
      id: "app.reload-page",
      title: "Full Page Reload",
      description: "Reload the PI WEB browser page",
      group: "General",
      run: (context) => { context.reloadPage(); },
    },
    {
      id: "view.chat",
      title: "Go to Chat",
      shortcut: "mod+1",
      group: "Navigation",
      run: (context) => { context.focusPrompt(); },
    },
    {
      id: "view.files",
      title: "Go to Files",
      shortcut: "mod+2",
      group: "Navigation",
      enabled: hasWorkspace,
      run: (context) => { context.selectMainView("core:workspace.files"); },
    },
    {
      id: "view.git",
      title: "Go to Git",
      shortcut: "mod+3",
      group: "Navigation",
      enabled: hasGitWorkspace,
      run: (context) => { context.selectMainView("core:workspace.git"); },
    },
    {
      id: "view.terminal",
      title: "Go to Terminal",
      shortcut: "mod+4",
      group: "Navigation",
      enabled: hasWorkspace,
      run: (context) => { context.selectMainView("core:workspace.terminal"); },
    },
    {
      id: "workspace.refresh-files",
      title: "Refresh Files",
      shortcut: "mod+shift+f",
      group: "Workspace",
      enabled: hasWorkspace,
      run: (context) => context.refreshFiles(),
    },
    {
      id: "workspace.refresh-git",
      title: "Refresh Git",
      shortcut: "mod+shift+g",
      group: "Workspace",
      enabled: hasGitWorkspace,
      run: (context) => context.refreshGit(),
    },
    {
      id: "workspace.refresh-current",
      title: "Refresh Current Panel",
      shortcut: "mod+shift+r",
      group: "Workspace",
      enabled: hasWorkspace,
      run: (context) => context.state.workspaceTool === "core:workspace.git" && context.state.selectedWorkspace?.isGitRepo === true ? context.refreshGit() : context.refreshFiles(),
    },
    {
      id: "workspace.delete",
      title: "Delete Workspace",
      description: "Remove the selected Git worktree",
      group: "Workspace",
      enabled: hasDeletableWorkspace,
      run: (context) => context.deleteWorkspace(),
    },
    {
      id: "session.start",
      title: "Start Session",
      shortcut: "mod+enter",
      group: "Session",
      enabled: hasWorkspace,
      run: (context) => context.startSession(),
    },
    {
      id: "session.archive",
      title: "Archive Session",
      description: "Archive the selected session",
      group: "Session",
      enabled: hasArchivableSession,
      run: (context) => context.archiveSession(),
    },
    {
      id: "session.reload",
      title: "Reload Session",
      description: "Re-read the selected session from disk to pick up entries written by another process",
      group: "Session",
      enabled: hasReloadableSession,
      run: (context) => context.reloadSession(),
    },
    {
      id: "session.delete",
      title: "Delete New Session",
      description: "Delete the selected browser-cached new session",
      group: "Session",
      enabled: hasCachedNewSession,
      run: (context) => context.deleteCachedNewSession(),
    },
    {
      id: "session.stop",
      title: "Stop Active Work",
      shortcut: "mod+.",
      group: "Session",
      enabled: (context) => context.state.selectedSession !== undefined && isSessionActive(context.state.status, context.state.activity),
      run: (context) => context.stopActiveWork(),
    },
  ];
}

function openMarketplace(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

function hasWorkspace(context: { state: AppState }): boolean {
  return context.state.selectedWorkspace !== undefined;
}

function hasGitWorkspace(context: { state: AppState }): boolean {
  return context.state.selectedWorkspace?.isGitRepo === true;
}

function hasDeletableWorkspace(context: { state: AppState }): boolean {
  const workspace = context.state.selectedWorkspace;
  return workspace !== undefined && workspace.isGitWorktree && !workspace.isMain && !isWorkspaceDeletionPending(context.state, workspace);
}

function hasArchivableSession(context: { state: AppState }): boolean {
  const session = context.state.selectedSession;
  return session !== undefined && session.archived !== true && !isCachedNewSessionInfo(session);
}

function hasCachedNewSession(context: { state: AppState }): boolean {
  return isCachedNewSessionInfo(context.state.selectedSession);
}

function hasReloadableSession(context: { state: AppState }): boolean {
  const session = context.state.selectedSession;
  if (session === undefined || session.archived === true || isCachedNewSessionInfo(session)) return false;
  const runtime = context.state.machineRuntimes[selectedMachineId(context.state)];
  if (runtime?.ok !== true || !supportsPiWebCapability(runtime, PI_WEB_CAPABILITIES.sessionsReload)) return false;
  return !isSessionActive(context.state.status, context.state.activity);
}
