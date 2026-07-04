import type { GitFileState, GitStatusResponse, SessionStatus, Workspace } from "./api";
import type { ChatLine, ChatPart, ToolExecutionPart } from "./components/shared";
import { workspaceRelativePath } from "./workspacePaths";
import { createSessionReviewDiff, type SelectedReviewDiff } from "./reviewDiff";

export type SessionWorkSummaryStatus = "idle" | "pending" | "running" | "success" | "error";

export interface SessionWorkSummaryLine {
  label: string;
  detail?: string;
  status?: SessionWorkSummaryStatus;
}

export interface SessionWorkSummaryFile extends SessionWorkSummaryLine {
  path: string;
  added?: number;
  removed?: number;
  reviewDiff?: SelectedReviewDiff;
}

export interface SessionWorkSummaryCommand extends SessionWorkSummaryLine {
  command: string;
  exitCode?: number;
}

export interface SessionWorkSummary {
  currentRequest?: string;
  workspace?: string;
  plan: SessionWorkSummaryLine[];
  sources: SessionWorkSummaryLine[];
  filesChanged: SessionWorkSummaryFile[];
  commandsRun: SessionWorkSummaryCommand[];
  testResults: SessionWorkSummaryCommand[];
  artifacts: SessionWorkSummaryLine[];
  nextSteps: SessionWorkSummaryLine[];
}

export interface SessionWorkSummaryInput {
  messages: readonly ChatLine[];
  gitStatus?: GitStatusResponse | undefined;
  selectedFilePath?: string | undefined;
  selectedDiffPath?: string | undefined;
  activeTerminalCount?: number | undefined;
  selectedWorkspace?: Pick<Workspace, "label" | "path"> | undefined;
  status?: SessionStatus | undefined;
}

interface ToolAggregate {
  toolCall?: Extract<ChatPart, { type: "toolCall" }>;
  execution?: ToolExecutionPart;
  result?: Extract<ChatPart, { type: "toolResult" }>;
}

export function buildSessionWorkSummary(input: SessionWorkSummaryInput): SessionWorkSummary {
  const tools = collectToolAggregates(input.messages);
  const shellCommands = collectShellCommands(input.messages);
  const latestRequest = latestUserText(input.messages);
  const workspaceRoot = input.selectedWorkspace?.path;
  const filesChanged = uniqueByLabelAndDetail([
    ...tools.flatMap((tool) => fileChangesFromTool(tool, workspaceRoot)),
    ...gitFilesChanged(input.gitStatus),
  ]);
  const commandsRun = uniqueCommands([
    ...tools.flatMap(commandFromTool),
    ...shellCommands,
  ]);
  const testResults = commandsRun.filter((command) => isTestCommand(command.command));
  const sources = uniqueByLabelAndDetail([
    ...tools.flatMap(sourceFromTool),
    ...input.messages.flatMap(sourceFromSkillPart),
  ]);
  const artifacts = uniqueByLabelAndDetail([
    ...tools.flatMap(artifactFromTool),
    ...selectedArtifacts(input),
  ]);
  const nextSteps = nextStepsFromState(input.status);

  return {
    ...(latestRequest === undefined ? {} : { currentRequest: latestRequest }),
    ...(input.selectedWorkspace === undefined ? {} : { workspace: workspaceLabel(input.selectedWorkspace) }),
    plan: latestRequest === undefined ? [] : [{ label: "Current request", detail: latestRequest }],
    sources,
    filesChanged,
    commandsRun,
    testResults,
    artifacts,
    nextSteps,
  };
}

function collectToolAggregates(messages: readonly ChatLine[]): ToolAggregate[] {
  const tools = new Map<string, ToolAggregate>();
  let syntheticIndex = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolPart(part)) continue;
      const key = part.toolCallId ?? `synthetic:${String(syntheticIndex++)}:${toolPartName(part)}`;
      const current = tools.get(key) ?? {};
      if (part.type === "toolCall") current.toolCall = part;
      else if (part.type === "toolExecution") current.execution = part;
      else current.result = part;
      tools.set(key, current);
    }
  }
  return [...tools.values()];
}

