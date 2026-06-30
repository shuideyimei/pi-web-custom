import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { activityShimmerStyles } from "./activityShimmerStyles";
import type { StepData, ToolAggregation } from "./timelineAdapter";
import "./ToolCallNode";

/**
 * StepNode — Codex-style compact step indicator.
 *
 * Groups a thinking phase + its tool calls into a single collapsible row.
 * Also handles tool-only groups (no thinking) from the adapter.
 *
 * Collapsed (default):
 *   ● Thinking… ▸              (while thinking, text shimmer)
 *   ● Working… ▸               (while tools running, text shimmer)
 *   ● Read 3 files · Ran 2 ▸    (after tools complete, compact summary)
 *
 * Expanded (click):
 *   Shows individual tool-call-node entries for each tool in the step.
 *
 * Thinking content is never shown (Codex design: thinking is private).
 */
const THINKING_LABEL = "Thinking";

@customElement("step-node")
export class StepNode extends LitElement {
  @property({ attribute: false }) step: StepData | undefined;
  @property({ type: Boolean }) streaming = false;
  @property({ type: Boolean }) summaryReady = true;
  @state() private expanded = false;
  @state() private userToggled = false;

  override render() {
    const step = this.step;
    if (step === undefined) return null;

    const hasThinking = step.thinking !== undefined;
    const isThinkingOnly = hasThinking && step.tools.length === 0 && step.textParts.length === 0;
    const hasText = step.textParts.length > 0;
    const isRunning = step.tools.some(
      (agg) => toolAggStatus(agg) === "running" || toolAggStatus(agg) === "pending",
    );
    const isAnimating = isThinkingOnly || isRunning;
    const isCompleteNoTools = !isRunning && step.tools.length === 0 && hasThinking;
    const effectiveOpen = this.userToggled ? this.expanded : false;
    const summary = stepSummary(step);

    // If thinking-only is already followed by assistant text, don't leave an
    // extra "Analyzed" row behind.
    if (isCompleteNoTools && this.summaryReady) {
      return null;
    }

    const isActive = isAnimating || !this.summaryReady;
    const shouldShimmer = this.streaming && isActive;

    // Determine active label. While waiting for the next assistant text, keep the
    // activity row visible but don't switch to the completed summary yet.
    const activeTool = currentRunningTool(step) ?? latestTool(step);
    const label = activeTool !== undefined
      ? runningToolLabel(activeTool)
      : THINKING_LABEL;

    return html`
      <div class="step${effectiveOpen ? " expanded" : ""}${shouldShimmer ? " animating" : ""}${step.tools.length === 0 ? " empty" : ""}">
        <div
          class="step-header"
          role="button"
          tabindex="0"
          aria-expanded=${String(effectiveOpen)}
          @click=${() => { this.toggle(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } }}
        >
          ${isActive
            ? shouldShimmer
            ? html`<span class="step-label shimmer-text" title=${label}>${label}</span>`
              : html`<span class="step-label active-label" title=${label}>${label}</span>`
            : html`<span class="step-label">${summary}</span>`
          }
          <span class="step-chevron" aria-hidden="true">${effectiveOpen ? "▾" : "▸"}</span>
        </div>
        ${effectiveOpen ? html`
          <div class="step-body">
            ${hasText ? html`
              <div class="step-text-parts">
                ${step.textParts.map((tp) => html`
                  <div class="step-text-part">${tp.text}</div>
                `)}
              </div>
            ` : null}
            ${step.tools.map((agg) => html`
              <tool-call-node class="step-tool" .aggregation=${agg} .agentActive=${this.streaming}></tool-call-node>
            `)}
          </div>
        ` : null}
      </div>
    `;
  }

  private toggle() {
    this.userToggled = true;
    this.expanded = !this.expanded;
  }

  static override styles = [activityShimmerStyles, css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }

