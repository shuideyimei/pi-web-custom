import type { Workspace } from "@jmfederico/pi-web/plugin-api";

export const terminalToolId = "core:workspace.terminal";
export const actionTerminalCols = 120;
export const actionTerminalRows = 32;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface TerminalInfo {
  id: string;
  name: string;
}

interface ServerTerminalMessage {
  type: string;
  message?: string;
}

interface TerminalCommandDeps {
  createWebSocket: (url: string) => WebSocket;
  setTimeout: typeof window.setTimeout;
  clearTimeout: typeof window.clearTimeout;
}

interface TerminalLocation {
  protocol: string;
  host: string;
}

export async function createWorkspaceTerminal(
  workspace: Workspace,
  actionTitle: string,
  fetcher: FetchLike = window.fetch.bind(window),
): Promise<TerminalInfo> {
  const response = await fetcher(`/api/projects/${encodeURIComponent(workspace.projectId)}/workspaces/${encodeURIComponent(workspace.id)}/terminals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Action: ${actionTitle}`, cols: actionTerminalCols, rows: actionTerminalRows }),
  });
  if (!response.ok) throw new Error(`Failed to create terminal: ${String(response.status)}`);
  return parseTerminalInfo(await response.json(), actionTitle);
}

export function parseTerminalInfo(value: unknown, actionTitle: string): TerminalInfo {
  if (!isRecord(value) || typeof value["id"] !== "string") throw new Error("Failed to create terminal: invalid response");
  const name = value["name"];
  return { id: value["id"], name: typeof name === "string" && name !== "" ? name : `Action: ${actionTitle}` };
}

export function sendTerminalCommand(workspace: Workspace, terminalId: string, command: string, deps = defaultTerminalCommandDeps()): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = deps.createWebSocket(terminalSocketUrl(workspace, terminalId));
    const input = normalizeTerminalCommand(command);
    let settled = false;
    let sent = false;
    let fallbackTimer: number | undefined;
    let completionTimer: number | undefined;
    const timeout = deps.setTimeout(() => {
      finish(new Error("Timed out while dispatching command to terminal"));
    }, 15000);

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      deps.clearTimeout(timeout);
      if (fallbackTimer !== undefined) deps.clearTimeout(fallbackTimer);
      if (completionTimer !== undefined) deps.clearTimeout(completionTimer);
      try {
        socket.close();
      } catch {
        // Ignore close failures.
      }
      if (error === undefined) resolve();
      else reject(error);
    };

    const scheduleFinishAfterOutput = () => {
      completionTimer = deps.setTimeout(() => { finish(); }, 300);
    };

    const send = () => {
      if (settled || sent || socket.readyState !== WebSocket.OPEN) return;
      sent = true;
      socket.send(JSON.stringify({ type: "input", data: input }));
      completionTimer = deps.setTimeout(() => { finish(); }, 5000);
    };

    socket.addEventListener("open", () => {
      fallbackTimer = deps.setTimeout(send, 3000);
    });
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      void socketDataToText(event.data).then((text) => {
        const message = parseTerminalSocketMessage(text);
        if (message?.type === "error") {
          finish(new Error(message.message ?? "Terminal socket error"));
          return;
        }
        if (sent) {
          scheduleFinishAfterOutput();
          return;
        }
        if (fallbackTimer !== undefined) deps.clearTimeout(fallbackTimer);
        deps.setTimeout(send, 100);
      }).catch(() => {
        if (sent) {
          scheduleFinishAfterOutput();
          return;
        }
        if (fallbackTimer !== undefined) deps.clearTimeout(fallbackTimer);
        deps.setTimeout(send, 100);
      });
    });
    socket.addEventListener("close", () => {
      if (!sent) finish(new Error("Terminal socket closed before the command was dispatched"));
      else finish();
    });
    socket.addEventListener("error", () => { finish(new Error("Failed to connect to terminal socket")); });
  });
}

export function normalizeTerminalCommand(command: string): string {
  return `${command.replace(/\r?\n$/u, "")}\r`;
}

export async function socketDataToText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (data instanceof Blob) return await data.text();
  return String(data);
}

export function parseTerminalSocketMessage(text: string): ServerTerminalMessage | undefined {
  try {
    const message: unknown = JSON.parse(text);
    if (!isRecord(message) || typeof message["type"] !== "string") return undefined;
    const rawMessage = message["message"];
    return {
      type: message["type"],
      ...(typeof rawMessage === "string" ? { message: rawMessage } : {}),
    };
  } catch {
    return undefined;
  }
}

export function terminalSocketUrl(workspace: Workspace, terminalId: string, location: TerminalLocation = window.location): string {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const query = `cols=${String(actionTerminalCols)}&rows=${String(actionTerminalRows)}`;
  return `${protocol}//${location.host}/api/projects/${encodeURIComponent(workspace.projectId)}/workspaces/${encodeURIComponent(workspace.id)}/terminals/${encodeURIComponent(terminalId)}/socket?${query}`;
}

function defaultTerminalCommandDeps(): TerminalCommandDeps {
  return {
    createWebSocket: (url) => new WebSocket(url),
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
