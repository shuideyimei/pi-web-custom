import { describe, expect, it } from "vitest";
import { EXTENSION_OVERLAY_KEY_PREFIX, type GlobalSessionEvent, type SessionUiEvent } from "../../shared/apiTypes.js";
import { SessionEventHub } from "../realtime/sessionEventHub.js";
import { WebExtensionUIContext } from "./webExtensionUI.js";

class CapturingSessionEventHub extends SessionEventHub {
  readonly sessionEvents: { sessionId: string; event: SessionUiEvent }[] = [];

  override publish(sessionId: string, event: SessionUiEvent): void {
    this.sessionEvents.push({ sessionId, event });
  }

  override publishGlobal(event: GlobalSessionEvent): void {
    void event;
  }
}

describe("WebExtensionUIContext", () => {
  it("renders custom extension overlays and resolves them when the browser closes the dialog", async () => {
    const hub = new CapturingSessionEventHub();
    const ui = new WebExtensionUIContext("s1", hub);

    const resultPromise = ui.custom((tui, theme, keys, done) => {
      void theme;
      void keys;
      void done;
      return {
        render: () => [`height ${String(tui.height)}`, "BTW answer"],
      };
    }, { overlay: true });
    await flushMicrotasks();

    const overlayEvent = hub.sessionEvents.find(({ event }) => event.type === "extension.overlay")?.event;
    expect(overlayEvent).toMatchObject({
      type: "extension.overlay",
      overlay: { body: "height 28\nBTW answer", status: "ready", closable: true },
    });
    if (overlayEvent?.type !== "extension.overlay") throw new Error("Expected overlay event");

    expect(ui.respondToDialog(overlayEvent.overlay.requestId, "")).toBe(true);
    await expect(resultPromise).resolves.toBeUndefined();
    expect(hub.sessionEvents.some(({ event }) => event.type === "extension.overlay.close" && event.requestId === overlayEvent.overlay.requestId)).toBe(true);
  });

  it("does not publish browser overlays for non-overlay custom UI", async () => {
    const hub = new CapturingSessionEventHub();
    const ui = new WebExtensionUIContext("s1", hub);
    let complete: ((value: string) => void) | undefined;

    const resultPromise = ui.custom((tui, theme, keys, done) => {
      void tui;
      void theme;
      void keys;
      complete = done;
      return { render: () => ["Thinking..."] };
    });
    await flushMicrotasks();

    expect(hub.sessionEvents.map(({ event }) => event.type)).not.toContain("extension.overlay");
    complete?.("answer");

    await expect(resultPromise).resolves.toBe("answer");
    expect(hub.sessionEvents.map(({ event }) => event.type)).not.toContain("extension.overlay");
    expect(hub.sessionEvents.map(({ event }) => event.type)).not.toContain("extension.overlay.close");
  });

  it("forwards browser overlay key input to custom components and republishes the render", async () => {
    const hub = new CapturingSessionEventHub();
    const ui = new WebExtensionUIContext("s1", hub);
    let input = "initial";

    const resultPromise = ui.custom((tui, theme, keys, done) => {
      void tui;
      void theme;
      void keys;
      void done;
      return {
        handleInput: (data: string) => {
          input = data;
        },
        render: () => [`input ${input}`],
      };
    }, { overlay: true });
    await flushMicrotasks();

    const overlayEvent = hub.sessionEvents.find(({ event }) => event.type === "extension.overlay")?.event;
    if (overlayEvent?.type !== "extension.overlay") throw new Error("Expected overlay event");
    const encodedInput = `${EXTENSION_OVERLAY_KEY_PREFIX}${encodeURIComponent("j")}`;

    expect(ui.respondToDialog(overlayEvent.overlay.requestId, encodedInput)).toBe(true);
    expect(lastOverlayBody(hub)).toBe("input j");

    expect(ui.respondToDialog(overlayEvent.overlay.requestId, "")).toBe(true);
    await expect(resultPromise).resolves.toBeUndefined();
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

function lastOverlayBody(hub: CapturingSessionEventHub): string | undefined {
  return hub.sessionEvents
    .map(({ event }) => event)
    .filter((event): event is Extract<SessionUiEvent, { type: "extension.overlay" }> => event.type === "extension.overlay")
    .at(-1)?.overlay.body;
}
