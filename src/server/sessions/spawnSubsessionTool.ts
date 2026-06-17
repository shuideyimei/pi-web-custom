import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

/** Lifecycle phase of a tracked subsession as seen by its parent. */
export type SubsessionStatus = "working" | "idle" | "error" | "archived" | "unknown";

export interface SpawnSubsessionResult {
  sessionId: string;
  cwd: string;
}

export interface SpawnSubsessionInvocation {
  /** cwd of the session that invoked the tool (used for project-scope checks). */
  spawningCwd: string;
  /** Session id of the parent; the spawned session is tracked against it. */
  parentSessionId: string;
  /** Session file of the parent, recorded in the child's `parentSession` header. */
  parentSessionFile: string | undefined;
  prompt: string;
  cwd: string | undefined;
}

export interface SubsessionSummary {
  sessionId: string;
  cwd: string;
  status: SubsessionStatus;
}

export interface SubsessionReadResult {
  sessionId: string;
  cwd: string;
  status: SubsessionStatus;
  finalText: string;
  messageCount: number;
}

export interface SubsessionToolDeps {
  spawn(input: SpawnSubsessionInvocation): Promise<SpawnSubsessionResult>;
  list(parentSessionId: string): Promise<SubsessionSummary[]>;
  read(parentSessionId: string, sessionId: string): Promise<SubsessionReadResult>;
}

const SpawnSubsessionParams = Type.Object({
  prompt: Type.String({
    description: "The first instruction to send to the new tracked subsession.",
  }),
  cwd: Type.Optional(Type.String({
    description: "Working directory for the subsession. Must be a workspace (worktree, or root) of the same project as this session. Defaults to this session's working directory.",
  })),
});

const ListSubsessionsParams = Type.Object({});

const ReadSubsessionParams = Type.Object({
  sessionId: Type.String({
    description: "Id of a subsession you spawned (as returned by spawn_subsession or list_subsessions).",
  }),
});

function statusLine(summary: SubsessionSummary): string {
  return `- ${summary.sessionId} [${summary.status}] in ${summary.cwd}`;
}

/**
 * Tools that let an agent spawn *tracked* child sessions and inspect them.
 *
 * Unlike `spawn_session` (fire-and-forget peers), a subsession records its
 * parent in its session header, the parent is notified when it stops working,
 * and the parent may read its transcript/result. The tools are constructed
 * per-session, carrying the spawning cwd for project-scope validation; the
 * parent's identity is taken from the live extension context at call time.
 */
export function createSubsessionToolDefinitions(spawningCwd: string, deps: SubsessionToolDeps) {
  const spawnTool = defineTool<typeof SpawnSubsessionParams, SpawnSubsessionResult>({
    name: "spawn_subsession",
    label: "Spawn subsession",
    description: "Start a tracked child session and send it an initial prompt. The subsession runs independently and a human can interact with it, but unlike spawn_session it is linked to you: you are notified when it stops working (finished, idle, or errored), and you can inspect it with list_subsessions and read_subsession. Use this to delegate work you intend to follow up on.",
    promptSnippet: "spawn_subsession: start a tracked child session you will be notified about",
    parameters: SpawnSubsessionParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const parentSessionId = ctx.sessionManager.getSessionId();
      const parentSessionFile = ctx.sessionManager.getSessionFile() ?? undefined;
      const result = await deps.spawn({ spawningCwd, parentSessionId, parentSessionFile, prompt: params.prompt, cwd: params.cwd });
      return {
        content: [{ type: "text", text: `Started subsession ${result.sessionId} in ${result.cwd}. You will be notified when it stops working.` }],
        details: result,
      };
    },
  });

  const listTool = defineTool<typeof ListSubsessionsParams, { subsessions: SubsessionSummary[] }>({
    name: "list_subsessions",
    label: "List subsessions",
    description: "List the tracked subsessions you spawned, with their current status (working, idle, error, or unknown).",
    promptSnippet: "list_subsessions: see the tracked child sessions you spawned",
    parameters: ListSubsessionsParams,
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const parentSessionId = ctx.sessionManager.getSessionId();
      const subsessions = await deps.list(parentSessionId);
      const text = subsessions.length === 0
        ? "You have not spawned any subsessions."
        : `Your subsessions:\n${subsessions.map(statusLine).join("\n")}`;
      return { content: [{ type: "text", text }], details: { subsessions } };
    },
  });

  const readTool = defineTool<typeof ReadSubsessionParams, SubsessionReadResult>({
    name: "read_subsession",
    label: "Read subsession",
    description: "Read a subsession you spawned: its status and final result. Returns the subsession's most recent assistant output so you can react to what it produced.",
    promptSnippet: "read_subsession: read the result of a subsession you spawned",
    parameters: ReadSubsessionParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const parentSessionId = ctx.sessionManager.getSessionId();
      const result = await deps.read(parentSessionId, params.sessionId);
      const body = result.finalText === "" ? "(no output yet)" : result.finalText;
      return {
        content: [{ type: "text", text: `Subsession ${result.sessionId} [${result.status}]:\n\n${body}` }],
        details: result,
      };
    },
  });

  return [spawnTool, listTool, readTool];
}
