import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import type { GitActionResponse, GitCommitResponse, GitDiffResponse, GitFileState, GitLogEntry, GitLogResponse, GitRemoteActionResponse, GitStatusFile, GitStatusResponse } from "../../shared/apiTypes.js";
import { normalizeRelativePath } from "../workspaces/pathSafety.js";
import { sanitizedGitEnv } from "./gitEnv.js";

const MAX_OUTPUT = 2 * 1024 * 1024;

export async function gitStatus(cwd: string): Promise<GitStatusResponse> {
  const result = await runGit(cwd, ["status", "--porcelain=v2", "--branch", "--untracked-files=all", "-z"]);
  if (result.code !== 0) return { isGitRepo: false, hash: hash(result.stdout + result.stderr), files: [] };
  return parseStatus(result.stdout);
}

export async function gitDiff(cwd: string, options: { path?: string; staged?: boolean }): Promise<GitDiffResponse> {
  const staged = options.staged === true;
  let path: string | undefined;
  if (options.path !== undefined && options.path !== "") path = normalizeRelativePath(options.path);

  const args = ["diff", "--no-ext-diff", "--color=never"];
  if (staged) args.push("--cached");
  if (path !== undefined) args.push("--", path);

  const result = await runGit(cwd, args);
  if (result.code !== 0) throwGitError(result, "git diff failed");
  if (!staged && path !== undefined && result.stdout === "" && await isUntracked(cwd, path)) {
    const untracked = await runGit(cwd, ["diff", "--no-ext-diff", "--color=never", "--no-index", "/dev/null", "--", path]);
    if (untracked.code !== 0 && untracked.code !== 1) throwGitError(untracked, "git diff failed");
    return { path, staged, hash: hash(untracked.stdout), diff: untracked.stdout, truncated: untracked.truncated };
  }
  if (!staged && path !== undefined && result.stdout === "") {
    const committed = await lastCommitDiff(cwd, path);
    if (committed !== undefined) return committed;
  }
  return { ...(path === undefined ? {} : { path }), staged, hash: hash(result.stdout), diff: result.stdout, truncated: result.truncated };
}

export async function gitLog(cwd: string, limit = 60): Promise<GitLogResponse> {
  const safeLimit = String(Math.min(Math.max(Math.round(limit), 1), 200));
  const [result, status] = await Promise.all([
    runGit(cwd, ["log", `-${safeLimit}`, "--date=relative", "--decorate=short", "--format=%H%x1f%h%x1f%P%x1f%D%x1f%s%x1f%an%x1f%cr%x1e"]),
    gitStatus(cwd),
  ]);
  if (!status.isGitRepo) return { isGitRepo: false, entries: [] };
  return {
    isGitRepo: true,
    ...(status.branch === undefined ? {} : { branch: status.branch }),
    ...(status.upstream === undefined ? {} : { upstream: status.upstream }),
    entries: result.code === 0 ? parseLog(result.stdout) : [],
  };
}

export async function gitStage(cwd: string, options: { path?: string }): Promise<GitActionResponse> {
  const path = normalizeOptionalGitPath(options.path);
  const result = await runGit(cwd, path === undefined ? ["add", "--all"] : ["add", "--all", "--", path]);
  if (result.code !== 0) throwGitError(result, "git stage failed");
  return { ok: true, status: await gitStatus(cwd) };
}

export async function gitUnstage(cwd: string, options: { path?: string }): Promise<GitActionResponse> {
  const path = normalizeOptionalGitPath(options.path);
  const result = await runGit(cwd, path === undefined ? ["restore", "--staged", ":/"] : ["restore", "--staged", "--", path]);
  if (result.code !== 0) {
    const fallback = await runGit(cwd, path === undefined ? ["reset", "--mixed"] : ["reset", "--", path]);
    if (fallback.code !== 0) throwGitError(fallback, "git unstage failed");
  }
  return { ok: true, status: await gitStatus(cwd) };
}

export async function gitCommit(cwd: string, options: { message: string }): Promise<GitCommitResponse> {
  const message = options.message.trim();
  if (message === "") throw new Error("Commit message is required");
  const stagedCheck = await runGit(cwd, ["diff", "--cached", "--quiet"]);
  if (stagedCheck.code === 0) throw new Error("No staged changes to commit");
  if (stagedCheck.code !== 1) throwGitError(stagedCheck, "git commit failed");
  const result = await runGit(cwd, ["commit", "-m", message]);
  if (result.code !== 0) throwGitError(result, "git commit failed");
  const commit = await runGit(cwd, ["rev-parse", "HEAD"]);
  if (commit.code !== 0) throwGitError(commit, "git commit failed");
  const commitHash = commit.stdout.trim();
  return { ok: true, commit: commitHash, summary: firstCommitOutputLine(result.stdout), status: await gitStatus(cwd) };
}

export async function gitPull(cwd: string): Promise<GitRemoteActionResponse> {
  return gitRemoteAction(cwd, ["pull", "--ff-only"], "git pull failed");
}

export async function gitPush(cwd: string): Promise<GitRemoteActionResponse> {
  return gitRemoteAction(cwd, ["push"], "git push failed");
}

export async function gitFetchAll(cwd: string): Promise<GitRemoteActionResponse> {
  return gitRemoteAction(cwd, ["fetch", "--all", "--prune"], "git fetch failed");
}

async function gitRemoteAction(cwd: string, args: string[], fallback: string): Promise<GitRemoteActionResponse> {
  const result = await runGit(cwd, args, { timeoutMs: 60_000 });
  if (result.code !== 0) throwGitError(result, fallback);
  return { ok: true, summary: firstGitOutputLine(result.stdout, result.stderr), truncated: result.truncated, status: await gitStatus(cwd) };
}

