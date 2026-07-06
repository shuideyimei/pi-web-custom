import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeSocket, SessionSocket } from "./sessionSocket";
import type { RealtimeEvent, SessionUiEvent } from "../../shared/apiTypes";

class FakeEventSource {
  static readonly instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(value: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) }));
  }

  fail(): void {
    this.onerror?.();
  }

  close(): void {
    this.closed = true;
  }
}

class FakeWebSocket {
  static readonly instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readonly url: string;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  emit(value: unknown): void {
    this.onmessage?.(new MessageEvent("message", { data: JSON.stringify(value) }));
  }

  open(): void {
    this.onopen?.();
  }

  close(): void {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances.length = 0;
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("location", { protocol: "https:", host: "pi.example.test" });
  vi.stubGlobal("window", { clearTimeout, setTimeout });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RealtimeSocket", () => {
  it("delivers realtime events from batched server payloads", async () => {
    const events: RealtimeEvent[] = [];
    const socket = new RealtimeSocket();

    socket.connect((event) => { events.push(event); });
    FakeEventSource.instances[0]?.emit({
      type: "batch",
      events: [
        { type: "session.name", sessionId: "session-1", name: "Useful title" },
        { type: "pi.event", eventType: "ignored-session-only" },
      ],
    });
    await Promise.resolve();

    expect(events).toEqual([{ type: "session.name", sessionId: "session-1", name: "Useful title" }]);
  });

  it("falls back to websocket realtime events when SSE is unavailable", async () => {
    const events: RealtimeEvent[] = [];
    const socket = new RealtimeSocket();

    socket.connect((event) => { events.push(event); }, undefined, "local");
    FakeEventSource.instances[0]?.fail();
    FakeWebSocket.instances[0]?.open();
    FakeWebSocket.instances[0]?.emit({ type: "session.name", sessionId: "session-1", name: "Useful title" });
    await Promise.resolve();

    expect(FakeEventSource.instances[0]?.closed).toBe(true);
    expect(FakeWebSocket.instances[0]?.url).toBe("wss://pi.example.test/api/machines/local/events");
    expect(events).toEqual([{ type: "session.name", sessionId: "session-1", name: "Useful title" }]);
  });
});

describe("SessionSocket", () => {
  it("falls back to websocket session events when SSE is unavailable", async () => {
    const events: SessionUiEvent[] = [];
    const socket = new SessionSocket();

    socket.connect({ id: "session-1", cwd: "/repo" }, (event) => { events.push(event); }, undefined, "local");
    FakeEventSource.instances[0]?.fail();
    FakeWebSocket.instances[0]?.open();
    FakeWebSocket.instances[0]?.emit({ type: "session.name", sessionId: "session-1", name: "Useful title" });
    await Promise.resolve();

    expect(FakeEventSource.instances[0]?.closed).toBe(true);
    expect(FakeWebSocket.instances[0]?.url).toBe("wss://pi.example.test/api/machines/local/sessions/session-1/events?cwd=%2Frepo");
    expect(events).toEqual([{ type: "session.name", sessionId: "session-1", name: "Useful title" }]);
  });
});
