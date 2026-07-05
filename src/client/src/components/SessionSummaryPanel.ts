import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { SessionWorkSummary, SessionWorkSummaryCommand, SessionWorkSummaryFile, SessionWorkSummaryLine } from "../sessionWorkSummary";

@customElement("session-summary-panel")
export class SessionSummaryPanel extends LitElement {
  @property({ attribute: false }) summary: SessionWorkSummary | undefined;

  override render() {
    const summary = this.summary;
    if (summary === undefined) return null;
    const empty = summary.plan.length === 0
      && summary.sources.length === 0
      && summary.filesChanged.length === 0
      && summary.commandsRun.length === 0
      && summary.artifacts.length === 0
      && summary.nextSteps.length === 0;
    return html`
      <section class="summary-root" aria-label="Session work summary">
        <header>
          <div>
            <strong>Summary</strong>
            ${summary.workspace === undefined ? null : html`<small>${summary.workspace}</small>`}
          </div>
        </header>
        ${empty ? html`
          <div class="empty">
            <strong>No work captured yet</strong>
            <p>Send a message or run workspace tools to populate this pane.</p>
          </div>
        ` : html`
          ${this.renderSection("Next steps", summary.nextSteps, "No queued or inferred next steps.")}
          ${this.renderSection("Plan", summary.plan, "No explicit plan captured.")}
          ${this.renderSection("Sources", summary.sources, "No files or sources read yet.")}
          ${this.renderFiles(summary.filesChanged)}
          ${this.renderCommands("Commands run", summary.commandsRun)}
          ${this.renderCommands("Test results", summary.testResults, "No test commands detected.")}
          ${this.renderSection("Artifacts", summary.artifacts, "No artifacts selected.")}
        `}
      </section>
    `;
  }

  private renderSection(title: string, items: readonly SessionWorkSummaryLine[], emptyLabel: string) {
    return html`
      <section class="summary-section">
        <h2>${title}</h2>
        ${items.length === 0 ? html`<p class="empty-line">${emptyLabel}</p>` : html`
          <ul>
            ${items.map((item) => this.renderLine(item))}
          </ul>
        `}
      </section>
    `;
  }

  private renderFiles(items: readonly SessionWorkSummaryFile[]) {
    return html`
      <section class="summary-section">
        <h2>Files changed</h2>
        ${items.length === 0 ? html`<p class="empty-line">No changed files detected.</p>` : html`
          <ul>
            ${items.map((item) => html`
              <li class=${this.lineClass(item)}>
                <span class="line-main">${item.label}</span>
                <span class="line-detail mono">${item.detail ?? item.path}</span>
              </li>
            `)}
          </ul>
        `}
      </section>
    `;
  }

  private renderCommands(title: string, items: readonly SessionWorkSummaryCommand[], emptyLabel = "No commands captured.") {
    return html`
      <section class="summary-section">
        <h2>${title}</h2>
        ${items.length === 0 ? html`<p class="empty-line">${emptyLabel}</p>` : html`
          <ul>
            ${items.map((item) => html`
              <li class=${this.lineClass(item)}>
                <span class="line-main">${item.label}</span>
                <span class="line-detail mono">${item.command}</span>
                ${item.detail === undefined ? null : html`<span class="line-note">${item.detail}</span>`}
              </li>
            `)}
          </ul>
        `}
      </section>
    `;
  }

  private renderLine(item: SessionWorkSummaryLine) {
    return html`
      <li class=${this.lineClass(item)}>
        <span class="line-main">${item.label}</span>
        ${item.detail === undefined ? null : html`<span class="line-detail">${item.detail}</span>`}
      </li>
    `;
  }

  private lineClass(item: SessionWorkSummaryLine): string {
    return item.status === undefined ? "summary-line" : `summary-line ${item.status}`;
  }

  static override styles = css`
    :host { display: block; min-height: 0; color: var(--pi-text); }
    .summary-root { min-height: 0; display: flex; flex-direction: column; }
    header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
    header div { min-width: 0; display: grid; gap: 2px; }
    header strong { color: var(--pi-text-bright); font-size: 13px; line-height: 1.2; }
    header small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font-size: 12px; }
    .empty { display: grid; gap: 6px; margin: auto; width: min(100%, 340px); padding: 28px 18px; color: var(--pi-muted); text-align: center; }
    .empty strong { color: var(--pi-text); font-size: 14px; }
    .empty p { margin: 0; line-height: 1.45; }
    .summary-section { border-bottom: 1px solid var(--pi-border-muted); padding: 10px 12px; }
    .summary-section:last-child { border-bottom: 0; }
    h2 { margin: 0 0 8px; color: var(--pi-muted); font-size: 11px; font-weight: 700; line-height: 1.2; text-transform: uppercase; letter-spacing: .04em; }
    ul { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
    .summary-line { min-width: 0; display: grid; gap: 2px; padding-left: 10px; border-left: 2px solid var(--pi-border-muted); }
    .summary-line.running, .summary-line.pending { border-left-color: var(--pi-running); }
    .summary-line.success { border-left-color: var(--pi-success); }
    .summary-line.error { border-left-color: var(--pi-danger); }
    .line-main { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-text); font-size: 13px; line-height: 1.25; }
    .line-detail, .line-note { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font-size: 12px; line-height: 1.35; }
    .line-note { color: var(--pi-dim); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .empty-line { margin: 0; color: var(--pi-dim); font-size: 12px; line-height: 1.35; }
    @container (max-width: 360px) {
      .line-main, .line-detail, .line-note { white-space: normal; overflow-wrap: anywhere; }
    }
  `;
}
