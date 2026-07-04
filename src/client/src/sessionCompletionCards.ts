import type { SelectedReviewDiff } from "./reviewDiff";
import type { SessionWorkSummary, SessionWorkSummaryFile } from "./sessionWorkSummary";

export interface SessionCompletionArtifactCard {
  path: string;
  title: string;
  subtitle: string;
}

export interface SessionCompletionFileRow {
  path: string;
  added?: number;
  removed?: number;
  reviewDiff?: SelectedReviewDiff;
}

export interface SessionCompletionEditCard {
  title: string;
  added?: number;
  removed?: number;
  visibleFiles: SessionCompletionFileRow[];
  hiddenFileCount: number;
}

export interface SessionCompletionCards {
  artifact?: SessionCompletionArtifactCard;
  edits?: SessionCompletionEditCard;
}

const DEFAULT_VISIBLE_FILE_COUNT = 3;

export function buildSessionCompletionCards(summary: SessionWorkSummary, visibleFileCount = DEFAULT_VISIBLE_FILE_COUNT): SessionCompletionCards {
  const artifact = artifactCard(summary);
  const edits = editCard(summary.filesChanged, visibleFileCount);
  return {
    ...(artifact === undefined ? {} : { artifact }),
    ...(edits === undefined ? {} : { edits }),
  };
}

function artifactCard(summary: SessionWorkSummary): SessionCompletionArtifactCard | undefined {
  const selectedFile = summary.artifacts.find((item) => item.label === "Selected file" && item.detail !== undefined && item.detail !== "");
  if (selectedFile?.detail === undefined) return undefined;
  return {
    path: selectedFile.detail,
    title: basename(selectedFile.detail),
    subtitle: artifactSubtitle(selectedFile.detail),
  };
}

function editCard(files: readonly SessionWorkSummaryFile[], visibleFileCount: number): SessionCompletionEditCard | undefined {
  const merged = mergeChangedFiles(files);
  if (merged.length === 0) return undefined;

  const totals = totalStats(merged);
  const visibleCount = Math.max(1, visibleFileCount);
  return {
    title: `Edited ${String(merged.length)} file${merged.length === 1 ? "" : "s"}`,
    ...(totals ?? {}),
    visibleFiles: merged.slice(0, visibleCount),
    hiddenFileCount: Math.max(0, merged.length - visibleCount),
  };
}

function mergeChangedFiles(files: readonly SessionWorkSummaryFile[]): SessionCompletionFileRow[] {
  const merged = new Map<string, { path: string; added: number; removed: number; hasStats: boolean; reviewDiff?: SelectedReviewDiff }>();
  for (const file of files) {
    const current = merged.get(file.path) ?? { path: file.path, added: 0, removed: 0, hasStats: false };
    if (file.added !== undefined || file.removed !== undefined) {
      current.added += file.added ?? 0;
      current.removed += file.removed ?? 0;
      current.hasStats = true;
    }
    if (current.reviewDiff === undefined && file.reviewDiff !== undefined) current.reviewDiff = file.reviewDiff;
    merged.set(file.path, current);
  }
  return [...merged.values()].map((file) => ({
    path: file.path,
    ...(file.hasStats ? { added: file.added, removed: file.removed } : {}),
    ...(file.reviewDiff === undefined ? {} : { reviewDiff: file.reviewDiff }),
  }));
}

function totalStats(files: readonly SessionCompletionFileRow[]): { added: number; removed: number } | undefined {
  let hasStats = false;
  let added = 0;
  let removed = 0;
  for (const file of files) {
    if (file.added === undefined && file.removed === undefined) continue;
    hasStats = true;
    added += file.added ?? 0;
    removed += file.removed ?? 0;
  }
  return hasStats ? { added, removed } : undefined;
}

function artifactSubtitle(path: string): string {
  const ext = extension(path);
  if (ext === undefined) return "Document";
  if (isImageExtension(ext)) return `Image · ${ext.toUpperCase()}`;
  return `Document · ${ext.toUpperCase()}`;
}

function basename(path: string): string {
  const normalized = path.replace(/\\/gu, "/");
  return normalized.split("/").filter((part) => part !== "").at(-1) ?? path;
}

function extension(path: string): string | undefined {
  const name = basename(path);
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === name.length - 1) return undefined;
  return name.slice(dotIndex + 1);
}

function isImageExtension(ext: string): boolean {
  return ["avif", "gif", "jpeg", "jpg", "png", "webp"].includes(ext.toLowerCase());
}
