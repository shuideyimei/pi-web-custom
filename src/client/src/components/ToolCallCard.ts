import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ToolExecutionPart } from "./shared";
import { quantumBeaconStyles } from "./quantumBeacon";

const MAX_COLLAPSED_RESULT_LINES = 8;
const MAX_COLLAPSED_DIFF_LINES = 180;

@customElement("tool-call-card")
export class ToolCallCard extends LitElement {
  @property({ attribute: false }) execution: ToolExecutionPart | undefined;
  @state() private expanded = false;
  @state() private showFullDiff = false;
  @state() private showFullResult = false;
  @state() private copied = false;
  @state() private diffOpen = false;
  private userToggled = false;

  override render() {
    const execution = this.execution;
    if (execution === undefined) return null;

    const filePath = pathFromArgs(execution.args);
    const actualDiff = diffFromDetails(execution.details);
    const preview = execution.preview;
    const visibleDiff = actualDiff ?? preview?.diff;
    const diffStats = visibleDiff === undefined ? undefined : countDiffLines(visibleDiff);
    const previewMismatch = actualDiff !== undefined && preview?.diff !== undefined && actualDiff !== preview.diff;
    const errorText = execution.status === "error" ? execution.resultText : preview?.error;
    const bodyText = visibleDiff === undefined ? execution.resultText : undefined;
    const effectiveOpen = this.userToggled ? this.expanded : false;

    return html`
      <section class=${`tool-card ${execution.status}${effectiveOpen ? " expanded" : ""}`}>
        <div class="tool-header" role="button" tabindex="0" aria-expanded=${String(effectiveOpen)}
          @click=${() => { this.toggle(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } }}>
          <div class="tool-title">

            <strong class="tool-name">${execution.toolName}</strong>
            ${filePath !== undefined ? html`<span class="path">${filePath}</span>` : html`<span class="summary">${execution.summary}</span>`}
          </div>
          <div class="tool-meta">
            ${editCountLabel(execution) === undefined ? null : html`<span class="edit-count">${editCountLabel(execution)}</span>`}
            ${diffStats === undefined ? null : html`<span class="diff-stats"><b class="added">+${diffStats.added}</b><span class="sep">/</span><b class="removed">-${diffStats.removed}</b></span>`}
            <span class="chevron" aria-hidden="true">${effectiveOpen ? "▾" : "▸"}</span>
          </div>
        </div>
        ${effectiveOpen ? html`
          <div class="tool-body">
            ${previewMismatch ? html`<p class="notice">Applied diff differs from the preview.</p>` : null}
            ${errorText === undefined || errorText === "" ? null : html`
              <div class="error-section">
                <pre class="error-text">${errorText}</pre>
                ${this.renderErrorSuggestion(execution)}
              </div>
            `}
            ${this.renderArgsSection(execution)}
            ${visibleDiff === undefined
              ? this.renderTextBody(bodyText)
              : this.renderDiffBody(visibleDiff, actualDiff === undefined ? "Preview diff" : "Applied diff")}
            ${execution.toolName !== "edit" && visibleDiff === undefined && (bodyText === undefined || bodyText === "")
              ? html`<p class="muted">${execution.summary}</p>` : null}
          </div>
        ` : null}
      </section>
    `;
  }

  private toggle() {
    this.userToggled = true;
    this.expanded = !this.expanded;
  }

  private renderArgsSection(execution: ToolExecutionPart) {
    if (execution.args === undefined) return null;
    const displayArgs = this.sanitizeArgs(execution.args);
    const text = typeof displayArgs === "string" ? displayArgs : JSON.stringify(displayArgs, null, 2);
    if (text === "{}" || text === "") return null;
    const lines = text.split("\n");
    const truncated = lines.length > MAX_COLLAPSED_RESULT_LINES && !this.showFullResult;
    const visible = truncated ? lines.slice(0, MAX_COLLAPSED_RESULT_LINES).join("\n") : text;
    return html`
      <details class="args-section">
        <summary>Parameters</summary>
        <pre class="args-text">${visible}${truncated
          ? html`<span class="truncation-hint"> ${String(lines.length - MAX_COLLAPSED_RESULT_LINES)} more lines</span>`
          : ""}</pre>
      </details>
    `;
  }

