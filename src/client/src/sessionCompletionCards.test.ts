import { describe, expect, it } from "vitest";
import { buildSessionCompletionCards } from "./sessionCompletionCards";
import { createSessionReviewDiff } from "./reviewDiff";
import type { SessionWorkSummary } from "./sessionWorkSummary";

describe("buildSessionCompletionCards", () => {
  it("builds an artifact card from the selected file", () => {
    const cards = buildSessionCompletionCards(summary({
      artifacts: [{ label: "Selected file", detail: ".changeset/pwa-window-controls-overlay.md" }],
    }));

    expect(cards.artifact).toEqual({
      path: ".changeset/pwa-window-controls-overlay.md",
      title: "pwa-window-controls-overlay.md",
      subtitle: "Document · MD",
    });
  });

  it("merges changed files and folds extra rows", () => {
    const reviewDiff = createSessionReviewDiff({ path: "src/a.ts", diff: "-old\n+new" });
    const cards = buildSessionCompletionCards(summary({
      filesChanged: [
        { label: "Edited file", path: "src/a.ts", added: 2, removed: 1, reviewDiff },
        { label: "Git change", path: "src/a.ts" },
        { label: "Edited file", path: "src/b.ts", added: 3, removed: 0 },
        { label: "Edited file", path: "src/c.ts", added: 0, removed: 4 },
        { label: "Edited file", path: "src/d.ts", added: 5, removed: 0 },
      ],
    }));

    expect(cards.edits).toEqual({
      title: "Edited 4 files",
      added: 10,
      removed: 5,
      visibleFiles: [
        { path: "src/a.ts", added: 2, removed: 1, reviewDiff },
        { path: "src/b.ts", added: 3, removed: 0 },
        { path: "src/c.ts", added: 0, removed: 4 },
      ],
      hiddenFileCount: 1,
    });
  });
});

function summary(overrides: Partial<SessionWorkSummary>): SessionWorkSummary {
  return {
    plan: [],
    sources: [],
    filesChanged: [],
    commandsRun: [],
    testResults: [],
    artifacts: [],
    nextSteps: [],
    ...overrides,
  };
}
