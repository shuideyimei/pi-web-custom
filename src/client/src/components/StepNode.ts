import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { StepData, ToolAggregation } from "./timelineAdapter";
import "./ToolCallNode";

/**
 * StepNode — Codex-style compact step indicator.
 *
 * Groups a thinking phase + its tool calls into a single collapsible row.
 * Also handles tool-only groups (no thinking) from the adapter.
 *
 * Collapsed (default):
 *   ● Thinking… ────────── ▸    (while thinking, shimmer sweep)
 *   ● Working… ─────────── ▸    (while tools running, shimmer sweep)
 *   ● Read 3 files · Ran 2 ▸    (after tools complete, compact summary)
 *
 * Expanded (click):
 *   Shows individual tool-call-node entries for each tool in the step.
 *
 * Thinking content is never shown (Codex design: thinking is private).
 */
const STATUS_PHRASES = [
  "Thinking…",
  "Analyzing request…",
  "Inspecting project…",
  "Reasoning…",
  "Planning…",
] as const;

@customElement("step-node")
export class StepNode extends LitElement {
  @property({ attribute: false }) step: StepData | undefined;
  @property({ type: Boolean }) streaming = false;
  @property({ type: Boolean }) summaryReady = true;
  @state() private expanded = false;
  @state() private userToggled = false;
  @state() private phraseIndex = 0;
  private phraseTimer: number | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.streaming) this.startPhraseCycle();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopPhraseCycle();
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("streaming")) {
      if (this.streaming) this.startPhraseCycle();
      else this.stopPhraseCycle();
    }
  }

  private startPhraseCycle(): void {
    this.stopPhraseCycle();
    this.phraseTimer = window.setInterval(() => {
      this.phraseIndex = (this.phraseIndex + 1) % STATUS_PHRASES.length;
    }, 3000);
  }

  private stopPhraseCycle(): void {
    if (this.phraseTimer !== undefined) {
      window.clearInterval(this.phraseTimer);
      this.phraseTimer = undefined;
    }
    this.phraseIndex = 0;
  }

  override render() {
    const step = this.step;
    if (step === undefined) return null;

    const hasThinking = step.thinking !== undefined;
    const isThinkingOnly = hasThinking && step.tools.length === 0 && step.textParts.length === 0;
    const hasText = step.textParts.length > 0;
    const hasErrors = step.tools.some((agg) => toolAggStatus(agg) === "error");
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

    // Determine active label. While waiting for the next assistant text, keep the
    // activity row visible but don't switch to the completed summary yet.
    const activeTool = currentRunningTool(step) ?? latestTool(step);
    const label = activeTool !== undefined
      ? runningToolLabel(activeTool)
      : STATUS_PHRASES[this.phraseIndex % STATUS_PHRASES.length] ?? STATUS_PHRASES[0];

    return html`
      <div class="step${effectiveOpen ? " expanded" : ""}${isActive ? " animating" : ""}${hasErrors ? " has-errors" : ""}${step.tools.length === 0 ? " empty" : ""}">
        <div
          class="step-header"
          role="button"
          tabindex="0"
          aria-expanded=${String(effectiveOpen)}
          @click=${() => { this.toggle(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } }}
        >
          ${isActive
            ? html`<span class="step-label shimmer-text" title=${label} aria-hidden="true">${label}</span>`
            : html`<span class="step-label">${summary}</span>`
          }
          ${isActive
            ? html`<span class="step-scan" aria-hidden="true"></span>`
            : null
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
              <tool-call-node class="step-tool" .aggregation=${agg}></tool-call-node>
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

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }

    .step {
      display: grid;
      gap: 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .step.expanded { gap: 4px; }

    /* ── Single-line header ── */
    .step-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 2px 0;
      cursor: pointer;
      user-select: none;
      border-radius: 4px;
      transition: background .15s ease;
    }
    .step-header:hover { background: rgba(255, 255, 255, 0.03); }
    .step-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; border-radius: 4px; }

    /* ── Step label ── */
    .step-label {
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--pi-muted);
      font-size: 12px;
      font-weight: 500;
      letter-spacing: .02em;
    }

    /* ── Shimmer text: Codex-style character sweep ── */
    .shimmer-text {
      font-weight: 600;
      letter-spacing: .02em;
      color: var(--pi-dim);
      background: linear-gradient(
        90deg,
        var(--pi-dim) 0%,
        var(--pi-text-secondary) 40%,
        var(--pi-dim) 60%,
        var(--pi-dim) 100%
      );
      background-size: 250% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      animation: shimmer-sweep 2s ease-in-out infinite;
    }
    @keyframes shimmer-sweep {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    /* ── Scanning shimmer bar ── */
    .step-scan {
      flex: 1 1 auto;
      position: relative;
      height: 2px;
      min-width: 30px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--pi-border-muted) 30%, transparent);
      overflow: hidden;
    }
    .step-scan::after {
      content: "";
      position: absolute;
      top: 0;
      left: -30%;
      width: 30%;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--pi-accent) 50%, transparent), transparent);
      animation: step-scan 1.8s ease-in-out infinite;
    }
    @keyframes step-scan {
      0% { left: -30%; }
      100% { left: 100%; }
    }

    .step-chevron {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--pi-muted);
      opacity: .5;
    }

    /* ── Expanded body ── */
    .step-body {
      display: grid;
      gap: 2px;
      padding-left: 4px;
      border-left: 1px solid var(--pi-border-muted);
      margin-left: 4px;
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
      padding: 4px 8px;
      border-radius: 6px;
      background: rgba(255,255,255,0.02);
    }

    /* ── Error state ── */
    .step.has-errors .step-label {
      color: color-mix(in srgb, #f87b7b 50%, var(--pi-muted));
    }
  `;
}

