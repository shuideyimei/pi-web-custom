import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

const MAX_COLLAPSED_LINES = 8;

/**
 * BashNode — Codex-style compact bash execution display.
 *
 * Collapsed (default): single line showing command + status
 * Expanded (click): full command output
 */
@customElement("bash-node")
export class BashNode extends LitElement {
  @property() stdout = "";
  @property() stderr = "";
  @property({ type: Number }) exitCode: number | undefined = undefined;
  @property() command = "";
  @state() private expanded = false;
  @state() private showFullOutput = false;
  @state() private userToggled = false;

  override render() {
    const hasOutput = this.stdout !== "" || this.stderr !== "";
    const hasError = this.exitCode !== undefined && this.exitCode !== 0;
    const effectiveOpen = this.userToggled ? this.expanded : false;

    return html`
      <div class="bash-node${effectiveOpen ? " expanded" : ""}${hasError ? " error" : ""}">
        <div
          class="bash-header"
          role="button"
          tabindex="0"
          aria-expanded=${String(effectiveOpen)}
          @click=${() => { this.toggle(); }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.toggle(); } }}
        >
          <span class="bash-prompt">$</span>
          <code class="bash-command">${this.command}</code>
          ${this.exitCode !== undefined ? html`
            <span class="bash-exit ${hasError ? "error" : "success"}">${hasError ? "failed" : "done"}</span>
          ` : html`<span class="bash-exit running">running</span>`}
          ${hasOutput ? html`
            <span class="bash-lines">${this.totalLines()} lines</span>
          ` : null}
          <span class="bash-chevron" aria-hidden="true">${effectiveOpen ? "▾" : "▸"}</span>
        </div>
        ${effectiveOpen && hasOutput ? this.renderOutput() : null}
      </div>
    `;
  }

  private toggle() {
    this.userToggled = true;
    this.expanded = !this.expanded;
  }

  private totalLines(): number {
    return this.stdout.split("\n").filter(l => l !== "").length
      + this.stderr.split("\n").filter(l => l !== "").length;
  }

  private renderOutput() {
    const stdoutLines = this.stdout.split("\n").filter(l => l !== "");
    const stderrLines = this.stderr.split("\n").filter(l => l !== "");
    const total = stdoutLines.length + stderrLines.length;
    const truncated = total > MAX_COLLAPSED_LINES && !this.showFullOutput;

    const visibleStdout = truncated && stdoutLines.length > MAX_COLLAPSED_LINES
      ? stdoutLines.slice(0, MAX_COLLAPSED_LINES).join("\n")
      : this.stdout;

    return html`
      <div class="bash-output">
        ${stdoutLines.length > 0 ? html`
          <pre class="bash-stdout">${visibleStdout}${truncated && stdoutLines.length > MAX_COLLAPSED_LINES
            ? html`<span class="bash-truncation"> ${String(stdoutLines.length - MAX_COLLAPSED_LINES)} more lines</span>`
            : ""}</pre>
        ` : null}
        ${stderrLines.length > 0 ? html`
          <div class="bash-stderr-block">
            <span class="bash-stderr-label">stderr</span>
            <pre class="bash-stderr">${this.stderr}</pre>
          </div>
        ` : null}
        ${truncated ? html`
          <button class="bash-show-more" type="button" @click=${(e: Event) => { e.stopPropagation(); this.showFullOutput = true; }}>
            Show all ${String(total)} lines
          </button>
        ` : null}
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }

    .bash-node {
      display: grid;
      gap: 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
    .bash-node.expanded { gap: 6px; }

    /* ── Single-line header ── */
    .bash-header {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 2px 0;
      cursor: pointer;
      user-select: none;
      border-radius: 4px;
      transition: background .15s ease;
      font-size: 13px;
    }
    .bash-header:hover { background: var(--pi-hover-overlay); }
    .bash-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; border-radius: 4px; }

    .bash-prompt {
      flex: 0 0 auto;
      color: var(--pi-muted);
      font-weight: 600;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .bash-command {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--pi-text);
      background: transparent;
      padding: 0;
      border: 0;
    }

    .bash-exit {
      flex: 0 0 auto;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
      padding: 1px 6px;
      border-radius: 4px;
    }
    .bash-exit.success { color: color-mix(in srgb, var(--pi-success) 45%, var(--pi-muted)); }
    .bash-exit.error { color: color-mix(in srgb, var(--pi-danger) 45%, var(--pi-muted)); }
    .bash-exit.running { color: color-mix(in srgb, var(--pi-running) 45%, var(--pi-muted)); }

    .bash-lines {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--pi-dim);
    }

    .bash-chevron {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--pi-muted);
      opacity: .5;
    }

    /* ── Expanded output ── */
    .bash-output {
      display: grid;
      gap: 4px;
      padding: 6px 10px;
      border-radius: 8px;
      background: var(--pi-hover-overlay);
    }

    .bash-stdout, .bash-stderr {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--pi-text);
      line-height: 1.45;
      max-height: 300px;
      overflow-y: auto;
    }

    .bash-stderr-block { display: grid; gap: 2px; }
    .bash-stderr-label {
      font-size: 11px;
      color: var(--pi-danger);
      text-transform: uppercase;
      letter-spacing: .03em;
    }
    .bash-stderr { color: var(--pi-danger); }

    .bash-truncation {
      color: var(--pi-muted);
      font-style: italic;
    }

    .bash-show-more {
      justify-self: start;
      border: 1px solid var(--pi-border-muted);
      border-radius: 6px;
      background: var(--pi-surface);
      color: var(--pi-text);
      padding: 3px 7px;
      font: 12px system-ui, sans-serif;
      cursor: pointer;
      transition: all .2s cubic-bezier(.4,0,.2,1);
    }
    .bash-show-more:hover, .bash-show-more:focus {
      background: var(--pi-hover-overlay-strong);
      border-color: var(--pi-hover-overlay-strong);
    }
  `;
}
