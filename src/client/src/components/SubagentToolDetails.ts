import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  aggregateSubagentStatus,
  isSubagentDetails,
  progressStats,
  resultStatus,
  subagentResultOutput,
  summarizeSubagentArgs,
  summarizeSubagentDetails,
  truncateOneLine,
  type SubagentDetails,
  type SubagentSingleResult,
} from "../../../shared/subagentDisplay";
import "./FormattedText";

const OUTPUT_PREVIEW_LINES = 24;
const OUTPUT_PREVIEW_CHARS = 6000;

@customElement("subagent-tool-details")
export class SubagentToolDetails extends LitElement {
  @property({ attribute: false }) args: unknown;
  @property({ attribute: false }) details: unknown;
  @property() resultText = "";
  @property() status = "pending";
  @state() private showAllOutput = false;

  override render() {
    const details = isSubagentDetails(this.details) ? this.details : undefined;
    if (details !== undefined) return this.renderStructuredDetails(details);

    const summary = summarizeSubagentArgs(this.args);
    return html`
      <section class="subagent-detail fallback">
        ${summary === undefined ? null : html`<div class="subagent-title">${summary}</div>`}
        ${this.resultText.trim() === "" ? html`<p class="muted">No structured subagent details were provided.</p>` : this.renderOutput(this.resultText)}
      </section>
    `;
  }

  private renderStructuredDetails(details: SubagentDetails) {
    const status = aggregateSubagentStatus(details);
    const summary = summarizeSubagentDetails(details);
    return html`
      <section class=${`subagent-detail ${status}`}>
        <div class="subagent-overview">
          <span class=${`status-dot ${status}`} aria-hidden="true"></span>
          <div class="overview-text">
            <strong>${summary}</strong>
            <div class="meta-row">
              ${details.context === undefined ? null : html`<span>${details.context} context</span>`}
              ${details.runId === undefined ? null : html`<span>run ${shortId(details.runId)}</span>`}
              ${details.asyncId === undefined ? null : html`<span>async ${shortId(details.asyncId)}</span>`}
              ${progressStats(details.progressSummary) === "" ? null : html`<span>${progressStats(details.progressSummary)}</span>`}
            </div>
          </div>
        </div>
        ${details.results.length === 0 ? html`<p class="muted">Waiting for subagent results…</p>` : html`
          <div class="result-list">
            ${details.results.map((result, index) => this.renderResult(result, index, details))}
          </div>
        `}
        ${details.artifacts?.dir === undefined ? null : html`<div class="path-row"><span>artifacts</span><code>${details.artifacts.dir}</code></div>`}
        ${details.asyncDir === undefined ? null : html`<div class="path-row"><span>async dir</span><code>${details.asyncDir}</code></div>`}
      </section>
    `;
  }

  private renderResult(result: SubagentSingleResult, index: number, details: SubagentDetails) {
    const status = resultStatus(result);
    const agent = result.agent ?? details.chainAgents?.[index] ?? `subagent-${String(index + 1)}`;
    const progress = result.progress ?? result.progressSummary ?? details.progress?.find((entry) => entry.index === index || entry.agent === result.agent);
    const output = subagentResultOutput(result);
    const task = result.task?.trim();
    const statusText = resultStatusText(result, status);
    return html`
      <article class=${`result ${status}`}>
        <header class="result-header">
          <span class=${`status-dot ${status}`} aria-hidden="true"></span>
          <strong>${agent}</strong>
          <span class="status-label">${statusLabel(status)}</span>
        </header>
        <div class="meta-row result-meta">
          ${result.model === undefined ? null : html`<span>${result.model}</span>`}
          ${progressStats(progress) === "" ? null : html`<span>${progressStats(progress)}</span>`}
          ${result.skills === undefined || result.skills.length === 0 ? null : html`<span>skills: ${result.skills.join(", ")}</span>`}
        </div>
        ${task === undefined || task === "" ? null : html`<p class="task">${truncateOneLine(task, 220)}</p>`}
        ${statusText === undefined ? null : html`<p class=${status === "failed" ? "error-text" : "muted"}>${statusText}</p>`}
        ${result.progress?.currentTool === undefined ? null : html`
          <p class="activity"><span>current</span> ${result.progress.currentTool}${result.progress.currentToolArgs === undefined ? "" : `: ${truncateOneLine(result.progress.currentToolArgs, 160)}`}</p>
        `}
        ${output.trim() === "" ? null : this.renderOutput(output)}
        ${this.renderResultPaths(result)}
      </article>
    `;
  }

  private renderResultPaths(result: SubagentSingleResult) {
    const rows: (readonly [string, string])[] = [];
    if (result.sessionFile !== undefined) rows.push(["session", result.sessionFile]);
    if (result.artifactPaths?.outputPath !== undefined) rows.push(["output", result.artifactPaths.outputPath]);
    if (result.truncation?.artifactPath !== undefined) rows.push(["full output", result.truncation.artifactPath]);
    if (result.outputReference?.path !== undefined) rows.push(["saved output", result.outputReference.path]);
    if (result.savedOutputPath !== undefined) rows.push(["saved output", result.savedOutputPath]);
    if (rows.length === 0) return null;
    return html`<div class="paths">${rows.map(([label, value]) => html`<div class="path-row"><span>${label}</span><code>${value}</code></div>`)}</div>`;
  }

