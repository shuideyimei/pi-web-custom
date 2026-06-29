import crypto from "node:crypto";
import type { SessionUiEvent } from "../../shared/apiTypes.js";
import type { ClientCommandResult, ClientSession } from "../types.js";
import { isBuiltinCommand } from "./builtinCommands.js";

export interface CommandSession {
  sessionId: string;
  sessionFile: string | undefined;
  sessionName: string | undefined;
  messages: readonly unknown[];
  isStreaming: boolean;
  isBashRunning: boolean;
  isCompacting: boolean;
  pendingMessageCount: number;
  promptTemplates: readonly { name: string; description?: string }[];
  extensionRunner: { getRegisteredCommands(): readonly { invocationName: string; description?: string }[] };
  resourceLoader: { getSkills(): { skills: readonly { name: string; description?: string }[] } };
  sessionManager: { getLeafId(): string | null; getHeader?: () => { parentSession?: string } | null | undefined };
  setSessionName: (name: string) => void;
  compact: (instructions?: string) => Promise<{ summary: string; tokensBefore: number }>;
  getSessionStats: () => {
    sessionId: string;
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    tokens: { input: number; output: number; total: number };
    cost: number;
  };
  getUserMessagesForForking: () => readonly { entryId: string; text: string }[];
}

export interface CommandRuntime<TSession extends CommandSession = CommandSession> {
  cwd: string;
  session: TSession;
  fork: (entryId: string, options?: { position?: "before" | "at" }) => Promise<{ cancelled: boolean; selectedText?: string }>;
}

export interface CommandActiveSession<TSession extends CommandSession = CommandSession> {
  runtime: CommandRuntime<TSession>;
}

export type GetCommandActiveSession<TSession extends CommandSession = CommandSession> = (sessionId: string) => Promise<CommandActiveSession<TSession>>;

export interface CommandEventPublisher {
  publish(sessionId: string, event: SessionUiEvent): void;
  publishGlobal?(event: Extract<SessionUiEvent, { type: "session.name" }>): void;
}

export interface SessionCommandNaming {
  listSessionNames?: (cwd: string) => Promise<readonly string[]>;
}

type RelatedSessionKind = "fork" | "copy";

interface PendingCommandSelect {
  sessionId: string;
  command: "fork";
}

export interface RuntimeCommand {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
}

export class SessionCommandService<TSession extends CommandSession = CommandSession> {
  private readonly pendingSelects = new Map<string, PendingCommandSelect>();

  constructor(
    private readonly getActive: GetCommandActiveSession<TSession>,
    private readonly prompt: (sessionId: string, text: string) => Promise<void>,
    private readonly events: CommandEventPublisher,
    private readonly lifecycle: {
      onCompactionStart?: (session: TSession) => void;
      onCompactionEnd?: (session: TSession, result: "success" | "error", detail?: string) => void;
    } = {},
    private readonly naming: SessionCommandNaming = {},
  ) {}