function isToolPart(part: ChatPart): part is Extract<ChatPart, { type: "toolCall" | "toolExecution" | "toolResult" }> {
  return part.type === "toolCall" || part.type === "toolExecution" || part.type === "toolResult";
}

function toolPartName(part: Extract<ChatPart, { type: "toolCall" | "toolExecution" | "toolResult" }>): string {
  return part.toolName;
}

function toolName(tool: ToolAggregate): string {
  return tool.execution?.toolName ?? tool.toolCall?.toolName ?? tool.result?.toolName ?? "tool";
}

function toolArgs(tool: ToolAggregate): unknown {
  return tool.execution?.args ?? tool.toolCall?.args;
}

function toolStatus(tool: ToolAggregate): SessionWorkSummaryStatus {
  if (tool.execution !== undefined) return tool.execution.status;
  if (tool.result !== undefined) return tool.result.isError ? "error" : "success";
  if (tool.toolCall !== undefined) return "pending";
  return "idle";
}

function sourceFromTool(tool: ToolAggregate): SessionWorkSummaryLine[] {
  const name = toolName(tool);
  const args = toolArgs(tool);
  if (name === "read") {
    const path = pathFromArgs(args);
    return path === undefined ? [] : [{ label: "Read file", detail: path, status: toolStatus(tool) }];
  }
  if (name === "grep" || name === "rg" || name === "glob") {
    const query = stringArg(args, "query") ?? stringArg(args, "pattern") ?? tool.execution?.summary ?? tool.toolCall?.summary;
    return query === undefined || query === "" ? [] : [{ label: "Searched codebase", detail: query, status: toolStatus(tool) }];
  }
  if (name === "web_search" || name === "search_query") {
    const query = stringArg(args, "query") ?? stringArg(args, "q") ?? tool.execution?.summary ?? tool.toolCall?.summary;
    return query === undefined || query === "" ? [] : [{ label: "Searched web", detail: query, status: toolStatus(tool) }];
  }
  if (name === "fetch_content" || name === "open" || name === "browser") {
    const url = stringArg(args, "url") ?? stringArg(args, "ref_id") ?? tool.execution?.summary ?? tool.toolCall?.summary;
    return url === undefined || url === "" ? [] : [{ label: "Opened source", detail: url, status: toolStatus(tool) }];
  }
  return [];
}

function sourceFromSkillPart(message: ChatLine): SessionWorkSummaryLine[] {
  return message.parts.flatMap((part) => {
    if (part.type !== "skillRead") return [];
    return [{ label: `Loaded ${part.name}`, detail: part.path, status: "success" as const }];
  });
}

function fileChangesFromTool(tool: ToolAggregate, workspaceRoot: string | undefined): SessionWorkSummaryFile[] {
  const name = toolName(tool);
  if (!isFileMutationTool(name)) return [];
  const args = toolArgs(tool);
  const path = pathFromArgs(args);
  const diff = diffFromTool(tool);
  const reviewDiff = reviewDiffFromTool(tool);
  const reviewChunks = diffFileStats(reviewDiff);
  const perFileStats = diffFileStats(diff);
  const label = fileActionLabel(name);
  if (perFileStats.length > 0) {
    return perFileStats.map((file) => {
      const relativePath = workspaceRelativePath(file.path, workspaceRoot);
      const snapshot = reviewSnapshotForPath(reviewDiff, reviewChunks, relativePath, workspaceRoot, perFileStats.length === 1);
      return {
        label,
        path: relativePath,
        detail: `${relativePath} · ${diffSummary(file)}`,
        status: toolStatus(tool),
        added: file.added,
        removed: file.removed,
        ...(snapshot === undefined ? {} : { reviewDiff: snapshot }),
      };
    });
  }
  const stats = diffStats(diff);
  if (path === undefined) {
    if (stats === undefined) return [];
    const snapshot = reviewSnapshotForPath(reviewDiff, reviewChunks, "diff", workspaceRoot, true);
    return [{ label, path: "diff", detail: diffSummary(stats), status: toolStatus(tool), ...stats, ...(snapshot === undefined ? {} : { reviewDiff: snapshot }) }];
  }
  const relativePath = workspaceRelativePath(path, workspaceRoot);
  const snapshot = reviewSnapshotForPath(reviewDiff, reviewChunks, relativePath, workspaceRoot, true);
  return [{
    label,
    path: relativePath,
    detail: stats === undefined ? relativePath : `${relativePath} · ${diffSummary(stats)}`,
    status: toolStatus(tool),
    ...(stats ?? {}),
    ...(snapshot === undefined ? {} : { reviewDiff: snapshot }),
  }];
}

