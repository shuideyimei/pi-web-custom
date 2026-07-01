import { describe, expect, it } from "vitest";
import { assistantCompletionFooterKeys } from "./assistantCompletionFooter";
import type { TimelineNode, TimelineNodeStatus, TimelineNodeType } from "./timelineAdapter";

describe("assistantCompletionFooterKeys", () => {
  it("keeps completed previous response footers while a later user turn is running", () => {
    const keys = assistantCompletionFooterKeys([
      node("user", "u:1"),
      node("step", "step:1", "success"),
      node("assistant", "a:1"),
      node("user", "u:2"),
      node("step", "step:2", "running"),
    ], { isSessionLive: true, streamingNodeKey: "step:2" });

    expect([...keys]).toEqual(["a:1"]);
  });

  it("does not show a footer when the same response has later running work", () => {
    const keys = assistantCompletionFooterKeys([
      node("user", "u:1"),
      node("step", "step:1", "success"),
      node("assistant", "a:1"),
      node("step", "step:2", "running"),
    ], { isSessionLive: true, streamingNodeKey: "step:2" });

    expect([...keys]).toEqual([]);
  });

  it("waits for the final assistant node after additional tool activity", () => {
    const keys = assistantCompletionFooterKeys([
      node("user", "u:1"),
      node("step", "step:1", "success"),
      node("assistant", "a:1"),
      node("step", "step:2", "success"),
      node("assistant", "a:2"),
    ]);

    expect([...keys]).toEqual(["a:2"]);
  });

  it("does not show a footer for the live streaming assistant", () => {
    const keys = assistantCompletionFooterKeys([
      node("user", "u:1"),
      node("step", "step:1", "success"),
      node("assistant", "a:1"),
    ], { isSessionLive: true, streamingNodeKey: "a:1" });

    expect([...keys]).toEqual([]);
  });

  it("allows low-key metadata after the assistant response", () => {
    const keys = assistantCompletionFooterKeys([
      node("user", "u:1"),
      node("step", "step:1", "success"),
      node("assistant", "a:1"),
      node("meta", "m:1"),
    ]);

    expect([...keys]).toEqual(["a:1"]);
  });
});

function node(type: TimelineNodeType, key: string, status: TimelineNodeStatus = "idle"): TimelineNode {
  return { type, key, status, parts: [] };
}
