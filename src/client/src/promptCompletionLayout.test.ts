import { describe, expect, it } from "vitest";
import { promptCompletionMenuPosition } from "./promptCompletionLayout";

describe("promptCompletionMenuPosition", () => {
  it("gives cursor-positioned completion menus an explicit width", () => {
    expect(promptCompletionMenuPosition({
      cursorLeft: 420,
      cursorTop: 900,
      hostLeft: 100,
      hostBottom: 940,
      hostWidth: 800,
    })).toEqual({ left: 320, bottom: 44, width: 360 });
  });

  it("clamps the menu inside the editor wrap near the right edge", () => {
    expect(promptCompletionMenuPosition({
      cursorLeft: 890,
      cursorTop: 900,
      hostLeft: 100,
      hostBottom: 940,
      hostWidth: 800,
    })).toEqual({ left: 432, bottom: 44, width: 360 });
  });

  it("uses the available editor width on narrow composers", () => {
    expect(promptCompletionMenuPosition({
      cursorLeft: 260,
      cursorTop: 900,
      hostLeft: 100,
      hostBottom: 940,
      hostWidth: 300,
    })).toEqual({ left: 8, bottom: 44, width: 284 });
  });
});
