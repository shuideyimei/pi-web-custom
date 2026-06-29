import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ToolAggregation } from "./timelineAdapter";
import type { ToolExecutionPart } from "./shared";
import "./SubagentToolDetails";

const MAX_COLLAPSED_RESULT_LINES = 8;
const MAX_COLLAPSED_DIFF_LINES = 180;

/**
 * ToolCallNode — de-cardified tool call display for the Timeline Execution Stream.
 *
 * Collapsed (default):
 *   ● read_file · src/components/Text.tsx · done
 *
 * Expanded (click the row):
 *   Black-hole solid-core panel with args, result, diff.
 *
 * No glass card, no backdrop-filter, no large border. Just a flat
 * one-liner that expands into a solid-core panel.
 */
@customElement("tool-call-node")
export class ToolCallNode extends LitElement {
  @property({ attribute: false }) aggregation: ToolAggregation | undefined;
  @state() private expanded = false;
  @state() private showFullDiff = false;
  @state() private showFullResult = false;
  @state() private copied = false;
  @state() private diffOpen = false;
  private userToggled = false;

  override render() {
    const agg = this.aggregation;
    if (agg === undefined) return null;

    const execution = agg.execution;
    const toolCall = agg.toolCall;
    const result = agg.result;

    // Derive display values — prefer execution, fall back to toolCall/result
    const toolName = execution?.toolName ?? toolCall?.toolName ?? result?.toolName ?? "tool";
    const status: ToolExecutionPart["status"] = execution?.status ?? (result?.isError === true ? "error" : result !== undefined ? "success" : "pending");
    const args = execution?.args ?? toolCall?.args;
    const command = toolName === "bash" ? commandFromArgs(args) : undefined;
    const summary = command ?? execution?.summary ?? toolCall?.summary ?? "";
    const filePath = pathFromArgs(args);
    const actualDiff = execution === undefined ? undefined : diffFromDetails(execution.details);
    const preview = execution?.preview;
    const visibleDiff = actualDiff ?? preview?.diff;
    const diffStats = visibleDiff === undefined ? undefined : countDiffLines(visibleDiff);
    const previewMismatch = actualDiff !== undefined && preview?.diff !== undefined && actualDiff !== preview.diff;
    const resultText = execution?.resultText ?? result?.text;
    const errorText = preview?.error;
    const bodyText = visibleDiff === undefined ? resultText : undefined;
    const effectiveOpen = this.userToggled ? this.expanded : false;

    return html`
      <div class=${`tcn ${status}${effectiveOpen ? " expanded" : ""}`}>
        <div class="tcn-summary" role="button" tabindex="0" aria-expanded=${String(effectiveOpen)}
          @click=${() => { this.toggle(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } }}>
          <strong class="tcn-name">${toolName}</strong>
          <span class="tcn-sep">·</span>
          ${filePath !== undefined
            ? html`<span class="tcn-path">${filePath}</span>`
            : summary !== ""
              ? html`<span class="tcn-desc">${summary}</span>`
              : null}
          ${diffStats !== undefined ? html`<span class="tcn-diff-stats"><b class="added">+${diffStats.added}</b><span class="sep">/</span><b class="removed">-${diffStats.removed}</b></span>` : null}
          ${editCountLabel(execution) !== undefined ? html`<span class="tcn-edit-count">${editCountLabel(execution)}</span>` : null}
        </div>
        ${effectiveOpen ? html`
          <div class="tcn-body">
            ${previewMismatch ? html`<p class="tcn-notice">Applied diff differs from the preview.</p>` : null}
            ${errorText === undefined || errorText === "" ? null : html`
              <div class="tcn-error">
                <pre class="tcn-error-text">${errorText}</pre>
                ${this.renderErrorSuggestion(toolName, status)}
              </div>
            `}
            ${this.renderToolDetails(toolName, args, status, visibleDiff, actualDiff === undefined ? "Preview diff" : "Applied diff", bodyText)}
            ${toolName !== "bash" && toolName !== "edit" && toolName !== "write" && visibleDiff === undefined && (bodyText === undefined || bodyText === "")
              ? html`<p class="tcn-muted">${summary}</p>` : null}
          </div>
        ` : null}
      </div>
    `;
  }

  private toggle() {
    this.userToggled = true;
    this.expanded = !this.expanded;
  }

