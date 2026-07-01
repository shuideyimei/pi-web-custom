import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

const HEAD_LINES = 20;
const TAIL_LINES = 20;
const TRUNCATION_THRESHOLD = 120;

@customElement("execution-log")
export class ExecutionLog extends LitElement {
  @property() stdout = "";
  @property() stderr = "";
  @property({ type: Number }) exitCode: number | undefined = undefined;
  @property() command = "";
  @state() private expanded = false;

  override render() {
    const hasOutput = this.stdout !== "" || this.stderr !== "";
    const hasError = this.exitCode !== undefined && this.exitCode !== 0;
    const success = this.exitCode === 0;

    return html`
      <div class=${`exec-log ${hasError ? "error" : success ? "success" : ""}`}>
        ${this.command ? html`
          <div class="command-line">
            <span class="prompt">$</span>
            <code>${this.command}</code>
            ${this.exitCode !== undefined ? html`
              <span class=${`exit-code ${hasError ? "error" : "success"}`}>exit ${String(this.exitCode)}</span>
            ` : null}
          </div>
        ` : null}
        ${hasOutput ? this.renderOutput() : null}
      </div>
    `;
  }

  private renderOutput() {
    const hasError = this.exitCode !== undefined && this.exitCode !== 0;
    const stdoutLines = this.stdout.split("\n").filter(l => l !== "");
    const stderrLines = this.stderr.split("\n").filter(l => l !== "");

    return html`
      <details class="output-section" ?open=${hasError || this.expanded}>
        <summary>
          <span>Output</span>
          <small>${String(stdoutLines.length + stderrLines.length)} lines</small>
        </summary>
        ${stdoutLines.length > 0 ? html`
          <div class="output-block stdout">
            ${stdoutLines.length > TRUNCATION_THRESHOLD && !this.expanded
              ? this.renderTruncatedStdout(stdoutLines)
              : html`<pre>${this.stdout}</pre>`
            }
          </div>
        ` : null}
        ${stderrLines.length > 0 ? html`
          <div class="output-block stderr">
            <div class="stderr-label">stderr</div>
            <pre>${this.stderr}</pre>
          </div>
        ` : null}
      </details>
    `;
  }

  private renderTruncatedStdout(lines: string[]) {
    const head = lines.slice(0, HEAD_LINES);
    const tail = lines.slice(-TAIL_LINES);
    const hiddenCount = lines.length - HEAD_LINES - TAIL_LINES;

    return html`
      <pre>${head.join("\n")}</pre>
      <button class="show-hidden" type="button" @click=${(e: Event) => { e.stopPropagation(); this.expanded = true; }}>
        ▽ ${String(hiddenCount)} lines hidden — click to expand
      </button>
      <pre>${tail.join("\n")}</pre>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .exec-log {
      display: grid; gap: 4px; width: 100%;
      border: 0;
      border-radius: 12px;
      background: var(--pi-solid-bg);
      overflow: hidden;
    }


    .command-line {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px;
      background: var(--pi-hover-overlay);
      border-bottom: 1px solid var(--pi-hover-overlay);
      font-size: 12px;
    }
    .prompt { color: var(--pi-muted); font-weight: 600; }
    code { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: var(--pi-text); }
    .exit-code { flex: 0 0 auto; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
    .exit-code.success { background: var(--pi-success-bg); color: var(--pi-success); }
    .exit-code.error { background: var(--pi-danger-bg); color: var(--pi-danger); }

    .output-section { padding: 0 10px; }
    .output-section > summary { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 4px 0; color: var(--pi-muted); cursor: pointer; font-size: 12px; }
    .output-section > summary small { color: var(--pi-dim); }

    /* ── Output block: solid core, no backdrop-filter ── */
    .output-block { margin: 0; }
    .output-block pre {
      margin: 0; padding: 6px 0;
      white-space: pre-wrap; overflow-wrap: anywhere;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--pi-text); max-height: 300px; overflow-y: auto;
    }
    .stderr-label { font-size: 11px; color: var(--pi-danger); text-transform: uppercase; letter-spacing: .03em; margin-bottom: 2px; }
    .stderr pre { color: var(--pi-danger); }

    /* ── Hidden lines button ── */
    .show-hidden {
      display: block; width: 100%;
      border: 0; border-top: 1px dashed var(--pi-panel-border);
      border-bottom: 1px dashed var(--pi-panel-border);
      border-radius: 0;
      background: var(--pi-hover-overlay);
      color: var(--pi-muted);
      padding: 6px 0;
      font: 11px system-ui, sans-serif;
      cursor: pointer;
      transition: all .2s cubic-bezier(.4,0,.2,1);
    }
    .show-hidden:hover { background: var(--pi-hover-overlay); color: var(--pi-text-secondary); }
  `;
}