function isFileMutationTool(name: string): boolean {
  return name === "edit" || name === "write" || name === "apply_patch" || name === "delete" || name === "move";
}

function fileActionLabel(name: string): string {
  if (name === "write") return "Wrote file";
  if (name === "delete") return "Deleted file";
  if (name === "move") return "Moved file";
  return "Edited file";
}

function commandFromTool(tool: ToolAggregate): SessionWorkSummaryCommand[] {
  const name = toolName(tool);
  if (name !== "bash" && name !== "shell" && name !== "exec_command") return [];
  const command = commandFromArgs(toolArgs(tool));
  if (command === undefined || command === "") return [];
  const detail = commandDetail(tool);
  return [{
    label: commandLabel(command, toolStatus(tool)),
    command,
    status: toolStatus(tool),
    ...(detail === undefined ? {} : { detail }),
    ...exitCodeFromText(tool.execution?.resultText ?? tool.result?.text),
  }];
}

function collectShellCommands(messages: readonly ChatLine[]): SessionWorkSummaryCommand[] {
  return messages.flatMap((message) => {
    if (message.role !== "bash") return [];
    return message.parts.flatMap((part) => {
      if (part.type !== "text") return [];
      const command = shellCommandFromText(part.text);
      if (command === undefined) return [];
      const exit = exitCodeFromText(part.text);
      const status = part.text.includes("\nexit 0") || exit.exitCode === 0
        ? "success"
        : exit.exitCode === undefined
          ? "running"
          : "error";
      const detail = shellDetail(part.text);
      return [{
        label: commandLabel(command, status),
        command,
        status,
        ...(detail === undefined ? {} : { detail }),
        ...exit,
      }];
    });
  });
}

function gitFilesChanged(status: GitStatusResponse | undefined): SessionWorkSummaryFile[] {
  if (status?.isGitRepo !== true) return [];
  return status.files.map((file) => {
    const state = visibleGitState(file.index, file.workingTree);
    return {
      label: "Git change",
      path: file.path,
      detail: file.oldPath === undefined ? `${state} · ${file.path}` : `${state} · ${file.oldPath} → ${file.path}`,
      status: "idle",
    };
  });
}

function visibleGitState(index: GitFileState, workingTree: GitFileState): GitFileState {
  return workingTree !== "unmodified" ? workingTree : index;
}

function artifactFromTool(tool: ToolAggregate): SessionWorkSummaryLine[] {
  const name = toolName(tool);
  const args = toolArgs(tool);
  if (name === "screenshot" || name === "image_query") return [{ label: "Browser artifact", detail: tool.execution?.summary ?? tool.toolCall?.summary ?? name, status: toolStatus(tool) }];
  if (name === "browser" || name === "open_browser" || name === "playwright") {
    const detail = stringArg(args, "url") ?? tool.execution?.summary ?? tool.toolCall?.summary ?? name;
    return [{ label: "Browser preview", detail, status: toolStatus(tool) }];
  }
  return [];
}