async function lastCommitDiff(cwd: string, path: string): Promise<GitDiffResponse | undefined> {
  const logResult = await runGit(cwd, ["log", "-1", "--format=%H", "--", path]);
  if (logResult.code !== 0) return undefined;
  const commitHash = logResult.stdout.trim();
  if (commitHash === "") return undefined;
  const showResult = await runGit(cwd, ["show", "--no-ext-diff", "--color=never", "--format=", "--", path]);
  if (showResult.code !== 0) return undefined;
  return { path, staged: false, hash: hash(showResult.stdout), diff: showResult.stdout, truncated: showResult.truncated, committed: true };
}

async function isUntracked(cwd: string, path: string): Promise<boolean> {
  const result = await runGit(cwd, ["ls-files", "--others", "--exclude-standard", "-z", "--", path]);
  return result.code === 0 && result.stdout.split("\0").includes(path);
}

function normalizeOptionalGitPath(path: string | undefined): string | undefined {
  if (path === undefined || path === "") return undefined;
  return normalizeRelativePath(path);
}

function parseLog(raw: string): GitLogEntry[] {
  return raw
    .split("\x1e")
    .map((record) => record.trim())
    .filter((record) => record !== "")
    .flatMap((record) => {
      const [hashValue, shortHash, parentsRaw, refsRaw, subject, authorName, relativeDate] = record.split("\x1f");
      if (hashValue === undefined || shortHash === undefined || subject === undefined || authorName === undefined || relativeDate === undefined) return [];
      return [{
        hash: hashValue,
        shortHash,
        parents: parentsRaw === undefined || parentsRaw === "" ? [] : parentsRaw.split(" ").filter((parent) => parent !== ""),
        refs: refsRaw === undefined || refsRaw === "" ? [] : refsRaw.split(",").map((ref) => ref.trim()).filter((ref) => ref !== ""),
        subject,
        authorName,
        relativeDate,
      }];
    });
}

function firstCommitOutputLine(stdout: string): string {
  return stdout.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "Committed staged changes";
}

function firstGitOutputLine(stdout: string, stderr: string): string {
  return `${stdout}\n${stderr}`.split("\n").map((line) => line.trim()).find((line) => line !== "") ?? "Git operation completed";
}

function throwGitError(result: { stderr: string; stdout: string }, fallback: string): never {
  const message = result.stderr.trim() || result.stdout.trim() || fallback;
  throw new Error(message);
}

function parseStatus(raw: string): GitStatusResponse {
  const records = raw.split("\0").filter((record) => record !== "");
  const files: GitStatusFile[] = [];
  let branch: string | undefined;
  let upstream: string | undefined;
  let ahead: number | undefined;
  let behind: number | undefined;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record === undefined) continue;
    if (record.startsWith("# branch.head ")) branch = normalizeBranch(record.slice("# branch.head ".length));
    else if (record.startsWith("# branch.upstream ")) upstream = record.slice("# branch.upstream ".length);
    else if (record.startsWith("# branch.ab ")) {
      const match = /\+(\d+) -(\d+)/.exec(record);
      if (match) { ahead = Number(match[1]); behind = Number(match[2]); }
    } else if (record.startsWith("? ")) files.push({ path: record.slice(2), index: "untracked", workingTree: "untracked" });
    else if (record.startsWith("! ")) files.push({ path: record.slice(2), index: "ignored", workingTree: "ignored" });
    else if (record.startsWith("1 ")) {
      const parts = record.split(" ");
      files.push({ path: parts.slice(8).join(" "), index: stateFor(parts[1]?.[0]), workingTree: stateFor(parts[1]?.[1]) });
    } else if (record.startsWith("2 ")) {
      const parts = record.split(" ");
      const path = parts.slice(9).join(" ");
      const oldPath = records[i + 1];
      i += 1;
      files.push({ path, ...(oldPath === undefined ? {} : { oldPath }), index: stateFor(parts[1]?.[0]), workingTree: stateFor(parts[1]?.[1]) });
    } else if (record.startsWith("u ")) {
      const parts = record.split(" ");
      files.push({ path: parts.slice(10).join(" "), index: "conflicted", workingTree: "conflicted" });
    }
  }

  return { isGitRepo: true, hash: hash(raw), ...(branch === undefined ? {} : { branch }), ...(upstream === undefined ? {} : { upstream }), ...(ahead === undefined ? {} : { ahead }), ...(behind === undefined ? {} : { behind }), files };
}

function stateFor(code: string | undefined): GitFileState {
  if (code === undefined) return "unmodified";
  switch (code) {
    case ".": return "unmodified";
    case "M": return "modified";
    case "A": return "added";
    case "D": return "deleted";
    case "R": return "renamed";
    case "C": return "copied";
    case "U": return "conflicted";
    default: return "unmodified";
  }
}

function normalizeBranch(value: string): string | undefined {
  return value === "(detached)" ? undefined : value;
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

async function runGit(cwd: string, args: string[], options: { timeoutMs?: number } = {}): Promise<{ code: number; stdout: string; stderr: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, { cwd, env: sanitizedGitEnv(), stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => { child.kill("SIGKILL"); }, options.timeoutMs ?? 10000);
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;
    child.stdout.on("data", (chunk: Buffer) => {
      if (stdout.length + chunk.length > MAX_OUTPUT) truncated = true;
      if (stdout.length < MAX_OUTPUT) stdout = Buffer.concat([stdout, chunk]).subarray(0, MAX_OUTPUT);
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = Buffer.concat([stderr, chunk]).subarray(0, 64 * 1024); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), truncated }); });
  });
}