  private renderToolDetails(
    toolName: string,
    args: unknown,
    status: string,
    visibleDiff: string | undefined,
    diffLabel: string,
    bodyText: string | undefined,
  ) {
    if (toolName === "subagent") return this.renderSubagentDetails(args, bodyText, this.aggregation?.execution?.details ?? this.aggregation?.result?.details);
    if (toolName === "bash") return this.renderBashCommand(args, bodyText);
    if (toolName === "read") return this.renderReadDetails(args, bodyText);
    if (toolName === "edit" || toolName === "write") return this.renderFileChangeDetails(toolName, args, visibleDiff, diffLabel, bodyText);
    if (visibleDiff !== undefined) return this.renderDiffBody(visibleDiff, diffLabel);
    return this.renderGenericToolDetails(args, bodyText);
  }

  private renderSubagentDetails(args: unknown, output: string | undefined, details: unknown) {
    return html`<subagent-tool-details .args=${args} .details=${details} .resultText=${output ?? ""} .status=${this.aggregation?.execution?.status ?? "pending"}></subagent-tool-details>`;
  }

  private renderBashCommand(args: unknown, output: string | undefined) {
    const command = commandFromArgs(args);
    if (command === undefined || command === "") return null;
    const hasOutput = output !== undefined && output !== "";
    const lines = hasOutput ? output.split("\n") : [];
    const truncated = lines.length > MAX_COLLAPSED_RESULT_LINES && !this.showFullResult;
    const visible = truncated ? lines.slice(0, MAX_COLLAPSED_RESULT_LINES).join("\n") : output;
    return html`
      <div class="tcn-command" aria-label="Command and output">
        <div class="tcn-command-line">
          <span class="tcn-command-prompt">$</span>
          <code>${command}</code>
        </div>
        ${hasOutput ? html`
          <pre class="tcn-command-output">${visible}${truncated
            ? html`<span class="tcn-truncation"> ${String(lines.length - MAX_COLLAPSED_RESULT_LINES)} more lines</span>`
            : ""}</pre>
          ${truncated
            ? html`<button class="tcn-btn" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullResult = true; }}>Show all ${String(lines.length)} lines</button>`
            : null}
        ` : null}
      </div>
    `;
  }

  private renderReadDetails(args: unknown, output: string | undefined) {
    const filePath = pathFromArgs(args);
    if (filePath === undefined) return this.renderInlineOutput(output);
    const range = readRangeLabel(args);
    return html`
      <div class="tcn-file-block">
        <div class="tcn-file-change">
          <span class="tcn-file-action">read</span>
          <span class="tcn-file-path">${filePath}</span>
          ${range === undefined ? null : html`<span class="tcn-file-range">${range}</span>`}
        </div>
        ${this.renderInlineOutput(output)}
      </div>
    `;
  }

  private renderFileChangeDetails(toolName: string, args: unknown, visibleDiff: string | undefined, diffLabel: string, output: string | undefined) {
    const filePath = pathFromArgs(args);
    const writeContent = toolName === "write" ? newTextFromArgs(args) : undefined;
    return html`
      ${filePath !== undefined ? html`
        <div class="tcn-file-change">
          <span class="tcn-file-action">${toolName === "write" ? "write" : "edit"}</span>
          <span class="tcn-file-path">${filePath}</span>
        </div>
      ` : null}
      ${visibleDiff !== undefined
        ? this.renderDiffBody(visibleDiff, diffLabel, true)
        : writeContent !== undefined
          ? this.renderWritePreview(writeContent)
          : args !== undefined
            ? this.renderArgsSection(args)
            : null}
      ${visibleDiff === undefined ? this.renderInlineOutput(output) : null}
    `;
  }

