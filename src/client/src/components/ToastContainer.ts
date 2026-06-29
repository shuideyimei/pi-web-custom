import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";

export interface ToastItem {
  id: string;
  message: string;
  level: "info" | "success" | "error" | "warning";
  timestamp: number;
}

@customElement("toast-container")
export class ToastContainer extends LitElement {
  @property({ attribute: false }) toasts: ToastItem[] = [];
  @state() private visibleToasts: ToastItem[] = [];

  override updated(changed: Map<string, unknown>) {
    if (changed.has("toasts")) {
      this.syncVisibleToasts();
    }
  }

  private syncVisibleToasts() {
    const now = Date.now();
    this.visibleToasts = this.toasts.filter((toast) => now - toast.timestamp < 5000);
  }

  override render() {
    if (this.visibleToasts.length === 0) return null;
    return html`
      <div class="toast-container">
        ${this.visibleToasts.map((toast) => html`
          <div class="toast toast-${toast.level}">
            <span class="toast-message">${toast.message}</span>
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
    }
    .toast {
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      max-width: 400px;
      word-break: break-word;
      animation: toast-in 0.3s ease-out;
      pointer-events: auto;
    }
    .toast-info { background: #3b82f6; }
    .toast-success { background: #22c55e; }
    .toast-error { background: #ef4444; }
    .toast-warning { background: #f59e0b; }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(100%); }
      to { opacity: 1; transform: translateX(0); }
    }
  `;
}
