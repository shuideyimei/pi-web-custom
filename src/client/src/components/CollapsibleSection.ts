import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

/**
 * Codex-style collapsible section with smooth transition,
 * keyboard accessibility, and aria-expanded support.
 *
 * Usage:
 *   <collapsible-section summary="Thinking" ?open=${false}>
 *     <formatted-text .text=${text}></formatted-text>
 *   </collapsible-section>
 */
@customElement("collapsible-section")
export class CollapsibleSection extends LitElement {
  @property() summary = "";
  @property({ type: Boolean, reflect: true }) open = false;
  @property({ type: Boolean }) borderless = false;

  override render() {
    return html`
      <div class=${`section${this.borderless ? " borderless" : ""}${this.open ? " open" : ""}`}>
        <button
          class="section-header"
          type="button"
          aria-expanded=${String(this.open)}
          @click=${() => { this.open = !this.open; }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.open = !this.open; }
          }}
        >
          <span class="chevron" aria-hidden="true">${this.open ? "▾" : "▸"}</span>
          <span class="section-title">${this.summary}</span>
          <slot name="header-trailing"></slot>
        </button>
        <div class="section-body" ?hidden=${!this.open} role="region">
          <slot></slot>
        </div>
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .section {
      border-top: 1px solid var(--pi-hover-overlay);
      padding-top: 2px;
    }
    .section.borderless { border-top: 0; padding-top: 0; }

    /* ── Header button ── */
    .section-header {
      display: flex; align-items: center; gap: 6px;
      width: 100%; min-width: 0;
      border: 0; border-radius: 6px;
      background: transparent;
      color: var(--pi-muted);
      padding: 4px 6px;
      font: 12px system-ui, sans-serif;
      cursor: pointer;
      transition: all .2s cubic-bezier(.4, 0, .2, 1);
    }
    .section-header:hover { background: var(--pi-hover-overlay); color: var(--pi-text-secondary); }
    .section-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }

    .chevron {
      font-size: 11px;
      opacity: .5;
      transition: transform .2s cubic-bezier(.4, 0, .2, 1);
      flex: 0 0 auto;
    }
    .section.open .chevron { transform: rotate(0deg); }
    .section:not(.open) .chevron { transform: rotate(0deg); }

    .section-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* ── Body ── */
    .section-body {
      padding-top: 4px;
      animation: sectionFadeIn .2s cubic-bezier(.4, 0, .2, 1);
    }
    .section-body[hidden] { display: none; }

    @keyframes sectionFadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
}
