import type { Workspace } from "@jmfederico/pi-web/plugin-api";
import { terminalToolId, type TerminalInfo } from "./terminalDispatcher.js";

interface TerminalPanelElement {
  terminals: TerminalInfo[];
  selectTerminal: (terminalId: string) => void;
}

interface Updatable {
  requestUpdate: () => void;
}

/**
 * Private Pi Web UI fallback used while the plugin API is still being dogfooded.
 * The current host provides a panel `openTerminal` helper; keep this fallback contained
 * for older hosts and replace/remove it once the public helper is required.
 */
export function openTerminalPanel(workspace: Workspace, terminalId?: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set("project", workspace.projectId);
  url.searchParams.set("workspace", workspace.id);
  url.searchParams.set("tool", terminalToolId);
  url.searchParams.set("view", terminalToolId);
  window.history.pushState({}, "", url);
  dispatchPopState();
  if (terminalId !== undefined) selectTerminalWhenAvailable(terminalId);
}

export function requestPiWebRender(): void {
  const app = document.querySelector("pi-web-app");
  if (isUpdatable(app)) app.requestUpdate();
}

function dispatchPopState(): void {
  if (typeof PopStateEvent === "function") {
    window.dispatchEvent(new PopStateEvent("popstate"));
    return;
  }
  window.dispatchEvent(new Event("popstate"));
}

function selectTerminalWhenAvailable(terminalId: string, attempt = 0): void {
  const terminalPanel = findTerminalPanel();
  const terminals = terminalPanel?.terminals ?? [];
  const hasTerminal = terminals.some((terminal) => terminal.id === terminalId);

  if (terminalPanel !== undefined && hasTerminal) {
    terminalPanel.selectTerminal(terminalId);
    return;
  }

  if (attempt < 50) window.setTimeout(() => { selectTerminalWhenAvailable(terminalId, attempt + 1); }, 150);
}

function findTerminalPanel(): TerminalPanelElement | undefined {
  const panel = document.querySelector("workspace-panel")?.shadowRoot?.querySelector("terminal-panel");
  return isTerminalPanelElement(panel) ? panel : undefined;
}

function isTerminalPanelElement(value: unknown): value is TerminalPanelElement {
  return isRecord(value) && Array.isArray(value["terminals"]) && typeof value["selectTerminal"] === "function";
}

function isUpdatable(value: unknown): value is Updatable {
  return isRecord(value) && typeof value["requestUpdate"] === "function";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