    .step {
      display: grid;
      gap: 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .step.expanded { gap: 6px; }

    .step-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      min-width: 0;
      box-sizing: border-box;
      padding: 4px 0;
      cursor: pointer;
      user-select: none;
      border: 0;
      border-radius: 4px;
      background: transparent;
      overflow: hidden;
      transition: color .15s ease, background .15s ease;
    }
    .step-header:hover { background: color-mix(in srgb, var(--pi-surface-hover) 45%, transparent); }
    .step-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }

    .step-label {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--activity-row-text);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: .02em;
    }

    .shimmer-text { font-weight: 600; letter-spacing: .02em; }

    .step-chevron {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--activity-row-text);
      opacity: .5;
    }

    .step-body {
      display: grid;
      gap: 6px;
      max-height: min(440px, 55vh);
      overflow: auto;
      margin-left: 3px;
      padding: 4px 0 4px 13px;
      border-left: 1px solid var(--pi-border-muted);
      background: transparent;
    }

    /* ── Text parts inside step (expanded) ── */
    .step-text-parts {
      display: grid;
      gap: 4px;
      margin-bottom: 4px;
    }
    .step-text-part {
      font-size: 13px;
      color: var(--pi-muted);
      line-height: 1.5;
      padding: 2px 0;
      background: transparent;
    }

  `];
}

// ─── Utility functions ────────────────────────────────────────────────

function toolAggStatus(agg: ToolAggregation): string {
  if (agg.execution !== undefined) return agg.execution.status;
  if (agg.result !== undefined) return agg.result.isError ? "error" : "success";
  if (agg.toolCall !== undefined) return "pending";
  if (agg.skillRead !== undefined) return "success";
  return "idle";
}

function currentRunningTool(step: StepData): ToolAggregation | undefined {
  for (const agg of step.tools) {
    const status = toolAggStatus(agg);
    if (status === "running" || status === "pending") return agg;
  }
  return undefined;
}

function latestTool(step: StepData): ToolAggregation | undefined {
  return step.tools.at(-1);
}

function runningToolLabel(agg: ToolAggregation): string {
  const name = aggregationToolName(agg);
  if (name === "load_skill") return "Loading skill";
  if (name === "read") return "Reading files";
  if (name === "edit" || name === "write" || name === "apply_patch") return "Editing files";
  if (name === "grep" || name === "rg" || name === "glob") return "Searching codebase";
  if (name === "web_search" || name === "fetch_content" || name === "search_query") return "Searching sources";
  if (isUserInputToolName(name) || isUserInputRequestArgs(toolArgs(agg))) return "Waiting for input";
  if (name === "bash") {
    const command = stringArg(toolArgs(agg), "command");
    if (command !== undefined && isTestCommand(command)) return "Running tests";
    if (command !== undefined && isBuildCommand(command)) return "Running build";
    return "Running command";
  }
  if (name === "browser" || name === "screenshot" || name === "open") return "Inspecting browser";
  if (name === "subagent") return "Reviewing task";
  const detail = toolCallDetail(name, toolArgs(agg), agg.execution?.summary ?? agg.toolCall?.summary);
  return detail === "" ? `Running ${name}` : `Running ${name}`;
}

function toolArgs(agg: ToolAggregation): Record<string, unknown> | undefined {
  if (agg.skillRead !== undefined) return { name: agg.skillRead.name, path: agg.skillRead.path };
  const args = agg.toolCall?.args ?? agg.execution?.args;
  return isRecord(args) ? args : undefined;
}

function aggregationToolName(agg: ToolAggregation): string {
  if (agg.skillRead !== undefined) return "load_skill";
  return agg.execution?.toolName ?? agg.toolCall?.toolName ?? agg.result?.toolName ?? "tool";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolCallDetail(toolName: string, args: Record<string, unknown> | undefined, summary: string | undefined): string {
  if (args !== undefined) {
    const command = stringArg(args, "command");
    if (command !== undefined) return command;

    const path = stringArg(args, "path");
    if (path !== undefined) return path;

    const query = stringArg(args, "query");
    if (query !== undefined) return query;

    const url = stringArg(args, "url");
    if (url !== undefined) return url;

    const entries = Object.entries(args).filter(([, value]) => value !== undefined && value !== null);
    if (entries.length > 0) return entries.map(([key, value]) => `${key}: ${inlineValue(value)}`).join(" ");
  }
  return summary ?? "";
}

function stringArg(args: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = args?.[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function inlineValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(inlineValue).join(", ")}]`;
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return "object";
    }
  }
  return String(value);
}

/**
 * Generate a compact verb-first summary for a completed step, e.g.:
 *   "Read 3 files · Ran 2 commands · Edited 1 file"
 *   "Read 1 file · Searched 2 sites"
 */
