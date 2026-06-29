export type SubagentStatus = "pending" | "running" | "completed" | "failed" | "paused" | "detached";

export interface SubagentProgressSummary {
  toolCount?: number;
  tokens?: number;
  durationMs?: number;
}

export interface SubagentProgress extends SubagentProgressSummary {
  index?: number;
  agent?: string;
  status?: string;
  activityState?: string;
  task?: string;
  currentTool?: string;
  currentToolArgs?: string;
  currentToolStartedAt?: number;
  currentPath?: string;
  recentOutput?: string[];
  toolCount?: number;
  turnCount?: number;
  tokens?: number;
  durationMs?: number;
  error?: string;
}

export interface SubagentSingleResult {
  agent?: string;
  task?: string;
  exitCode?: number;
  detached?: boolean;
  detachedReason?: string;
  interrupted?: boolean;
  timedOut?: boolean;
  error?: string;
  sessionFile?: string;
  skills?: string[];
  model?: string;
  attemptedModels?: string[];
  progress?: SubagentProgress;
  progressSummary?: SubagentProgressSummary;
  artifactPaths?: { outputPath?: string; inputPath?: string; jsonlPath?: string; metadataPath?: string };
  truncation?: { text?: string; artifactPath?: string; truncated?: boolean; originalBytes?: number; originalLines?: number };
  finalOutput?: string;
  savedOutputPath?: string;
  outputReference?: { path?: string; message?: string; bytes?: number; lines?: number };
  messages?: unknown[];
}

export interface SubagentDetails {
  mode?: string;
  context?: string;
  runId?: string;
  asyncId?: string;
  asyncDir?: string;
  results: SubagentSingleResult[];
  progress?: SubagentProgress[];
  progressSummary?: SubagentProgressSummary;
  artifacts?: { dir?: string; files?: unknown[] };
  chainAgents?: string[];
  totalSteps?: number;
  currentStepIndex?: number;
  workflowGraph?: { nodes?: { status?: string }[] };
}

export function isSubagentDetails(value: unknown): value is SubagentDetails {
  if (!isRecord(value)) return false;
  const mode = value["mode"];
  if (mode !== undefined && typeof mode !== "string") return false;
  const results = value["results"];
  return Array.isArray(results);
}

export function summarizeSubagentArgs(args: unknown): string | undefined {
  if (!isRecord(args)) return undefined;
  const action = getString(args, "action");
  if (action !== undefined && action !== "") {
    const target = getString(args, "agent") ?? getString(args, "chainName") ?? getString(args, "id");
    return target === undefined || target === "" ? action : `${action} ${target}`;
  }

  const chain = args["chain"];
  if (Array.isArray(chain) && chain.length > 0) return `chain (${String(chain.length)})`;

  const tasks = args["tasks"];
  if (Array.isArray(tasks) && tasks.length > 0) return `parallel (${String(effectiveParallelTaskCount(tasks))})`;

  const agent = getString(args, "agent");
  if (agent !== undefined && agent !== "") {
    const task = getString(args, "task");
    return task === undefined || task.trim() === "" ? agent : `${agent} · ${truncateOneLine(task, 96)}`;
  }

  return undefined;
}

export function summarizeSubagentDetails(details: SubagentDetails): string {
  const mode = typeof details.mode === "string" && details.mode !== "" ? details.mode : "subagent";
  if (details.mode === "management") return mode;
  const total = expectedSubagentCount(details);
  const status = aggregateSubagentStatus(details);
  const count = total === 0 ? "" : ` (${String(completedSubagentCount(details))}/${String(total)})`;
  return `${mode}${count} · ${status}`;
}

export function aggregateSubagentStatus(details: SubagentDetails): SubagentStatus {
  if (hasWorkflowStatus(details, "running") || details.progress?.some((progress) => progress.status === "running") === true || details.results.some((result) => result.progress?.status === "running")) return "running";
  if (hasWorkflowStatus(details, "failed") || details.results.some((result) => resultStatus(result) === "failed")) return "failed";
  if (hasWorkflowStatus(details, "paused") || hasWorkflowStatus(details, "detached") || details.results.some((result) => {
    const status = resultStatus(result);
    return status === "paused" || status === "detached";
  })) return "paused";
  if (details.results.some((result) => resultStatus(result) === "pending")) return "pending";
  return details.results.length > 0 ? "completed" : "pending";
}