  private renderOutput(output: string) {
    const preview = previewOutput(output, this.showAllOutput);
    return html`
      <div class="output">
        <formatted-text .text=${preview.text}></formatted-text>
        ${preview.truncated ? html`
          <button type="button" @click=${(event: Event) => { event.stopPropagation(); this.showAllOutput = true; }}>
            Show full subagent output
          </button>
        ` : null}
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; min-width: 0; }
    .subagent-detail { display: grid; gap: 10px; min-width: 0; }
    .subagent-overview { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: start; padding: 8px 10px; border: 1px solid var(--pi-border-muted); border-radius: 10px; background: rgba(255,255,255,.03); }
    .overview-text { display: grid; gap: 3px; min-width: 0; }
    .subagent-title { color: var(--pi-text); font-weight: 650; }
    .meta-row { display: flex; flex-wrap: wrap; gap: 4px 10px; min-width: 0; color: var(--pi-muted); font-size: 12px; }
    .meta-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .result-list { display: grid; gap: 9px; }
    .result { display: grid; gap: 6px; min-width: 0; padding: 8px 10px; border-left: 2px solid var(--pi-border-muted); background: rgba(255,255,255,.018); border-radius: 0 10px 10px 0; }
    .result.running { border-left-color: var(--pi-running); }
    .result.completed { border-left-color: var(--pi-success); }
    .result.failed { border-left-color: var(--pi-danger); }
    .result.paused, .result.detached { border-left-color: var(--pi-warning); }
    .result-header { display: flex; align-items: baseline; gap: 7px; min-width: 0; }
    .result-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-text); }
    .status-label { margin-left: auto; flex: 0 0 auto; color: var(--pi-muted); font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; text-transform: uppercase; letter-spacing: .05em; }
    .status-dot { width: 8px; height: 8px; border-radius: 999px; margin-top: .45em; flex: 0 0 auto; background: var(--pi-muted); box-shadow: 0 0 0 3px rgba(255,255,255,.03); }
    .status-dot.running { background: var(--pi-running); }
    .status-dot.completed { background: var(--pi-success); }
    .status-dot.failed { background: var(--pi-danger); }
    .status-dot.paused, .status-dot.detached { background: var(--pi-warning); }
    .status-dot.pending { background: var(--pi-dim); }
    .task { margin: 0; color: var(--pi-text-secondary); font-size: 13px; }
    .muted { margin: 0; color: var(--pi-muted); font-size: 12px; }
    .error-text { margin: 0; color: var(--pi-danger); font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .activity { margin: 0; color: var(--pi-text-secondary); font-size: 12px; }
    .activity span { color: var(--pi-muted); text-transform: uppercase; letter-spacing: .04em; }
    .output { display: grid; gap: 6px; min-width: 0; border-top: 1px solid var(--pi-border-muted); padding-top: 6px; }
    .output formatted-text { font-size: 13px; }
    button { justify-self: start; border: 1px solid var(--pi-border-muted); border-radius: 6px; background: var(--pi-glass-bg); color: var(--pi-text); padding: 3px 7px; font: 12px system-ui, sans-serif; cursor: pointer; }
    button:hover, button:focus { background: var(--pi-surface-hover); border-color: var(--pi-border); }
    .paths { display: grid; gap: 3px; }
    .path-row { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; color: var(--pi-muted); font-size: 12px; }
    .path-row span { text-transform: uppercase; letter-spacing: .04em; color: var(--pi-dim); }
    .path-row code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  `;
}

function resultStatusText(result: SubagentSingleResult, status: string): string | undefined {
  if (result.detached === true) return result.detachedReason === undefined ? "Detached" : `Detached: ${result.detachedReason}`;
  if (result.interrupted === true) return "Paused";
  if (status === "failed") return result.error ?? (typeof result.exitCode === "number" ? `Exited with code ${String(result.exitCode)}` : "Failed");
  if (result.timedOut === true) return "Timed out";
  if (result.outputReference?.message !== undefined) return result.outputReference.message;
  return undefined;
}

function statusLabel(status: string): string {
  if (status === "completed") return "done";
  if (status === "detached") return "detached";
  return status;
}

function previewOutput(output: string, showAll: boolean): { text: string; truncated: boolean } {
  if (showAll) return { text: output, truncated: false };
  const lines = output.split("\n");
  const byLines = lines.length > OUTPUT_PREVIEW_LINES;
  const visibleByLines = byLines ? lines.slice(0, OUTPUT_PREVIEW_LINES).join("\n") : output;
  if (visibleByLines.length > OUTPUT_PREVIEW_CHARS) return { text: `${visibleByLines.slice(0, OUTPUT_PREVIEW_CHARS)}…`, truncated: true };
  return { text: visibleByLines, truncated: byLines };
}

function shortId(id: string): string {
  return id.length <= 10 ? id : id.slice(0, 10);
}
