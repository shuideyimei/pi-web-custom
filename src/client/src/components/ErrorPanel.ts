import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Codex-style layered error panel.
 * Shows: Level 1 (what failed) → Level 2 (file/line) → Level 3 (possible cause) → Level 4 (next step suggestion).
 * Full stack trace is collapsible.
 */
@customElement("error-panel")
export class ErrorPanel extends LitElement {
  @property() message = "";
  @property() location = "";
  @property() cause = "";
  @property() suggestion = "";
  @property() stackTrace = "";
  @property() toolName = "";

  override render() {
    const hasContent = this.message !== "" || this.toolName !== "";
    if (!hasContent) return null;

    return html`
      <div class="error-panel">
        <div class="error-header">
          <span class="error-icon" aria-hidden="true">✖</span>
          <div class="error-layers">
            ${this.toolName !== "" ? html`<div class="error-layer layer-1"><strong>Failed:</strong> ${this.toolName}</div>` : null}
            ${this.message !== "" ? html`<div class="error-layer layer-1">${this.message}</div>` : null}
            ${this.location !== "" ? html`<div class="error-layer layer-2"><span class="layer-label">Where:</span> <code>${this.location}</code></div>` : null}
            ${this.cause !== "" ? html`<div class="error-layer layer-3"><span class="layer-label">Cause:</span> ${this.cause}</div>` : null}
            ${this.suggestion !== "" ? html`<div class="error-layer layer-4"><span class="layer-label">Next step:</span> ${this.suggestion}</div>` : null}
          </div>
        </div>
        ${this.stackTrace !== "" ? html`
          <details class="stack-section">
            <summary>Stack trace</summary>
            <pre class="stack-trace">${this.stackTrace}</pre>
          </details>
        ` : null}
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .error-panel {
      display: grid; gap: 6px; width: 100%;
      border: 0;
      border-left: 2px solid color-mix(in srgb, var(--pi-danger) 60%, transparent);
      border-radius: 12px;
      background: transparent;
      padding: 8px 10px;
    }
    .error-header { display: flex; gap: 8px; align-items: flex-start; }
    .error-icon { color: var(--pi-danger); font-size: 14px; flex: 0 0 auto; margin-top: 1px; }
    .error-layers { display: grid; gap: 3px; min-width: 0; }
    .error-layer { font-size: 12px; color: var(--pi-text-secondary); line-height: 1.4; }
    .layer-1 { color: var(--pi-danger); font-weight: 500; }
    .layer-1 strong { font-weight: 600; }
    .layer-2 code {
      background: var(--pi-panel-border); border-radius: 6px; padding: 2px 6px;
      font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--pi-accent-ref);
    }
    .layer-3 { color: var(--pi-warning); }
    .layer-4 { color: var(--pi-success); font-style: italic; }
    .layer-label { color: var(--pi-dim); font-size: 11px; text-transform: uppercase; letter-spacing: .03em; margin-right: 4px; }
    .stack-section { border-top: 1px solid color-mix(in srgb, var(--pi-danger) 1%, transparent); padding-top: 4px; }
    .stack-section > summary { font-size: 11px; color: var(--pi-dim); cursor: pointer; font-family: monospace; }
    .stack-trace {
      margin: 4px 0 0; white-space: pre-wrap; overflow-wrap: anywhere;
      font: 10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      color: var(--pi-muted); max-height: 200px; overflow-y: auto;
      background: transparent; border-radius: 6px; padding: 6px 8px;
    }
  `;
}