function selectedArtifacts(input: SessionWorkSummaryInput): SessionWorkSummaryLine[] {
  const artifacts: SessionWorkSummaryLine[] = [];
  if (input.selectedFilePath !== undefined && input.selectedFilePath !== "") artifacts.push({ label: "Selected file", detail: input.selectedFilePath });
  if (input.selectedDiffPath !== undefined && input.selectedDiffPath !== "") artifacts.push({ label: "Selected diff", detail: input.selectedDiffPath });
  if ((input.activeTerminalCount ?? 0) > 0) artifacts.push({ label: "Open terminals", detail: String(input.activeTerminalCount) });
  return artifacts;
}

function nextStepsFromState(status: SessionStatus | undefined): SessionWorkSummaryLine[] {
  const steps: SessionWorkSummaryLine[] = [];
  const queued = status?.queuedMessages.length ?? 0;
  if (queued > 0) steps.push({ label: `${String(queued)} queued message${queued === 1 ? "" : "s"}`, detail: "Will run after current activity", status: "pending" });
  if (status?.isCompacting === true) steps.push({ label: "History compaction running", status: "running" });
  if (status?.isStreaming === true) steps.push({ label: "Assistant response in progress", status: "running" });
  if (status?.isBashRunning === true) steps.push({ label: "Command still running", status: "running" });
  return steps;
}

function latestUserText(messages: readonly ChatLine[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const text = message.parts
      .filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text")
      .map((part) => part.text.trim())
      .filter((part) => part !== "")
      .join("\n")
      .trim();
    if (text !== "") return oneLine(text);
  }
  return undefined;
}

function workspaceLabel(workspace: Pick<Workspace, "label" | "path">): string {
  return workspace.label !== "" ? workspace.label : workspace.path;
}

function pathFromArgs(args: unknown): string | undefined {
  return stringArg(args, "path")
    ?? stringArg(args, "file_path")
    ?? stringArg(args, "filename")
    ?? stringArg(args, "toPath")
    ?? stringArg(args, "fromPath");
}

function commandFromArgs(args: unknown): string | undefined {
  return stringArg(args, "command") ?? stringArg(args, "cmd");
}

function diffFromTool(tool: ToolAggregate): string | undefined {
  return stringArg(tool.execution?.details, "diff") ?? stringArg(tool.result?.details, "diff") ?? tool.execution?.preview?.diff;
}

function reviewDiffFromTool(tool: ToolAggregate): string | undefined {
  return stringArg(tool.execution?.details, "patch") ?? stringArg(tool.result?.details, "patch") ?? diffFromTool(tool);
}

function reviewSnapshotForPath(reviewDiff: string | undefined, reviewChunks: readonly { path: string }[], path: string, workspaceRoot: string | undefined, allowWholeDiff: boolean): SelectedReviewDiff | undefined {
  if (reviewDiff === undefined || reviewDiff === "") return undefined;
  const matchingChunk = reviewChunks.find((chunk) => workspaceRelativePath(chunk.path, workspaceRoot) === path);
  if (matchingChunk === undefined && reviewChunks.length > 1 && !allowWholeDiff) return undefined;
  const diff = matchingChunk === undefined || reviewChunks.length <= 1 ? reviewDiff : extractDiffForPath(reviewDiff, matchingChunk.path) ?? reviewDiff;
  return createSessionReviewDiff({ path, diff, label: "Saved edit diff" });
}

function extractDiffForPath(diff: string, path: string): string | undefined {
  const lines = diff.split("\n");
  let start = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line?.startsWith("diff --git ") !== true) continue;
    if (diffGitPath(line) === path) {
      start = index;
      break;
    }
  }
  if (start < 0) return undefined;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (lines[index]?.startsWith("diff --git ") === true) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function diffStats(diff: string | undefined): { added: number; removed: number } | undefined {
  if (diff === undefined || diff === "") return undefined;
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

function diffFileStats(diff: string | undefined): { path: string; added: number; removed: number }[] {
  if (diff === undefined || diff === "") return [];
  const files: { path: string; added: number; removed: number }[] = [];
  let current: { path?: string; added: number; removed: number } | undefined;

  const flush = () => {
    if (current?.path !== undefined) files.push({ path: current.path, added: current.added, removed: current.removed });
    current = undefined;
  };
  const ensure = () => {
    current ??= { added: 0, removed: 0 };
    return current;
  };

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      const path = diffGitPath(line);
      current = path === undefined ? { added: 0, removed: 0 } : { path, added: 0, removed: 0 };
      continue;
    }
    if (line.startsWith("--- ")) {
      const path = diffHeaderPath(line.slice(4));
      if (path !== undefined && ensure().path === undefined) current = { ...ensure(), path };
      continue;
    }
    if (line.startsWith("+++ ")) {
      const path = diffHeaderPath(line.slice(4));
      if (path !== undefined) current = { ...ensure(), path };
      continue;
    }
    if (line.startsWith("+")) {
      if (current !== undefined) current.added += 1;
      continue;
    }
    if (line.startsWith("-") && current !== undefined) current.removed += 1;
  }
  flush();
  return files;
}

