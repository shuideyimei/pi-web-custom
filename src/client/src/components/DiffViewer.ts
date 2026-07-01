import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/** High-risk file patterns that warrant a risk indicator. */
const HIGH_RISK_PATTERNS = [
  /package\.json$/i,
  /package-lock\.json$/i,
  /tsconfig\.json$/i,
  /\.env/i,
  /docker-compose/i,
  /Dockerfile/i,
  /\.github\/workflows\//i,
  /Makefile$/i,
];

@customElement("diff-viewer")
export class DiffViewer extends LitElement {
  @property() diff = "";
  @property() fileName = "";
  @property({ type: Number }) added = 0;
  @property({ type: Number }) removed = 0;
  @property({ type: String }) changeType: "added" | "modified" | "deleted" | "renamed" = "modified";
  @state() private expanded = false;
  @state() private copied = false;

  override render() {
    const lines = this.diff.split("\n");
    const lineCount = lines.length;
    const isHighRisk = HIGH_RISK_PATTERNS.some(p => p.test(this.fileName));

    return html`
      <div class="diff-viewer">
        <div class="diff-header" role="button" tabindex="0"
          @click=${() => { this.expanded = !this.expanded; }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.expanded = !this.expanded; } }}>
          <span class="chevron" aria-hidden="true">${this.expanded ? "▾" : "▸"}</span>
          <span class=${`change-badge ${this.changeType}`}>${changeTypeIcon(this.changeType)}</span>
          <span class="file-name">${this.fileName}</span>
          ${isHighRisk ? html`<span class="risk-badge">⚠ high-risk</span>` : null}
          <span class="diff-summary">
            <b class="added">+${String(this.added)}</b>
            <b class="removed">-${String(this.removed)}</b>
          </span>
        </div>
        ${this.expanded ? html`
          <div class="diff-body">
            <div class="diff-toolbar">
              <span>${String(lineCount)} lines</span>
              <button type="button" @click=${() => { void this.copyDiff(); }}>${this.copied ? "Copied" : "Copy"}</button>
            </div>
            <pre class="diff"><code>${lines.map((line) => html`<span class=${diffLineClass(line)}>${line}</span>`)}</code></pre>
          </div>
        ` : null}
      </div>
    `;
  }

  private async copyDiff(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.diff);
      this.copied = true;
      window.setTimeout(() => { this.copied = false; }, 1200);
    } catch { /* ignore */ }
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .diff-viewer {
      border: 1px solid var(--pi-border-muted);
      border-radius: 12px;
      background: var(--pi-surface);
      overflow: hidden;
    }
    .diff-header {
      display: flex; align-items: center; gap: 6px; min-width: 0;
      padding: 6px 10px; cursor: pointer; user-select: none;
      transition: background .2s cubic-bezier(.4,0,.2,1);
    }
    .diff-header:hover { background: var(--pi-hover-overlay); }
    .diff-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: -2px; }
    .chevron { font-size: 11px; color: var(--pi-muted); }
    .change-badge {
      display: inline-grid; place-items: center;
      width: 20px; height: 20px;
      border-radius: 4px;
      font-size: 11px; font-weight: 700;
    }
    .change-badge.added { background: var(--pi-success-bg); color: var(--pi-success); }
    .change-badge.modified { background: var(--pi-warning-surface); color: var(--pi-warning); }
    .change-badge.deleted { background: var(--pi-danger-bg); color: var(--pi-danger); }
    .change-badge.renamed { background: var(--pi-running-bg); color: var(--pi-accent); }
    .file-name {
      flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--pi-accent-ref); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }
    .file-name:hover { background: var(--pi-accent-ref-bg); border-radius: 2px; }
    .risk-badge {
      flex: 0 0 auto;
      font-size: 10px; padding: 1px 6px; border-radius: 4px;
      background: color-mix(in srgb, var(--pi-warning) 10%, transparent); color: var(--pi-warning);
      border: 1px solid color-mix(in srgb, var(--pi-warning) 2%, transparent);
    }
    .diff-summary { display: inline-flex; gap: 4px; font-size: 12px; }
    .added { color: var(--pi-success); }
    .removed { color: var(--pi-danger); }

    /* ── Diff body: solid core, no backdrop-filter ── */
    .diff-body { border-top: 1px solid var(--pi-hover-overlay); }
    .diff-toolbar {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 4px 10px; color: var(--pi-muted); font-size: 12px;
    }
    button {
      border: 1px solid var(--pi-border-muted); border-radius: 6px;
      background: var(--pi-surface); color: var(--pi-text);
      padding: 3px 7px; font: 12px system-ui, sans-serif; cursor: pointer;
      transition: all .2s cubic-bezier(.4,0,.2,1);
    }
    button:hover, button:focus { background: var(--pi-hover-overlay-strong); border-color: var(--pi-hover-overlay-strong); }
    .diff {
      margin: 0; padding: 8px 0; overflow-x: auto;
      font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.45; color: var(--pi-muted);
      background: transparent;
    }
    .diff code { display: block; width: max-content; min-width: 100%; }
    .diff span { display: block; min-height: 1.45em; padding: 0 8px; white-space: pre; }
    .diff .context { color: var(--pi-muted); }
    .diff .hunk { color: var(--pi-accent-ref); background: var(--pi-accent-ref-bg); }
    .diff .file { color: var(--pi-dim); }
    .diff .meta { color: var(--pi-dim); }
    .diff .added { background: color-mix(in srgb, var(--pi-success) 1%, transparent); }
    .diff .removed { background: color-mix(in srgb, var(--pi-danger) 1%, transparent); }
  `;
}

function changeTypeIcon(type: string): string {
  if (type === "added") return "A";
  if (type === "deleted") return "D";
  if (type === "renamed") return "R";
  return "M";
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "added";
  if (line.startsWith("-") && !line.startsWith("---")) return "removed";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+++") || line.startsWith("---")) return "file";
  if (line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  return "context";
}