function stepSummary(step: StepData): string {
  const tools = step.tools;
  if (tools.length === 0 && step.bashOutputs.length === 0) {
    if (step.textParts.length > 0) return "Thinking…";
    return "Working";
  }

  const counts = new Map<string, number>();
  for (const agg of tools) {
    const name = aggregationToolName(agg);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const parts: string[] = [];
  const testStatus = commandStatus(step, isTestCommand);
  if (testStatus === "success") parts.push("Tests passed");
  else if (testStatus === "error") parts.push("Tests failed");

  const buildStatus = commandStatus(step, isBuildCommand);
  if (buildStatus === "success") parts.push("Build passed");
  else if (buildStatus === "error") parts.push("Build failed");

  const readCount = counts.get("read") ?? 0;
  if (readCount > 0) parts.push(`Read ${String(readCount)} file${readCount === 1 ? "" : "s"}`);

  const skillCount = counts.get("load_skill") ?? 0;
  if (skillCount > 0) parts.push(`Loaded ${String(skillCount)} skill${skillCount === 1 ? "" : "s"}`);

  const editCount = (counts.get("edit") ?? 0) + (counts.get("write") ?? 0);
  if (editCount > 0) parts.push(`Edited ${String(editCount)} file${editCount === 1 ? "" : "s"}`);

  const bashCount = Math.max(0, (counts.get("bash") ?? 0) + step.bashOutputs.length - (testStatus === undefined ? 0 : 1) - (buildStatus === undefined ? 0 : 1));
  if (bashCount > 0) parts.push(`Ran ${String(bashCount)} command${bashCount === 1 ? "" : "s"}`);

  const searchCount = (counts.get("web_search") ?? 0) + (counts.get("fetch_content") ?? 0) + (counts.get("search_query") ?? 0);
  if (searchCount > 0) parts.push(`Searched ${String(searchCount)} site${searchCount === 1 ? "" : "s"}`);

  const globCount = (counts.get("glob") ?? 0) + (counts.get("grep") ?? 0) + (counts.get("rg") ?? 0);
  if (globCount > 0) parts.push(`Searched ${String(globCount)} pattern${globCount === 1 ? "" : "s"}`);

  const inputRequestCount = tools.filter((agg) => isUserInputToolName(aggregationToolName(agg)) || isUserInputRequestArgs(toolArgs(agg))).length;
  if (inputRequestCount > 0) parts.push(`Requested ${String(inputRequestCount)} input${inputRequestCount === 1 ? "" : "s"}`);

  const known = new Set(["read", "load_skill", "edit", "write", "bash", "web_search", "fetch_content", "search_query", "glob", "grep", "rg"]);
  const otherCount = tools
    .filter((agg) => {
      const name = aggregationToolName(agg);
      return !known.has(name) && !isUserInputToolName(name) && !isUserInputRequestArgs(toolArgs(agg));
    })
    .length;
  if (otherCount > 0) parts.push(`${String(otherCount)} other tool${otherCount === 1 ? "" : "s"}`);

  return parts.length > 0 ? parts.join(" · ") : `${String(tools.length)} tool${tools.length === 1 ? "" : "s"}`;
}

function commandStatus(step: StepData, predicate: (command: string) => boolean): "success" | "error" | undefined {
  for (const agg of step.tools) {
    const command = stringArg(toolArgs(agg), "command");
    if (command === undefined || !predicate(command)) continue;
    const status = toolAggStatus(agg);
    if (status === "error") return "error";
    if (status === "success") return "success";
  }
  for (const output of step.bashOutputs) {
    const command = shellCommandFromText(output);
    if (command === undefined || !predicate(command)) continue;
    if (/\nexit\s+0(?:\n|$)/u.test(output)) return "success";
    if (/\nexit\s+\d+(?:\n|$)/u.test(output)) return "error";
  }
  return undefined;
}

function shellCommandFromText(text: string): string | undefined {
  const line = text.split("\n").find((candidate) => candidate.startsWith("$ "));
  const command = line?.slice(2).trim();
  return command === undefined || command === "" ? undefined : command;
}

function isTestCommand(command: string): boolean {
  return /\b(test|vitest|jest|playwright|pytest)\b|cargo\s+test|go\s+test|npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test/u.test(command);
}

function isBuildCommand(command: string): boolean {
  return /\b(build|typecheck|lint)\b|npm\s+run\s+(build|typecheck|lint)|pnpm\s+(build|typecheck|lint)/u.test(command);
}

function isUserInputToolName(name: string): boolean {
  return name === "request_user_input" || name.endsWith(".request_user_input");
}

function isUserInputRequestArgs(args: Record<string, unknown> | undefined): boolean {
  if (args === undefined) return false;
  const questions = args["questions"];
  return Array.isArray(questions) && questions.some((question) => isRecord(question) && typeof question["question"] === "string");
}