export function resultStatus(result: SubagentSingleResult): SubagentStatus {
  const progressStatus = normalizeStatus(result.progress?.status);
  if (progressStatus === "running" || progressStatus === "pending") return progressStatus;
  if (result.detached === true) return "detached";
  if (result.interrupted === true) return "paused";
  if (typeof result.exitCode === "number" && result.exitCode !== 0) return "failed";
  if (progressStatus === "failed" || progressStatus === "paused" || progressStatus === "detached") return progressStatus;
  if (typeof result.exitCode === "number") return "completed";
  return progressStatus ?? "pending";
}

export function subagentResultOutput(result: SubagentSingleResult): string {
  if (typeof result.truncation?.text === "string") return result.truncation.text;
  if (typeof result.finalOutput === "string") return result.finalOutput;
  return finalAssistantText(result.messages ?? []);
}

export function progressStats(progress: SubagentProgressSummary | undefined): string {
  if (progress === undefined) return "";
  const parts: string[] = [];
  const toolCount = finiteNumber(progress.toolCount);
  if (toolCount !== undefined && toolCount > 0) parts.push(`${String(toolCount)} tool${toolCount === 1 ? "" : "s"}`);
  const tokens = finiteNumber(progress.tokens);
  if (tokens !== undefined && tokens > 0) parts.push(`${formatTokens(tokens)} tok`);
  const durationMs = finiteNumber(progress.durationMs);
  if (durationMs !== undefined && durationMs > 0) parts.push(formatDuration(durationMs));
  return parts.join(" · ");
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 1000) return `${String(Math.round(ms))}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return remainingSeconds === 0 ? `${String(minutes)}m` : `${String(minutes)}m ${String(remainingSeconds)}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(remainingMinutes)}m`;
}

export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens)) return "0";
  if (Math.abs(tokens) < 1000) return String(Math.round(tokens));
  if (Math.abs(tokens) < 1_000_000) return `${trimFixed(tokens / 1000, 1)}k`;
  return `${trimFixed(tokens / 1_000_000, 1)}m`;
}

export function truncateOneLine(text: string, maxLength: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= maxLength ? oneLine : `${oneLine.slice(0, Math.max(0, maxLength - 1))}…`;
}

function completedSubagentCount(details: SubagentDetails): number {
  return details.results.filter((result) => resultStatus(result) === "completed").length;
}

function expectedSubagentCount(details: SubagentDetails): number {
  if (typeof details.totalSteps === "number" && Number.isFinite(details.totalSteps) && details.totalSteps > 0) return details.totalSteps;
  if (Array.isArray(details.chainAgents) && details.chainAgents.length > 0) return details.chainAgents.length;
  if (details.progress !== undefined && details.progress.length > details.results.length) return details.progress.length;
  return details.results.length;
}

function effectiveParallelTaskCount(tasks: unknown[]): number {
  return tasks.reduce<number>((total, task) => {
    const count = getNumber(task, "count");
    return total + (count !== undefined && Number.isInteger(count) && count >= 1 ? count : 1);
  }, 0);
}

function hasWorkflowStatus(details: SubagentDetails, status: string): boolean {
  return details.workflowGraph?.nodes?.some((node) => node.status === status) === true;
}

function normalizeStatus(status: unknown): SubagentStatus | undefined {
  if (typeof status !== "string") return undefined;
  const normalized = status === "complete" ? "completed" : status;
  if (normalized === "pending" || normalized === "running" || normalized === "completed" || normalized === "failed" || normalized === "paused" || normalized === "detached") return normalized;
  return undefined;
}

function finalAssistantText(messages: readonly unknown[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!isRecord(message) || message["role"] !== "assistant") continue;
    const content = message["content"];
    if (typeof content === "string" && content.trim() !== "") return content;
    if (!Array.isArray(content)) continue;
    const texts: string[] = [];
    for (const part of content) {
      if (isRecord(part) && part["type"] === "text" && typeof part["text"] === "string" && part["text"].trim() !== "") texts.push(part["text"]);
    }
    if (texts.length > 0) return texts.join("\n").trim();
  }
  return "";
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown, key: string): string | undefined {
  const property = isRecord(value) ? value[key] : undefined;
  return typeof property === "string" ? property : undefined;
}

function getNumber(value: unknown, key: string): number | undefined {
  const property = isRecord(value) ? value[key] : undefined;
  return typeof property === "number" && Number.isFinite(property) ? property : undefined;
}