  async run(sessionId: string, text: string): Promise<ClientCommandResult> {
    const active = await this.getActive(sessionId);
    const session = active.runtime.session;
    const [name = "", ...args] = text.trim().replace(/^\//, "").split(/\s+/);
    const rest = args.join(" ").trim();

    const runtimeCommand = findRuntimeCommand(session, name);
    if (runtimeCommand?.source === "extension") {
      return this.forwardRuntimeCommand(sessionId, text, name);
    }

    if (!isBuiltinCommand(name)) {
      if (runtimeCommand !== undefined) return this.forwardRuntimeCommand(sessionId, text, name);
      return { type: "unsupported", message: `/${name} is not available in this session` };
    }

    if (name === "session") return { type: "done", message: formatSessionStats(session) };
    if (name === "name") return this.nameSession(active, rest);
    if (name === "compact") return this.compact(session, rest);
    if (name === "clone") return this.clone(active);
    if (name === "fork") return this.fork(active);

    return { type: "unsupported", message: `/${name} is not implemented in the web UI yet` };
  }

  async respond(sessionId: string, requestId: string, value: string): Promise<ClientCommandResult> {
    const pending = this.pendingSelects.get(requestId);
    if (pending?.sessionId !== sessionId) return { type: "unsupported", message: "Command request expired" };
    this.pendingSelects.delete(requestId);

    const active = await this.getActive(sessionId);
    if (sessionHasActiveWork(active.runtime.session)) return forkActiveUnsupported("fork");
    const relatedName = await this.nextRelatedSessionName(active, "fork");
    const result = await active.runtime.fork(value);
    if (result.cancelled) return { type: "done", message: "Fork cancelled" };
    this.tryNameRelatedSession(active.runtime.session, relatedName);
    return { type: "done", message: "Session forked", session: clientSessionFromRuntime(active.runtime), ...promptDraft(result.selectedText) };
  }

  private nameSession(active: CommandActiveSession<TSession>, name: string): ClientCommandResult {
    if (name === "") return { type: "unsupported", message: "Usage: /name <session name>" };
    active.runtime.session.setSessionName(name);
    this.publishSessionName(active.runtime.session);
    return { type: "done", message: `Session named: ${name}`, session: clientSessionFromRuntime(active.runtime) };
  }

  private compact(session: TSession, instructions: string): ClientCommandResult {
    this.lifecycle.onCompactionStart?.(session);
    void session.compact(instructions === "" ? undefined : instructions)
      .then((result) => {
        this.events.publish(session.sessionId, {
          type: "command.output",
          level: "success",
          message: formatCompactionResult(result),
        });
        this.lifecycle.onCompactionEnd?.(session, "success");
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.events.publish(session.sessionId, { type: "command.output", level: "error", message: `Compaction failed: ${message}` });
        this.events.publish(session.sessionId, { type: "session.error", message });
        this.lifecycle.onCompactionEnd?.(session, "error", message);
      });
    return { type: "done", message: "Compaction started…" };
  }

  private async clone(active: CommandActiveSession<TSession>): Promise<ClientCommandResult> {
    if (sessionHasActiveWork(active.runtime.session)) return forkActiveUnsupported("clone");
    const leafId = active.runtime.session.sessionManager.getLeafId();
    if (leafId === null || leafId === "") return { type: "unsupported", message: "Cannot clone: no current session entry" };
    const relatedName = await this.nextRelatedSessionName(active, "copy");
    const result = await active.runtime.fork(leafId, { position: "at" });
    if (result.cancelled) return { type: "done", message: "Clone cancelled" };
    this.tryNameRelatedSession(active.runtime.session, relatedName);
    return { type: "done", message: "Session cloned", session: clientSessionFromRuntime(active.runtime) };
  }

  private fork(active: CommandActiveSession<TSession>): ClientCommandResult {
    if (sessionHasActiveWork(active.runtime.session)) return forkActiveUnsupported("fork");
    const messages = active.runtime.session.getUserMessagesForForking();
    if (!messages.length) return { type: "unsupported", message: "No user messages to fork from" };
    const requestId = crypto.randomUUID();
    this.pendingSelects.set(requestId, { sessionId: active.runtime.session.sessionId, command: "fork" });
    return {
      type: "select",
      requestId,
      title: "Fork from message",
      options: [...messages].reverse().map((message) => ({ value: message.entryId, label: truncate(message.text, 140) })),
    };
  }

  private async nextRelatedSessionName(active: CommandActiveSession<TSession>, kind: RelatedSessionKind): Promise<string> {
    const sourceTitle = relatedSessionSourceTitle(active.runtime.session);
    const sourceName = normalizedName(active.runtime.session.sessionName);
    let existingNames: readonly string[];
    try {
      existingNames = await this.naming.listSessionNames?.(active.runtime.cwd) ?? [];
    } catch {
      existingNames = [];
    }
    return uniqueRelatedSessionName(sourceTitle, kind, sourceName === undefined ? existingNames : [...existingNames, sourceName]);
  }

  private tryNameRelatedSession(session: TSession, name: string): void {
    try {
      session.setSessionName(name);
      this.publishSessionName(session);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.events.publish(session.sessionId, { type: "command.output", level: "error", message: `Session created, but naming failed: ${message}` });
    }
  }

  private publishSessionName(session: TSession): void {
    const event = session.sessionName === undefined
      ? { type: "session.name", sessionId: session.sessionId } as const
      : { type: "session.name", sessionId: session.sessionId, name: session.sessionName } as const;
    this.events.publish(session.sessionId, event);
    this.events.publishGlobal?.(event);
  }

  private async forwardRuntimeCommand(sessionId: string, text: string, name: string): Promise<ClientCommandResult> {
    // The command is forwarded to the agent, which executes registered extension
    // commands, lets extension input handlers intercept command-like text, or
    // expands resources (e.g. /skill:*). The runtime stream is the authoritative
    // feedback, so we don't synthesize an extra "Accepted" line that would only
    // vanish on reload.
    await this.prompt(sessionId, text);
    return { type: "done", message: `/${name} command sent` };
  }
}

export function listRuntimeCommands(session: CommandSession): RuntimeCommand[] {
  return dedupeRuntimeCommands([
    ...session.extensionRunner.getRegisteredCommands().flatMap((command) => runtimeCommand(command.invocationName, command.description, "extension")),
    ...session.promptTemplates.flatMap((template) => runtimeCommand(template.name, template.description, "prompt")),
    ...session.resourceLoader.getSkills().skills.flatMap((skill) => skillRuntimeCommand(skill.name, skill.description)),
  ]);
}

function findRuntimeCommand(session: CommandSession, name: string): RuntimeCommand | undefined {
  const normalizedName = normalizeRuntimeCommandName(name);
  if (normalizedName === undefined) return undefined;
  return listRuntimeCommands(session).find((command) => command.name === normalizedName);
}

function runtimeCommand(name: string, description: string | undefined, source: RuntimeCommand["source"]): RuntimeCommand[] {
  const normalizedName = normalizeRuntimeCommandName(name);
  if (normalizedName === undefined) return [];
  const normalizedDescription = normalizeOptionalText(description);
  return [{
    name: normalizedName,
    ...(normalizedDescription === undefined ? {} : { description: normalizedDescription }),
    source,
  }];
}

function skillRuntimeCommand(name: string, description: string | undefined): RuntimeCommand[] {
  const normalizedName = normalizeRuntimeCommandName(name);
  return normalizedName === undefined ? [] : runtimeCommand(`skill:${normalizedName}`, description, "skill");
}

function normalizeRuntimeCommandName(name: string): string | undefined {
  const normalized = name.trim().replace(/^\/+/, "");
  return normalized === "" || /\s/.test(normalized) ? undefined : normalized;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized === "" ? undefined : normalized;
}

function dedupeRuntimeCommands(commands: RuntimeCommand[]): RuntimeCommand[] {
  const seen = new Set<string>();
  const deduped: RuntimeCommand[] = [];
  for (const command of commands) {
    if (seen.has(command.name)) continue;
    seen.add(command.name);
    deduped.push(command);
  }
  return deduped;
}

function clientSessionFromRuntime(runtime: CommandRuntime): ClientSession {
  const session = runtime.session;
  const parentSessionPath = typeof session.sessionManager.getHeader === "function" ? session.sessionManager.getHeader()?.parentSession : undefined;
  return {
    id: session.sessionId,
    path: session.sessionFile ?? "",
    cwd: runtime.cwd,
    ...(session.sessionName === undefined ? {} : { name: session.sessionName }),
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    messageCount: session.messages.length,
    firstMessage: "",
    ...(parentSessionPath === undefined ? {} : { parentSessionPath }),
  };
}

function relatedSessionSourceTitle(session: CommandSession): string {
  const name = normalizedName(session.sessionName);
  if (name !== undefined) return name;
  for (const message of session.messages) {
    const text = normalizedName(extractUserMessageText(message));
    if (text !== undefined) return truncate(text, 80);
  }
  return "Untitled session";
}

function uniqueRelatedSessionName(sourceTitle: string, kind: RelatedSessionKind, existingNames: readonly string[]): string {
  const baseName = stripRelatedSessionSuffix(sourceTitle) || "Untitled session";
  const label = kind === "fork" ? "Fork" : "Copy";
  const usedNames = new Set(existingNames.map(normalizedName).filter(isDefined));
  for (let counter = 1; ; counter += 1) {
    const candidate = `${baseName} — ${label} ${String(counter)}`;
    if (!usedNames.has(candidate)) return candidate;
  }
}

function stripRelatedSessionSuffix(name: string): string {
  return name.replace(/\s+(?:—|-)\s+(?:Fork|Copy|Clone)\s+\d+$/u, "").trim();
}

function extractUserMessageText(message: unknown): string | undefined {
  if (!isRecord(message) || message["role"] !== "user") return undefined;
  const content = message["content"];
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  return content.map((part) => {
    if (!isRecord(part) || part["type"] !== "text") return "";
    return typeof part["text"] === "string" ? part["text"] : "";
  }).join("");
}

function normalizedName(name: string | undefined): string | undefined {
  const trimmed = name?.replace(/\s+/g, " ").trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function sessionHasActiveWork(session: CommandSession): boolean {
  return session.isStreaming || session.isBashRunning || session.isCompacting || session.pendingMessageCount > 0;
}

function forkActiveUnsupported(command: "fork" | "clone"): ClientCommandResult {
  return { type: "unsupported", message: `Cannot ${command} while the session is active. Stop current activity before ${command === "fork" ? "forking" : "cloning"}.` };
}

function promptDraft(text: string | undefined): Partial<Pick<Extract<ClientCommandResult, { type: "done" }>, "promptDraft">> {
  return text === undefined ? {} : { promptDraft: text };
}

function formatSessionStats(session: CommandSession): string {
  const stats = session.getSessionStats();
  return [
    `Session: ${stats.sessionId}`,
    `Messages: ${String(stats.totalMessages)} (${String(stats.userMessages)} user, ${String(stats.assistantMessages)} assistant)`,
    `Tool calls: ${String(stats.toolCalls)}`,
    `Tokens: ↑${String(stats.tokens.input)} ↓${String(stats.tokens.output)} total ${String(stats.tokens.total)}`,
    `Cost: $${stats.cost.toFixed(4)}`,
  ].join("\n");
}

function formatCompactionResult(result: { summary: string; tokensBefore: number }): string {
  return [
    "Compaction complete.",
    `Tokens before: ${String(result.tokensBefore)}`,
    "",
    result.summary,
  ].join("\n");
}

function truncate(text: string, maxLength: number): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length <= maxLength ? singleLine : `${singleLine.slice(0, maxLength - 1)}…`;
}
