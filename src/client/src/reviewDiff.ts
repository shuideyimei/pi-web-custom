import type { GitDiffResponse } from "./api";

export interface SelectedReviewDiff extends GitDiffResponse {
  source: "session";
  label?: string;
}

export function createSessionReviewDiff(input: { path?: string; diff: string; truncated?: boolean; label?: string }): SelectedReviewDiff {
  return {
    ...(input.path === undefined || input.path === "" ? {} : { path: input.path }),
    staged: false,
    hash: hashString(`${input.path ?? ""}\0${input.diff}`),
    diff: input.diff,
    truncated: input.truncated ?? false,
    source: "session",
    ...(input.label === undefined || input.label === "" ? {} : { label: input.label }),
  };
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