// ─── Utility functions ────────────────────────────────────────────────

function toolAggStatus(agg: ToolAggregation): string {
  if (agg.execution !== undefined) return agg.execution.status;
  if (agg.result !== undefined) return agg.result.isError ? "error" : "success";
  if (agg.toolCall !== undefined) return "pending";
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
  const name = agg.toolCall?.toolName ?? agg.execution?.toolName ?? agg.result?.toolName ?? "tool";
  const detail = toolCallDetail(name, toolArgs(agg), agg.execution?.summary ?? agg.toolCall?.summary);
  return `${name}${detail === "" ? "" : ` ${detail}`}`.replace(/\s+/g, " ").trim();
}

function toolArgs(agg: ToolAggregation): Record<string, unknown> | undefined {
  const args = agg.toolCall?.args ?? agg.execution?.args;
  return isRecord(args) ? args : undefined;
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

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
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
    const name = agg.execution?.toolName ?? agg.toolCall?.toolName ?? agg.result?.toolName ?? "tool";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const parts: string[] = [];

  const readCount = counts.get("read") ?? 0;
  if (readCount > 0) parts.push(`Read ${String(readCount)} file${readCount === 1 ? "" : "s"}`);

  const editCount = (counts.get("edit") ?? 0) + (counts.get("write") ?? 0);
  if (editCount > 0) parts.push(`Edited ${String(editCount)} file${editCount === 1 ? "" : "s"}`);

  const bashCount = (counts.get("bash") ?? 0) + step.bashOutputs.length;
  if (bashCount > 0) parts.push(`Ran ${String(bashCount)} command${bashCount === 1 ? "" : "s"}`);

  const searchCount = (counts.get("web_search") ?? 0) + (counts.get("fetch_content") ?? 0);
  if (searchCount > 0) parts.push(`Searched ${String(searchCount)} site${searchCount === 1 ? "" : "s"}`);

  const globCount = (counts.get("glob") ?? 0) + (counts.get("grep") ?? 0);
  if (globCount > 0) parts.push(`Searched ${String(globCount)} pattern${globCount === 1 ? "" : "s"}`);

  const known = new Set(["read", "edit", "write", "bash", "web_search", "fetch_content", "glob", "grep"]);
  const otherCount = [...counts.entries()]
    .filter(([name]) => !known.has(name))
    .reduce((sum, [, count]) => sum + count, 0);
  if (otherCount > 0) parts.push(`${String(otherCount)} other tool${otherCount === 1 ? "" : "s"}`);

  return parts.length > 0 ? parts.join(" · ") : `${String(tools.length)} tool${tools.length === 1 ? "" : "s"}`;
}
