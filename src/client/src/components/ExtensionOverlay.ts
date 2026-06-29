import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ExtensionOverlay as ExtensionOverlayState } from "../api";

@customElement("extension-overlay")
export class ExtensionOverlay extends LitElement {
  @property({ attribute: false }) overlay?: ExtensionOverlayState;
  @property({ attribute: false }) onClose?: (requestId: string) => void;
  @property({ attribute: false }) onInput?: (requestId: string, data: string) => void;

  override render() {
    const overlay = this.overlay;
    if (overlay === undefined) return null;
    return html`
      <div class="backdrop" @mousedown=${() => { this.close(); }} @keydown=${(event: KeyboardEvent) => { this.handleKeyDown(event); }}>
        <section role="dialog" aria-modal="true" aria-label=${overlay.title} @mousedown=${(event: MouseEvent) => { event.stopPropagation(); }} tabindex="0">
          <header>
            <strong>${overlay.title}</strong>
            ${overlay.status === "working" ? html`<span class="working-dot" aria-hidden="true"></span>` : null}
            ${overlay.closable ? html`<button type="button" title="Close" aria-label="Close" @click=${() => { this.close(); }}>×</button>` : null}
          </header>
          <pre>${overlay.body}</pre>
        </section>
      </div>
    `;
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>("section")?.focus();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const overlay = this.overlay;
    if (overlay === undefined) return;
    const data = terminalInputFromKeyboardEvent(event);
    if (data === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.onInput !== undefined) {
      this.onInput(overlay.requestId, data);
      return;
    }
    if (event.key === "Escape") this.close();
  }

  private close(): void {
    const overlay = this.overlay;
    if (overlay?.closable !== true) return;
    this.onClose?.(overlay.requestId);
  }

  static override styles = css`
    :host { position: fixed; inset: 0; z-index: 60; display: block; }
    .backdrop { display: grid; place-items: center; width: 100%; height: 100dvh; box-sizing: border-box; padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)); background: color-mix(in srgb, #000 62%, transparent); backdrop-filter: blur(18px) saturate(115%); -webkit-backdrop-filter: blur(18px) saturate(115%); overflow: hidden; }
    section { width: min(1120px, 100%); max-height: min(860px, 100%); min-height: 180px; display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid color-mix(in srgb, var(--pi-border) 72%, #fff 10%); border-radius: 8px; background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 90px), color-mix(in srgb, var(--pi-bg) 88%, #111 12%); color: var(--pi-text); box-shadow: 0 24px 80px color-mix(in srgb, #000 62%, transparent), 0 1px 0 color-mix(in srgb, #fff 8%, transparent) inset; overflow: hidden; }
    section:focus { outline: none; }
    section:focus-visible { outline: 2px solid color-mix(in srgb, var(--pi-text-bright) 34%, var(--pi-accent) 66%); outline-offset: 2px; }
    header { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid color-mix(in srgb, var(--pi-border-muted) 70%, transparent); background: color-mix(in srgb, var(--pi-surface) 58%, transparent); }
    strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-text-bright); font-size: 14px; }
    button { border: 1px solid color-mix(in srgb, var(--pi-border) 72%, #fff 10%); border-radius: 8px; background: color-mix(in srgb, var(--pi-surface) 78%, var(--pi-bg) 22%); color: var(--pi-text); width: 32px; height: 32px; padding: 0; font: inherit; cursor: pointer; }
    button:hover, button:focus { color: var(--pi-text-bright); background: color-mix(in srgb, var(--pi-text) 9%, transparent); }
    button:focus-visible { outline: 2px solid color-mix(in srgb, var(--pi-text-bright) 34%, var(--pi-accent) 66%); outline-offset: 2px; }
    pre { min-height: 0; margin: 0; padding: 14px 16px 18px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--pi-text); font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; scrollbar-width: thin; }
    .working-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--pi-accent); box-shadow: 0 0 0 0 color-mix(in srgb, var(--pi-accent) 45%, transparent); animation: pulse 1.1s ease-out infinite; }
    @keyframes pulse {
      0% { transform: scale(.82); box-shadow: 0 0 0 0 color-mix(in srgb, var(--pi-accent) 45%, transparent); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px transparent; }
      100% { transform: scale(.82); box-shadow: 0 0 0 0 transparent; }
    }
  `;
}

function terminalInputFromKeyboardEvent(event: KeyboardEvent): string | undefined {
  if (event.metaKey) return undefined;
  if (event.ctrlKey && event.key.length === 1) return ctrlInput(event.key);
  if (event.altKey && event.key.length === 1) return `\x1b${event.key}`;

  switch (event.key) {
    case "ArrowUp": return event.ctrlKey ? "\x1bOa" : event.shiftKey ? "\x1b[a" : "\x1b[A";
    case "ArrowDown": return event.ctrlKey ? "\x1bOb" : event.shiftKey ? "\x1b[b" : "\x1b[B";
    case "ArrowRight": return event.ctrlKey ? "\x1bOc" : event.shiftKey ? "\x1b[c" : "\x1b[C";
    case "ArrowLeft": return event.ctrlKey ? "\x1bOd" : event.shiftKey ? "\x1b[d" : "\x1b[D";
    case "PageUp": return event.ctrlKey ? "\x1b[5^" : event.shiftKey ? "\x1b[5$" : "\x1b[5~";
    case "PageDown": return event.ctrlKey ? "\x1b[6^" : event.shiftKey ? "\x1b[6$" : "\x1b[6~";
    case "Home": return event.ctrlKey ? "\x1b[7^" : event.shiftKey ? "\x1b[7$" : "\x1b[H";
    case "End": return event.ctrlKey ? "\x1b[8^" : event.shiftKey ? "\x1b[8$" : "\x1b[F";
    case "Escape": return "\x1b";
    case "Enter": return event.shiftKey ? "\x1b[13;2u" : "\r";
    case "Tab": return event.shiftKey ? "\x1b[Z" : "\t";
    case "Backspace": return "\x7f";
    case "Delete": return event.ctrlKey ? "\x1b[3^" : event.shiftKey ? "\x1b[3$" : "\x1b[3~";
    case "Insert": return event.ctrlKey ? "\x1b[2^" : event.shiftKey ? "\x1b[2$" : "\x1b[2~";
    case " ": return event.ctrlKey ? "\x00" : " ";
    default:
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey) return event.key;
      return undefined;
  }
}

function ctrlInput(key: string): string | undefined {
  const normalized = key.toUpperCase();
  if (normalized < "@" || normalized > "_") return undefined;
  return String.fromCharCode(normalized.charCodeAt(0) - 64);
}
