import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { activityShimmerStyles } from "./activityShimmerStyles";
import type { ToolAggregation } from "./timelineAdapter";
import type { ChatPart, ToolExecutionPart } from "./shared";
import { inputRequestFromArgs, type SessionInputRequest } from "../sessionInputRequests";
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
  @property({ type: Boolean }) agentActive = false;
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
    const skillRead = agg.skillRead;

    // Derive display values — prefer execution, fall back to toolCall/result
    const toolName = skillRead !== undefined ? "load_skill" : execution?.toolName ?? toolCall?.toolName ?? result?.toolName ?? "tool";
    const status: ToolExecutionPart["status"] = skillRead !== undefined ? "success" : execution?.status ?? (result?.isError === true ? "error" : result !== undefined ? "success" : "pending");
    const args = skillRead !== undefined ? { name: skillRead.name, path: skillRead.path } : execution?.args ?? toolCall?.args;
    const inputRequest = inputRequestFromArgs(args);
    const command = toolName === "bash" ? commandFromArgs(args) : undefined;
    const summary = skillRead?.name ?? command ?? userInputRequestSummary(inputRequest) ?? execution?.summary ?? toolCall?.summary ?? "";
    const filePath = skillRead?.path ?? pathFromArgs(args);
    const actualDiff = execution === undefined ? undefined : diffFromDetails(execution.details);
    const preview = execution?.preview;
    const visibleDiff = actualDiff ?? preview?.diff;
    const diffStats = visibleDiff === undefined ? undefined : countDiffLines(visibleDiff);
    const previewMismatch = actualDiff !== undefined && preview?.diff !== undefined && actualDiff !== preview.diff;
    const resultText = execution?.resultText ?? result?.text;
    const errorText = preview?.error;
    const bodyText = visibleDiff === undefined ? resultText : undefined;
    const effectiveOpen = this.userToggled ? this.expanded : false;
    const shouldShimmer = this.agentActive && (status === "pending" || status === "running");
    const label = skillRead !== undefined
      ? `Loaded ${skillRead.name}`
      : inputRequest !== undefined
        ? userInputRequestStatusLabel(status)
        : toolSummaryLabel(toolName, status, command);

    return html`
      <div class=${`tcn ${status}${effectiveOpen ? " expanded" : ""}`}>
        <div class="tcn-summary" role="button" tabindex="0" aria-expanded=${String(effectiveOpen)}
          @click=${() => { this.toggle(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } }}>
          <strong class=${shouldShimmer ? "tcn-name shimmer-text" : "tcn-name"}>${label}</strong>
          ${filePath !== undefined || summary !== "" ? html`<span class="tcn-sep">·</span>` : null}
          ${filePath !== undefined
            ? html`<span class="tcn-path">${filePath}</span>`
            : summary !== ""
              ? html`<span class="tcn-desc">${summary}</span>`
              : null}
          ${diffStats !== undefined ? html`<span class="tcn-diff-stats"><b class="added">+${diffStats.added}</b><span class="sep">/</span><b class="removed">-${diffStats.removed}</b></span>` : null}
          ${editCountLabel(execution) !== undefined ? html`<span class="tcn-edit-count">${editCountLabel(execution)}</span>` : null}
          <span class="tcn-chevron" aria-hidden="true">${effectiveOpen ? "▾" : "▸"}</span>
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
            ${inputRequest === undefined && toolName !== "bash" && toolName !== "edit" && toolName !== "write" && visibleDiff === undefined && (bodyText === undefined || bodyText === "")
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
    if (toolName === "load_skill") return this.renderSkillReadDetails(this.aggregation?.skillRead, args, bodyText);
    if (toolName === "bash") return this.renderBashCommand(args, bodyText);
    if (toolName === "read") return this.renderReadDetails(args, bodyText);
    if (toolName === "edit" || toolName === "write") return this.renderFileChangeDetails(toolName, args, visibleDiff, diffLabel, bodyText);
    if (isUserInputToolName(toolName) || inputRequestFromArgs(args) !== undefined) return this.renderUserInputRequestDetails(args, bodyText);
    if (visibleDiff !== undefined) return this.renderDiffBody(visibleDiff, diffLabel);
    return this.renderGenericToolDetails(args, bodyText);
  }

  private renderSubagentDetails(args: unknown, output: string | undefined, details: unknown) {
    return html`<subagent-tool-details .args=${args} .details=${details} .resultText=${output ?? ""} .status=${this.aggregation?.execution?.status ?? "pending"}></subagent-tool-details>`;
  }

  private renderSkillReadDetails(skillRead: Extract<ChatPart, { type: "skillRead" }> | undefined, args: unknown, output: string | undefined) {
    const name = skillRead?.name ?? getString(args, "name") ?? "skill";
    const path = skillRead?.path ?? pathFromArgs(args);
    return html`
      <div class="tcn-file-block">
        <div class="tcn-file-change">
          <span class="tcn-file-action">load skill</span>
          <span class="tcn-file-path">${name}</span>
        </div>
        ${path === undefined ? null : html`
          <div class="tcn-file-change">
            <span class="tcn-file-action">path</span>
            <span class="tcn-file-path">${path}</span>
          </div>
        `}
        ${this.renderInlineOutput(output)}
      </div>
    `;
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

  private renderUserInputRequestDetails(args: unknown, output: string | undefined) {
    const request = inputRequestFromArgs(args);
    if (request === undefined) return this.renderGenericToolDetails(args, output);
    return html`
      <section class="tcn-input-request" aria-label="Input request parameters">
        <header class="tcn-input-request-header">
          <strong>${String(request.questions.length)} question${request.questions.length === 1 ? "" : "s"}</strong>
          ${request.autoResolutionMs === undefined ? null : html`<small>Auto-resolves in ${formatDuration(request.autoResolutionMs)}</small>`}
        </header>
        <div class="tcn-question-list">
          ${request.questions.map((question, index) => html`
            <article class="tcn-question">
              <div class="tcn-question-topline">
                ${question.header === undefined ? null : html`<span class="tcn-question-header">${question.header}</span>`}
                ${question.id === undefined ? null : html`<span class="tcn-question-id">${question.id}</span>`}
                <span class="tcn-question-index">${String(index + 1)}</span>
              </div>
              <p class="tcn-question-text">${question.question}</p>
              ${question.options.length === 0 ? null : html`
                <ul class="tcn-option-list" aria-label="Options">
                  ${question.options.map((option) => html`
                    <li class="tcn-option">
                      <span class="tcn-option-label">${option.label}</span>
                      ${option.description === undefined || option.description === "" ? null : html`<span class="tcn-option-description">${option.description}</span>`}
                    </li>
                  `)}
                </ul>
              `}
            </article>
          `)}
        </div>
        ${request.metadataEntries.length === 0 ? null : html`
          <div class="tcn-metadata" aria-label="Metadata">
            ${request.metadataEntries.map(([key, value]) => html`
              <span class="tcn-metadata-chip"><b>${key}</b><span>${shortDisplayValue(value)}</span></span>
            `)}
          </div>
        `}
      </section>
      ${this.renderInlineOutput(output)}
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

  static override styles = [activityShimmerStyles, css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; color: var(--pi-text); }

    /* ── Root: no card, no border, no backdrop-filter ── */
    .tcn { display: grid; gap: 0; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
    .tcn.expanded { gap: 6px; }

    /* ── One-liner summary ── */
    .tcn-summary {
      display: flex; align-items: center; gap: 6px; min-width: 0;
      position: relative;
      overflow: hidden;
      cursor: pointer; user-select: none;
      min-height: 36px;
      box-sizing: border-box;
      padding: 4px 0;
      font-size: 13px;
      line-height: 1.4;
      transition: background .15s ease, opacity .15s ease, filter .15s ease;
      border: 0;
      border-radius: 4px;
      background: transparent;
    }
    .tcn.pending .tcn-summary,
    .tcn.running .tcn-summary {
      filter: saturate(.9);
    }
    .tcn.success .tcn-summary,
    .tcn.error .tcn-summary {
      opacity: 1;
      filter: none;
    }
    .tcn-summary:hover { background: color-mix(in srgb, var(--pi-surface-hover) 45%, transparent); }
    .tcn-summary:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }

    .tcn-name {
      flex: 0 0 auto;
      color: var(--activity-row-text);
      font-size: 13px;
      font-weight: 600;
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
    .added { color: color-mix(in srgb, var(--pi-success) 50%, var(--pi-muted)); }
    .removed { color: color-mix(in srgb, var(--pi-danger) 50%, var(--pi-muted)); }
    .sep { opacity: .4; }
    .tcn-edit-count { color: var(--pi-dim); font-size: 12px; }
    .tcn-chevron { flex: 0 0 auto; margin-left: auto; color: var(--activity-row-text); font-size: 11px; opacity: .65; }

    /* ── Body: black-hole solid core ── */
    .tcn-body {
      display: grid; gap: 4px;
      max-height: min(420px, 52vh);
      overflow: auto;
      margin-left: 3px;
      padding: 4px 0 4px 13px;
      border-left: 1px solid var(--pi-border-muted);
      background: transparent;
    }
    .tcn.error .tcn-body {
    }

    .tcn-notice { margin: 0; color: var(--pi-warning); font-size: 13px; }
    .tcn-muted { margin: 0; color: var(--pi-muted); font-size: 13px; }

    /* ── Error ── */
    .tcn-error { display: grid; gap: 4px; }
    .tcn-error-text {
      margin: 0; border-radius: 6px;
      background: transparent; color: var(--pi-danger); padding: 8px;
      white-space: pre-wrap; overflow-wrap: anywhere;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-suggestion { margin: 0; color: var(--pi-text-secondary); font-size: 12px; font-style: italic; }

    /* ── Tool-specific details ── */
    .tcn-command {
      display: grid;
      gap: 6px;
      border-radius: 0;
      background: transparent;
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

    .tcn-input-request {
      display: grid;
      gap: 8px;
      min-width: 0;
      padding: 3px 0;
    }
    .tcn-input-request-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      color: var(--pi-muted);
      font-size: 12px;
    }
    .tcn-input-request-header strong {
      color: var(--pi-text-secondary);
      font-size: 12px;
      font-weight: 650;
    }
    .tcn-input-request-header small {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--pi-dim);
    }
    .tcn-question-list {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .tcn-question {
      display: grid;
      gap: 6px;
      min-width: 0;
      border-left: 1px solid var(--pi-border-muted);
      padding-left: 10px;
    }
    .tcn-question-topline {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: var(--pi-dim);
      font-size: 11px;
    }
    .tcn-question-header,
    .tcn-question-id {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .tcn-question-header {
      color: var(--pi-text-secondary);
      font-weight: 600;
    }
    .tcn-question-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-question-index {
      flex: 0 0 auto;
      margin-left: auto;
      color: var(--pi-dim);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .tcn-question-text {
      margin: 0;
      color: var(--pi-text);
      font-size: 13px;
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .tcn-option-list {
      display: grid;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tcn-option {
      display: grid;
      grid-template-columns: minmax(92px, 180px) minmax(0, 1fr);
      align-items: baseline;
      gap: 8px;
      min-width: 0;
      color: var(--pi-muted);
      font-size: 12px;
      line-height: 1.35;
    }
    .tcn-option-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--pi-text-secondary);
      font-weight: 600;
    }
    .tcn-option-description {
      min-width: 0;
      color: var(--pi-muted);
      overflow-wrap: anywhere;
    }
    .tcn-metadata {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      min-width: 0;
    }
    .tcn-metadata-chip {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      max-width: 100%;
      border: 1px solid var(--pi-border-muted);
      border-radius: 6px;
      color: var(--pi-muted);
      padding: 2px 6px;
      font-size: 11px;
      line-height: 1.35;
    }
    .tcn-metadata-chip b {
      flex: 0 0 auto;
      color: var(--pi-dim);
      font-weight: 600;
    }
    .tcn-metadata-chip span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
      background: var(--pi-surface); color: var(--pi-text); padding: 3px 7px;
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
    .tcn-diff-block .added { background: color-mix(in srgb, var(--pi-success) 6%, transparent); }
    .tcn-diff-block .removed { background: color-mix(in srgb, var(--pi-danger) 6%, transparent); }
  `];
}

// ─── Utility functions (same logic as ToolCallCard, kept local) ──────

function isUserInputToolName(name: string): boolean {
  return name === "request_user_input" || name.endsWith(".request_user_input");
}

function userInputRequestSummary(request: SessionInputRequest | undefined): string | undefined {
  const firstQuestion = request?.questions[0];
  if (request === undefined || firstQuestion === undefined) return undefined;
  return `Ask ${String(request.questions.length)} question${request.questions.length === 1 ? "" : "s"}: ${truncateInline(firstQuestion.question, 96)}`;
}

function userInputRequestStatusLabel(status: ToolExecutionPart["status"]): string {
  return status === "success" || status === "error" ? "Requested input" : "Waiting for input";
}

function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "0s";
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? `${String(minutes)}m` : `${String(minutes)}m ${String(remainder)}s`;
}

function shortDisplayValue(value: unknown): string {
  if (typeof value === "string") return truncateInline(value, 80);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (Array.isArray(value)) return `${String(value.length)} item${value.length === 1 ? "" : "s"}`;
  if (isRecord(value)) return "object";
  return String(value);
}

function truncateInline(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function pathFromArgs(args: unknown): string | undefined {
  return getString(args, "path") ?? getString(args, "file_path");
}

function commandFromArgs(args: unknown): string | undefined {
  return getString(args, "command") ?? getString(args, "cmd");
}

function toolSummaryLabel(toolName: string, status: ToolExecutionPart["status"], command: string | undefined): string {
  if (toolName === "load_skill") return status === "success" ? "Loaded skill" : "Loading skill";
  if (isUserInputToolName(toolName)) return status === "success" || status === "error" ? "Requested input" : "Waiting for input";
  if (toolName === "read") return status === "success" ? "Read file" : "Reading files";
  if (toolName === "edit" || toolName === "write" || toolName === "apply_patch") return status === "success" ? "Edited file" : "Editing files";
  if (toolName === "grep" || toolName === "rg" || toolName === "glob") return status === "success" ? "Searched codebase" : "Searching codebase";
  if (toolName === "web_search" || toolName === "fetch_content" || toolName === "search_query") return status === "success" ? "Searched sources" : "Searching sources";
  if (toolName === "bash") {
    if (command !== undefined && isTestCommand(command)) {
      if (status === "success") return "Tests passed";
      if (status === "error") return "Tests failed";
      return "Running tests";
    }
    if (command !== undefined && isBuildCommand(command)) {
      if (status === "success") return "Build passed";
      if (status === "error") return "Build failed";
      return "Running build";
    }
    return status === "success" || status === "error" ? "Ran command" : "Running command";
  }
  if (toolName === "browser" || toolName === "screenshot" || toolName === "open") return status === "success" ? "Opened browser preview" : "Opening browser preview";
  if (toolName === "subagent") return status === "success" ? "Reviewed task" : "Reviewing task";
  return status === "success" || status === "error" ? `Ran ${toolName}` : `Running ${toolName}`;
}

function isTestCommand(command: string): boolean {
  return /\b(test|vitest|jest|playwright|pytest)\b|cargo\s+test|go\s+test|npm\s+(run\s+)?test|pnpm\s+(run\s+)?test|yarn\s+test/u.test(command);
}

function isBuildCommand(command: string): boolean {
  return /\b(build|typecheck|lint)\b|npm\s+run\s+(build|typecheck|lint)|pnpm\s+(build|typecheck|lint)/u.test(command);
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
