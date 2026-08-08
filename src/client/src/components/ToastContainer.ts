import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface ToastItem {
  id: string;
  message: string;
  level: "info" | "success" | "error" | "warning";
  timestamp: number;
  persistent?: boolean;
}

@customElement("toast-container")
export class ToastContainer extends LitElement {
  @property({ attribute: false }) toasts: ToastItem[] = [];
  @property({ attribute: false }) onDismiss?: (id: string) => void;
  @state() private visibleToasts: ToastItem[] = [];

  override updated(changed: Map<string, unknown>) {
    if (changed.has("toasts")) {
      this.syncVisibleToasts();
    }
  }

  private syncVisibleToasts() {
    const now = Date.now();
    this.visibleToasts = this.toasts.filter((toast) => toast.persistent === true || now - toast.timestamp < 5000);
  }

  override render() {
    if (this.visibleToasts.length === 0) return null;
    return html`
      <div class="toast-container">
        ${this.visibleToasts.map((toast) => html`
          <div class="toast toast-${toast.level}">
            <span class="toast-message">${toast.message}</span>
            <button class="toast-close" type="button" aria-label="Dismiss notification" @click=${() => { this.onDismiss?.(toast.id); }}>×</button>
          </div>
        `)}
      </div>
    `;
  }

  static override styles = css`
    .toast-container {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      white-space: pre-wrap;
    }
    .toast {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
      gap: 10px;
      padding: 12px 12px 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      max-width: 400px;
      word-break: break-word;
      animation: toast-in 0.3s ease-out;
      pointer-events: auto;
      box-shadow: 0 12px 32px color-mix(in srgb, var(--pi-shadow, #000) 28%, transparent);
    }
    .toast-message { min-width: 0; }
    .toast-close {
      width: 24px;
      height: 24px;
      display: inline-grid;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: color-mix(in srgb, currentColor 14%, transparent);
      color: inherit;
      padding: 0;
      font: inherit;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
    }
    .toast-close:hover, .toast-close:focus-visible {
      background: color-mix(in srgb, currentColor 24%, transparent);
    }
    .toast-info { background: var(--pi-info); }
    .toast-success { background: var(--pi-success); }
    .toast-error { background: var(--pi-danger); }
    .toast-warning { background: var(--pi-warning); }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
  `;
}