function diffGitPath(line: string): string | undefined {
  const match = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
  return match?.[2] ?? match?.[1];
}

function diffHeaderPath(rawPath: string): string | undefined {
  const path = rawPath.trim().split(/\s+/u)[0];
  if (path === undefined || path === "" || path === "/dev/null") return undefined;
  if (path.startsWith("a/") || path.startsWith("b/")) return path.slice(2);
  return path;
}

function diffSummary(stats: { added: number; removed: number }): string {
  return `+${String(stats.added)} -${String(stats.removed)}`;
}

function shellCommandFromText(text: string): string | undefined {
  const line = text.split("\n").find((candidate) => candidate.startsWith("$ "));
  const command = line?.slice(2).trim();
  return command === undefined || command === "" ? undefined : command;
}

function shellDetail(text: string): string | undefined {
  const exit = exitCodeFromText(text);
  if (exit.exitCode !== undefined) return `exit ${String(exit.exitCode)}`;
  if (text.includes("output truncated")) return "output truncated";
  return undefined;
}

function exitCodeFromText(text: string | undefined): { exitCode?: number } {
  if (text === undefined) return {};
  const match = /(?:^|\n)exit\s+(\d+)(?:\n|$)/u.exec(text);
  if (match?.[1] === undefined) return {};
  const exitCode = Number(match[1]);
  return Number.isFinite(exitCode) ? { exitCode } : {};
}

function commandLabel(command: string, status: SessionWorkSummaryStatus): string {
  if (isTestCommand(command)) {
    if (status === "success") return "Tests passed";
    if (status === "error") return "Tests failed";
    return "Running tests";
  }
  if (isBuildCommand(command)) {
    if (status === "success") return "Build passed";
    if (status === "error") return "Build failed";
    return "Running build";
  }
  if (status === "running" || status === "pending") return "Running command";
  return "Ran command";
}

function commandDetail(tool: ToolAggregate): string | undefined {
  const text = tool.execution?.resultText ?? tool.result?.text;
  const exit = exitCodeFromText(text);
  if (exit.exitCode !== undefined) return `exit ${String(exit.exitCode)}`;
  const summary = tool.execution?.summary ?? tool.toolCall?.summary;
  return summary === undefined || summary === "" ? undefined : summary;
}

function isTestCommand(command: string): boolean {
  return /\b(test|vitest|jest|playwright|pytest)\b|cargo\s+test|go\s+test|npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test/u.test(command);
}

function isBuildCommand(command: string): boolean {
  return /\b(build|typecheck|lint)\b|npm\s+run\s+(build|typecheck|lint)|pnpm\s+(build|typecheck|lint)/u.test(command);
}

function uniqueCommands(commands: SessionWorkSummaryCommand[]): SessionWorkSummaryCommand[] {
  const seen = new Set<string>();
  const result: SessionWorkSummaryCommand[] = [];
  for (const command of commands) {
    const key = `${command.command}:${command.status ?? ""}:${command.detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(command);
  }
  return result;
}

function uniqueByLabelAndDetail<T extends SessionWorkSummaryLine>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = `${item.label}:${item.detail ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function oneLine(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function stringArg(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const property = value[key];
  return typeof property === "string" && property !== "" ? property : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
