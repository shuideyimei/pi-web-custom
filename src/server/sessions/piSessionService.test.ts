/* eslint-disable @typescript-eslint/consistent-type-assertions */
import type { AgentSession, AgentSessionRuntime, CreateAgentSessionRuntimeFactory, SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { SessionEventHub } from "../realtime/sessionEventHub.js";
import type { GlobalSessionEvent, SessionUiEvent } from "../../shared/apiTypes.js";
import { PiSessionService } from "./piSessionService.js";

class CapturingSessionEventHub extends SessionEventHub {
  readonly sessionEvents: { sessionId: string; event: SessionUiEvent }[] = [];
  readonly globalEvents: GlobalSessionEvent[] = [];

  override publish(sessionId: string, event: SessionUiEvent): void {
    this.sessionEvents.push({ sessionId, event });
  }

  override publishGlobal(event: GlobalSessionEvent): void {
    this.globalEvents.push(event);
  }
}

function fakeSessionManager(cwd = "/workspace"): SessionManager {
  return {
    getCwd: () => cwd,
    getBranch: () => [],
  } as unknown as SessionManager;
}

type RuntimeFactoryResult = Awaited<ReturnType<CreateAgentSessionRuntimeFactory>>;

function asRuntimeFactoryResult(runtime: AgentSessionRuntime): RuntimeFactoryResult {
  return runtime as unknown as RuntimeFactoryResult;
}

function fakeRuntime(sessionId = "session-1") {
  const promptCalls: { text: string; options: unknown }[] = [];
  const calls = { abort: 0, dispose: 0, prompt: promptCalls };
  const session = {
    sessionId,
    sessionFile: `/tmp/${sessionId}.jsonl`,
    messages: [],
    sessionName: undefined,
    model: undefined,
    thinkingLevel: undefined,
    isStreaming: false,
    isCompacting: false,
    isBashRunning: false,
    pendingMessageCount: 0,
    sessionManager: fakeSessionManager(),
    subscribe: () => () => undefined,
    getSessionStats: () => ({ tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, cost: 0 }),
    getContextUsage: () => undefined,
    prompt: (text: string, options: unknown) => {
      calls.prompt.push({ text, options });
      return Promise.resolve();
    },
    abort: () => {
      calls.abort += 1;
      return Promise.resolve();
    },
  } as unknown as AgentSession;
  const runtime = {
    session,
    setRebindSession: () => undefined,
    dispose: () => {
      calls.dispose += 1;
      return Promise.resolve();
    },
  } as unknown as AgentSessionRuntime;
  return { runtime, calls };
}

describe("PiSessionService", () => {
  it("starts sessions through an injected runtime factory", async () => {
    const hub = new CapturingSessionEventHub();
    const fake = fakeRuntime();
    const createRuntime: CreateAgentSessionRuntimeFactory = () => Promise.resolve(asRuntimeFactoryResult(fake.runtime));
    const service = new PiSessionService(hub, {
      createRuntime,
      createAgentRuntime: () => Promise.resolve(fake.runtime),
      sessionManager: {
        create: () => fakeSessionManager(),
        list: () => Promise.resolve([]),
        listAll: () => Promise.resolve([]),
        open: () => fakeSessionManager(),
      },
      heartbeatIntervalMs: 60_000,
    });

    const session = await service.start("/workspace");

    expect(session).toMatchObject({ id: "session-1", cwd: "/workspace", messageCount: 0 });
    expect(service.activeCount()).toBe(1);
    expect(hub.globalEvents.some((event) => event.type === "status.update" && event.status.sessionId === "session-1")).toBe(true);

    await service.dispose();
    expect(fake.calls.abort).toBe(1);
    expect(fake.calls.dispose).toBe(1);
  });

  it("uses injected archive and session-manager gateways for listing", async () => {
    const service = new PiSessionService(new CapturingSessionEventHub(), {
      archiveStore: {
        list: () => Promise.resolve([{ sessionId: "archived", cwd: "/workspace", archivedAt: "2026-01-01T00:00:00.000Z" }]),
        archive: () => Promise.resolve({ sessionId: "archived", cwd: "/workspace", archivedAt: "2026-01-01T00:00:00.000Z" }),
        restore: () => Promise.resolve(),
        isArchived: () => Promise.resolve(false),
      },
      sessionManager: {
        create: () => fakeSessionManager(),
        list: () => Promise.resolve([
          { id: "active", path: "/sessions/active.jsonl", cwd: "/workspace", created: new Date("2026-01-01T00:00:00.000Z"), modified: new Date("2026-01-01T00:01:00.000Z"), messageCount: 1, firstMessage: "hello", allMessagesText: "hello" },
          { id: "archived", path: "/sessions/archived.jsonl", cwd: "/workspace", created: new Date("2026-01-01T00:00:00.000Z"), modified: new Date("2026-01-01T00:01:00.000Z"), messageCount: 2, firstMessage: "bye", allMessagesText: "bye" },
        ]),
        listAll: () => Promise.resolve([]),
        open: () => fakeSessionManager(),
      },
      heartbeatIntervalMs: 60_000,
    });

    const sessions = await service.list("/workspace");
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ id: "active" });
    expect(sessions[0]?.archived).toBeUndefined();
    expect(sessions[1]).toMatchObject({ id: "archived", archived: true, archivedAt: "2026-01-01T00:00:00.000Z" });

    await service.dispose();
  });

  it("sends prompts to an injected runtime without touching the SDK runtime", async () => {
    const fake = fakeRuntime("prompt-session");
    const service = new PiSessionService(new CapturingSessionEventHub(), {
      createRuntime: () => Promise.resolve(asRuntimeFactoryResult(fake.runtime)),
      createAgentRuntime: () => Promise.resolve(fake.runtime),
      sessionManager: {
        create: () => fakeSessionManager(),
        list: () => Promise.resolve([]),
        listAll: () => Promise.resolve([{ id: "prompt-session", path: "/sessions/prompt-session.jsonl", cwd: "/workspace", created: new Date("2026-01-01T00:00:00.000Z"), modified: new Date("2026-01-01T00:01:00.000Z"), messageCount: 0, firstMessage: "", allMessagesText: "" }]),
        open: () => fakeSessionManager(),
      },
      heartbeatIntervalMs: 60_000,
    });

    await service.prompt("prompt-session", "Build the thing");

    expect(fake.calls.prompt).toEqual([{ text: "Build the thing", options: undefined }]);
    await service.dispose();
  });
});