  private renderTextBody(text: string | undefined) {
    if (text === undefined || text === "") return null;
    const lines = text.split("\n");
    const truncated = lines.length > MAX_COLLAPSED_RESULT_LINES && !this.showFullResult;
    const visible = truncated ? lines.slice(0, MAX_COLLAPSED_RESULT_LINES).join("\n") : text;
    return html`
      <details class="text-body" ?open=${true}>
        <summary>Result <small>${String(lines.length)} ${lines.length === 1 ? "line" : "lines"}</small></summary>
        <pre>${visible}${truncated
          ? html`<span class="truncation-hint"> ${String(lines.length - MAX_COLLAPSED_RESULT_LINES)} more lines</span>`
          : ""}</pre>
        ${truncated
          ? html`<button class="show-more" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullResult = true; }}>Show all ${String(lines.length)} lines</button>`
          : null}
      </details>
    `;
  }

  private renderDiffBody(diff: string, label: string) {
    const lines = diff.split("\n");
    const truncated = !this.showFullDiff && lines.length > MAX_COLLAPSED_DIFF_LINES;
    const visibleLines = truncated ? lines.slice(0, MAX_COLLAPSED_DIFF_LINES) : lines;
    return html`
      <details class="diff-details" ?open=${this.diffOpen} @toggle=${(event: Event) => { this.onDiffToggle(event); }}>
        <summary>
          <span>${label}</span>
          <small>${String(lines.length)} ${lines.length === 1 ? "line" : "lines"}</small>
        </summary>
        <div class="diff-toolbar">
          <span>${truncated ? `Showing ${String(visibleLines.length)} of ${String(lines.length)} lines` : "Full diff"}</span>
          <button type="button" @click=${(e: Event) => { e.stopPropagation(); void this.copyDiff(diff); }}>${this.copied ? "Copied" : "Copy diff"}</button>
        </div>
        <pre class="diff" aria-label=${label}><code class="diff-content">${visibleLines.map((line) => html`<span class=${diffLineClass(line)}>${line}</span>`)}</code></pre>
        ${truncated ? html`
          <button class="show-more" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullDiff = true; }}>
            Show all ${String(lines.length)} diff lines
          </button>
        ` : null}
      </details>
    `;
  }

  private renderErrorSuggestion(execution: ToolExecutionPart) {
    if (execution.status !== "error") return null;
    const toolName = execution.toolName;
    if (toolName === "bash") return html`<p class="error-suggestion">Check the command syntax and ensure all required tools are installed.</p>`;
    if (toolName === "edit") return html`<p class="error-suggestion">The old text may have been modified by a previous edit. Try re-reading the file first.</p>`;
    if (toolName === "read" || toolName === "write") return html`<p class="error-suggestion">Verify the file path exists and is accessible.</p>`;
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

  private onDiffToggle(event: Event): void {
    const details = event.currentTarget;
    if (details instanceof HTMLDetailsElement) this.diffOpen = details.open;
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

  static override styles = [quantumBeaconStyles, css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; color: var(--pi-text); }

    /* ── Glass card with solid core body ── */
    .tool-card {
      display: grid; gap: 0; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box;
      overflow: hidden;
      border: 1px solid var(--pi-border-muted);
      border-radius: 12px;
      background: var(--pi-surface);
      color: var(--pi-text);
      transition: border-color .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1);
    }
    .tool-card.running, .tool-card.pending {
      border-color: color-mix(in srgb, var(--pi-running) 25%, transparent);
      animation: codex-breathe 2s ease-in-out infinite;
    }
    .tool-card.success { border-color: color-mix(in srgb, var(--pi-success) 12%, transparent); }
    .tool-card.error { border-color: color-mix(in srgb, var(--pi-danger) 15%, transparent); }
    .tool-card.expanded { gap: 8px; padding-bottom: 9px; }

    /* ── Header ── */
    .tool-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; position: relative; overflow: hidden; padding: 8px 12px; cursor: pointer; user-select: none; transition: background .2s cubic-bezier(.4,0,.2,1), opacity .15s ease, filter .15s ease; }
    .tool-card.pending .tool-header,
    .tool-card.running .tool-header { opacity: .72; filter: saturate(.9); }
    .tool-card.pending .tool-header::after,
    .tool-card.running .tool-header::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--pi-running) 14%, transparent) 48%, transparent 100%);
      transform: translateX(-105%);
      animation: tool-header-scan 1.45s ease-in-out infinite;
    }
    .tool-card.success .tool-header,
    .tool-card.error .tool-header { opacity: 1; filter: none; }
    @keyframes tool-header-scan {
      0% { transform: translateX(-105%); }
      100% { transform: translateX(105%); }
    }
    .tool-header:hover { background: var(--pi-hover-overlay); }
    .tool-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: -2px; border-radius: 6px; }

    /* ── Status icon: Quantum Beacon ── */

    .tool-title { display: inline-flex; align-items: center; gap: 7px; min-width: 0; flex: 1 1 auto; }
    strong.tool-name { color: var(--pi-dim); font-size: 13px; font-weight: 600; }
    .path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-dim); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .path:hover { background: var(--pi-accent-ref-bg); border-radius: 2px; }
    .summary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-dim); font-size: 13px; }

    /* ── Meta ── */
    .tool-meta { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; color: var(--pi-dim); font-size: 12px; }
    .diff-stats { display: inline-flex; gap: 2px; }
    .added, .diff .added { color: color-mix(in srgb, var(--pi-success) 50%, var(--pi-muted)); }
    .removed, .diff .removed { color: color-mix(in srgb, var(--pi-danger) 50%, var(--pi-muted)); }
    .sep { opacity: .4; }
    .edit-count { color: var(--pi-dim); }
    .chevron { font-size: 11px; opacity: .5; }

    /* ── Body (solid core, no backdrop-filter) ── */
    .tool-body { padding: 0 10px; display: grid; gap: 8px; }
    .notice { margin: 0; color: var(--pi-warning); font-size: 13px; }
    .muted { margin: 0; color: var(--pi-muted); font-size: 13px; }

    /* ── Error section ── */
    .error-section { display: grid; gap: 4px; }
    .error-text { margin: 0; border: 1px solid color-mix(in srgb, var(--pi-danger) 25%, transparent); border-radius: 7px; background: transparent; color: var(--pi-danger); padding: 8px; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .error-suggestion { margin: 0; color: var(--pi-text-secondary); font-size: 12px; font-style: italic; }

    /* ── Args section ── */
    .args-section { border-top: 1px solid var(--pi-hover-overlay); padding-top: 6px; }
    .args-section > summary { font-size: 12px; color: var(--pi-muted); cursor: pointer; }
    .args-text { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--pi-text); max-height: 200px; overflow-y: auto; background: transparent; border-radius: 6px; padding: 6px 8px; }

    /* ── Text body ── */
    .text-body { border-top: 1px solid var(--pi-hover-overlay); padding-top: 6px; }
    .text-body > summary { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; color: var(--pi-muted); cursor: pointer; font-size: 12px; }
    .text-body > summary small { flex: 0 0 auto; color: var(--pi-dim); }
    .text-body pre { margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--pi-text); }
    .truncation-hint { color: var(--pi-muted); font-style: italic; }

    /* ── Diff details (solid core) ── */
    .diff-details { min-width: 0; max-width: 100%; border-top: 1px solid var(--pi-hover-overlay); padding-top: 6px; }
    .diff-details > summary { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; color: var(--pi-muted); cursor: pointer; font-size: 12px; }
    .diff-details > summary span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .diff-details > summary small { flex: 0 0 auto; color: var(--pi-dim); }
    .diff-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; margin-top: 6px; color: var(--pi-muted); font-size: 12px; }
    .diff-toolbar span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    button { border: 1px solid var(--pi-border-muted); border-radius: 6px; background: var(--pi-surface-hover); color: var(--pi-text); padding: 3px 7px; font: 12px system-ui, sans-serif; cursor: pointer; transition: all .2s cubic-bezier(.4,0,.2,1); }
    button:hover, button:focus { background: var(--pi-hover-overlay-strong); border-color: var(--pi-hover-overlay-strong); }

    /* ── Diff block (solid core, no backdrop-filter) ── */
    .diff { box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0; margin: 0; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; border: 1px solid var(--pi-hover-overlay); border-radius: 7px; background: transparent; padding: 8px 0; color: var(--pi-muted); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; }
    .diff-content { display: block; width: max-content; min-width: 100%; }
    .diff span { display: block; min-height: 1.45em; padding: 0 8px; white-space: pre; }
    .diff .context { color: var(--pi-muted); }
    .diff .hunk { color: var(--pi-accent-ref); background: var(--pi-accent-ref-bg); }
    .diff .file { color: var(--pi-dim); }
    .diff .meta { color: var(--pi-dim); }
    .diff .added { background: color-mix(in srgb, var(--pi-success) 6%, transparent); }
    .diff .removed { background: color-mix(in srgb, var(--pi-danger) 6%, transparent); }
    .show-more { justify-self: start; }
  `];
}

function pathFromArgs(args: unknown): string | undefined {
  return getString(args, "path") ?? getString(args, "file_path");
}

function editCountLabel(execution: ToolExecutionPart): string | undefined {
  if (execution.toolName !== "edit") return undefined;
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