  private renderWritePreview(text: string) {
    const lines = text.split("\n");
    const truncated = lines.length > MAX_COLLAPSED_RESULT_LINES && !this.showFullResult;
    const visible = truncated ? lines.slice(0, MAX_COLLAPSED_RESULT_LINES).join("\n") : text;
    return html`
      <div class="tcn-write-preview">
        <div class="tcn-section-label">Content <small>${String(lines.length)} ${lines.length === 1 ? "line" : "lines"}</small></div>
        <pre class="tcn-pre">${visible}${truncated
          ? html`<span class="tcn-truncation"> ${String(lines.length - MAX_COLLAPSED_RESULT_LINES)} more lines</span>`
          : ""}</pre>
        ${truncated
          ? html`<button class="tcn-btn" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullResult = true; }}>Show all ${String(lines.length)} lines</button>`
          : null}
      </div>
    `;
  }

  private renderArgsSection(args: unknown) {
    const displayArgs = this.sanitizeArgs(args);
    const text = typeof displayArgs === "string" ? displayArgs : JSON.stringify(displayArgs, null, 2);
    if (text === "{}" || text === "") return null;
    const lines = text.split("\n");
    const truncated = lines.length > MAX_COLLAPSED_RESULT_LINES && !this.showFullResult;
    const visible = truncated ? lines.slice(0, MAX_COLLAPSED_RESULT_LINES).join("\n") : text;
    return html`
      <details class="tcn-args">
        <summary>Parameters</summary>
        <pre class="tcn-pre">${visible}${truncated
          ? html`<span class="tcn-truncation"> ${String(lines.length - MAX_COLLAPSED_RESULT_LINES)} more lines</span>`
          : ""}</pre>
      </details>
    `;
  }

  private renderGenericToolDetails(args: unknown, output: string | undefined) {
    const parameters = args === undefined ? null : this.renderArgsSection(args);
    const inlineOutput = this.renderInlineOutput(output);
    if (parameters === null && inlineOutput === null) return null;
    return html`
      <div class="tcn-tool-detail">
        ${parameters}
        ${inlineOutput}
      </div>
    `;
  }

  private renderInlineOutput(text: string | undefined) {
    if (text === undefined || text === "") return null;
    const lines = text.split("\n");
    const truncated = lines.length > MAX_COLLAPSED_RESULT_LINES && !this.showFullResult;
    const visible = truncated ? lines.slice(0, MAX_COLLAPSED_RESULT_LINES).join("\n") : text;
    return html`
      <pre class="tcn-inline-output">${visible}${truncated
        ? html`<span class="tcn-truncation"> ${String(lines.length - MAX_COLLAPSED_RESULT_LINES)} more lines</span>`
        : ""}</pre>
      ${truncated
        ? html`<button class="tcn-btn" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullResult = true; }}>Show all ${String(lines.length)} lines</button>`
        : null}
    `;
  }

  private renderDiffBody(diff: string, label: string, openByDefault = false) {
    const lines = diff.split("\n");
    const truncated = !this.showFullDiff && lines.length > MAX_COLLAPSED_DIFF_LINES;
    const visibleLines = truncated ? lines.slice(0, MAX_COLLAPSED_DIFF_LINES) : lines;
    const open = openByDefault || this.diffOpen;
    return html`
      <details class="tcn-diff" ?open=${open} @toggle=${(event: Event) => { const d = event.currentTarget; if (d instanceof HTMLDetailsElement) this.diffOpen = d.open; }}>
        <summary>
          <span>${label}</span>
          <small>${String(lines.length)} ${lines.length === 1 ? "line" : "lines"}</small>
        </summary>
        <div class="tcn-diff-toolbar">
          <span>${truncated ? `Showing ${String(visibleLines.length)} of ${String(lines.length)} lines` : "Full diff"}</span>
          <button type="button" @click=${(e: Event) => { e.stopPropagation(); void this.copyDiff(diff); }}>${this.copied ? "Copied" : "Copy diff"}</button>
        </div>
        <pre class="tcn-diff-block" aria-label=${label}><code class="tcn-diff-content">${visibleLines.map((line) => html`<span class=${diffLineClass(line)}>${line}</span>`)}</code></pre>
        ${truncated ? html`
          <button class="tcn-btn" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullDiff = true; }}>
            Show all ${String(lines.length)} diff lines
          </button>
        ` : null}
      </details>
    `;
  }

  private renderErrorSuggestion(toolName: string, status: string) {
    if (status !== "error") return null;
    if (toolName === "bash") return html`<p class="tcn-suggestion">Check the command syntax and ensure all required tools are installed.</p>`;
    if (toolName === "edit") return html`<p class="tcn-suggestion">The old text may have been modified by a previous edit. Try re-reading the file first.</p>`;
    if (toolName === "read" || toolName === "write") return html`<p class="tcn-suggestion">Verify the file path exists and is accessible.</p>`;
    return null;
  }

  private sanitizeArgs(args: unknown): unknown {
    if (typeof args === "string") return args;
    if (args === null || args === undefined) return "";
    if (typeof args !== "object") return JSON.stringify(args);
    const entries = Object.entries(args);
    const clone: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (typeof value === "string" && value.length > 500) {
        clone[key] = value.slice(0, 200) + "... (" + String(value.length) + " chars total)";
      } else {
        clone[key] = value;
      }
    }
    return clone;
  }

  private async copyDiff(diff: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(diff);
      this.copied = true;
      window.setTimeout(() => { this.copied = false; }, 1200);
    } catch {
      this.copied = false;
    }
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; color: var(--pi-text); }

    /* ── Root: no card, no border, no backdrop-filter ── */
    .tcn { display: grid; gap: 0; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
    .tcn.expanded { gap: 6px; }

    /* ── One-liner summary ── */
    .tcn-summary {
      display: flex; align-items: baseline; gap: 6px; min-width: 0;
      position: relative;
      overflow: hidden;
      cursor: pointer; user-select: none;
      padding: 1px 0;
      font-size: 13px;
      line-height: 1.4;
      transition: background .15s ease, opacity .15s ease, filter .15s ease;
      border-radius: 4px;
    }
    .tcn.pending .tcn-summary,
    .tcn.running .tcn-summary {
      opacity: .72;
      filter: saturate(.9);
    }
    .tcn.pending .tcn-summary::after,
    .tcn.running .tcn-summary::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--pi-running, #8bb2ff) 16%, transparent) 48%, transparent 100%);
      transform: translateX(-105%);
      animation: tcn-row-scan 1.45s ease-in-out infinite;
    }
    .tcn.success .tcn-summary,
    .tcn.error .tcn-summary {
      opacity: 1;
      filter: none;
    }
    @keyframes tcn-row-scan {
      0% { transform: translateX(-105%); }
      100% { transform: translateX(105%); }
    }
    .tcn-summary:hover { background: rgba(255, 255, 255, 0.03); }
    .tcn-summary:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; border-radius: 4px; }

    .tcn-name {
      color: var(--pi-dim);
      font-size: 13px;
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-sep { color: var(--pi-border-muted); flex: 0 0 auto; }
    .tcn-path {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--pi-dim);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-desc {
      min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--pi-dim);
      font-size: 13px;
    }
    .tcn-diff-stats { display: inline-flex; gap: 2px; font-size: 12px; }
    .added { color: color-mix(in srgb, #7fd1a0 50%, var(--pi-muted)); }
    .removed { color: color-mix(in srgb, #f87b7b 50%, var(--pi-muted)); }
    .sep { opacity: .4; }
    .tcn-edit-count { color: var(--pi-dim); font-size: 12px; }

    /* ── Body: black-hole solid core ── */
    .tcn-body {
      display: grid; gap: 4px;
      background: transparent;
      border-radius: 12px;
      padding: 6px 10px;
    }
    .tcn.error .tcn-body {
    }

    .tcn-notice { margin: 0; color: var(--pi-warning); font-size: 13px; }
    .tcn-muted { margin: 0; color: var(--pi-muted); font-size: 13px; }

    /* ── Error ── */
    .tcn-error { display: grid; gap: 4px; }
    .tcn-error-text {
      margin: 0; border-radius: 6px;
      background: transparent; color: #f87b7b; padding: 8px;
      white-space: pre-wrap; overflow-wrap: anywhere;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-suggestion { margin: 0; color: var(--pi-text-secondary); font-size: 12px; font-style: italic; }

    /* ── Tool-specific details ── */
    .tcn-command {
      display: grid;
      gap: 6px;
      border-radius: 8px;
      background: rgba(255,255,255,0.03);
      padding: 7px 9px;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-command-line { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; }
    .tcn-command-prompt { color: var(--pi-dim); user-select: none; }
    .tcn-command code { min-width: 0; color: var(--pi-dim); white-space: pre-wrap; overflow-wrap: anywhere; }
    .tcn-command-output { margin: 0; padding-left: 17px; border-left: 1px solid var(--pi-border-muted); color: var(--pi-text); white-space: pre-wrap; overflow-wrap: anywhere; }
    .tcn-inline-output { margin: 0; padding-left: 10px; border-left: 1px solid var(--pi-border-muted); color: var(--pi-text); white-space: pre-wrap; overflow-wrap: anywhere; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .tcn-file-block, .tcn-tool-detail { display: grid; gap: 6px; }
    .tcn-file-change {
      display: inline-flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
      color: var(--pi-muted);
      font-size: 12px;
    }
    .tcn-file-action {
      flex: 0 0 auto;
      color: var(--pi-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .tcn-file-path {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--pi-dim);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-file-range {
      flex: 0 0 auto;
      color: var(--pi-dim);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-write-preview { display: grid; gap: 6px; border-top: 1px solid var(--pi-border-muted); padding-top: 6px; }
    .tcn-section-label { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: var(--pi-muted); font-size: 12px; }
    .tcn-section-label small { color: var(--pi-dim); }

    /* ── Args / Result / Diff ── */
    .tcn-args, .tcn-result, .tcn-diff { border-top: 1px solid var(--pi-border-muted); padding-top: 6px; }
    .tcn-args > summary, .tcn-result > summary, .tcn-diff > summary {
      font-size: 12px; color: var(--pi-muted); cursor: pointer;
    }
    .tcn-result > summary, .tcn-diff > summary {
      display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0;
    }
    .tcn-result > summary small, .tcn-diff > summary small { flex: 0 0 auto; color: var(--pi-dim); }
    .tcn-diff > summary span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .tcn-pre {
      margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--pi-text); max-height: 200px; overflow-y: auto;
    }
    .tcn-truncation { color: var(--pi-muted); font-style: italic; }

    .tcn-diff-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      min-width: 0; margin-top: 6px; color: var(--pi-muted); font-size: 12px;
    }
    .tcn-diff-toolbar span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .tcn-btn {
      border: 1px solid var(--pi-border-muted); border-radius: 6px;
      background: var(--pi-glass-bg); color: var(--pi-text); padding: 3px 7px;
      font: 12px system-ui, sans-serif; cursor: pointer;
      transition: all .2s cubic-bezier(.4,0,.2,1);
    }
    .tcn-btn:hover, .tcn-btn:focus { background: var(--pi-surface-hover); border-color: var(--pi-border); }

    /* ── Diff block (solid core) ── */
    .tcn-diff-block {
      box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; margin: 0;
      overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain;
      border: 1px solid var(--pi-border-muted); border-radius: 7px;
      background: transparent;
      padding: 8px 0;
      color: var(--pi-muted);
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.45;
    }
    .tcn-diff-content { display: block; width: max-content; min-width: 100%; }
    .tcn-diff-block span { display: block; min-height: 1.45em; padding: 0 8px; white-space: pre; }
    .tcn-diff-block .context { color: var(--pi-muted); }
    .tcn-diff-block .hunk { color: var(--pi-accent-ref); background: var(--pi-accent-ref-bg); }
    .tcn-diff-block .file { color: var(--pi-dim); }
    .tcn-diff-block .meta { color: var(--pi-dim); }
    .tcn-diff-block .added { background: rgba(127, 209, 160, .06); }
    .tcn-diff-block .removed { background: rgba(248, 123, 123, .06); }
  `;
}

// ─── Utility functions (same logic as ToolCallCard, kept local) ──────

function pathFromArgs(args: unknown): string | undefined {
  return getString(args, "path") ?? getString(args, "file_path");
}

function commandFromArgs(args: unknown): string | undefined {
  return getString(args, "command") ?? getString(args, "cmd");
}

function newTextFromArgs(args: unknown): string | undefined {
  return getString(args, "content") ?? getString(args, "text") ?? getString(args, "newText");
}

function readRangeLabel(args: unknown): string | undefined {
  const offset = getNumber(args, "offset");
  const limit = getNumber(args, "limit");
  if (offset === undefined && limit === undefined) return undefined;
  if (offset !== undefined && limit !== undefined) return `lines ${String(offset)}-${String(offset + limit - 1)}`;
  if (offset !== undefined) return `from line ${String(offset)}`;
  return `first ${String(limit)} lines`;
}

function editCountLabel(execution: ToolExecutionPart | undefined): string | undefined {
  if (execution?.toolName !== "edit") return undefined;
  const edits = getProperty(execution.args, "edits");
  if (Array.isArray(edits)) return `${String(edits.length)} edit${edits.length === 1 ? "" : "s"}`;
  if (typeof getProperty(execution.args, "oldText") === "string" && typeof getProperty(execution.args, "newText") === "string") return "1 edit";
  return undefined;
}

function diffFromDetails(details: unknown): string | undefined {
  return getString(details, "diff");
}

function countDiffLines(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (isAddedDiffLine(line)) added++;
    else if (isRemovedDiffLine(line)) removed++;
  }
  return { added, removed };
}

function diffLineClass(line: string): string {
  if (isAddedDiffLine(line)) return "added";
  if (isRemovedDiffLine(line)) return "removed";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "file";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  return "context";
}

function isAddedDiffLine(line: string): boolean {
  return line.startsWith("+") && !line.startsWith("+++");
}

function isRemovedDiffLine(line: string): boolean {
  return line.startsWith("-") && !line.startsWith("---");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function getString(value: unknown, key: string): string | undefined {
  const property = getProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function getNumber(value: unknown, key: string): number | undefined {
  const property = getProperty(value, key);
  return typeof property === "number" ? property : undefined;
}
