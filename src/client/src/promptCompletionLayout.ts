export interface PromptCompletionMenuGeometry {
  cursorLeft: number;
  cursorTop: number;
  hostLeft: number;
  hostBottom: number;
  hostWidth: number;
}

export interface PromptCompletionMenuPosition {
  left: number;
  bottom: number;
  width: number;
}

const COMPLETION_MENU_HORIZONTAL_MARGIN = 8;
const COMPLETION_MENU_MIN_WIDTH = 160;
const COMPLETION_MENU_MAX_WIDTH = 360;
const COMPLETION_MENU_CURSOR_GAP = 4;

export function promptCompletionMenuPosition(geometry: PromptCompletionMenuGeometry): PromptCompletionMenuPosition {
  const availableWidth = Math.max(COMPLETION_MENU_MIN_WIDTH, geometry.hostWidth - COMPLETION_MENU_HORIZONTAL_MARGIN * 2);
  const width = Math.min(COMPLETION_MENU_MAX_WIDTH, availableWidth);
  const maxLeft = Math.max(COMPLETION_MENU_HORIZONTAL_MARGIN, geometry.hostWidth - width - COMPLETION_MENU_HORIZONTAL_MARGIN);
  const desiredLeft = geometry.cursorLeft - geometry.hostLeft;
  return {
    left: clamp(desiredLeft, COMPLETION_MENU_HORIZONTAL_MARGIN, maxLeft),
    bottom: geometry.hostBottom - geometry.cursorTop + COMPLETION_MENU_CURSOR_GAP,
    width,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
