import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { activityShimmerStyles } from "./activityShimmerStyles";

/**
 * ThinkingNode — Codex-style compact thinking indicator.
 *
 * Displays a single-line status with shimmer sweep animation.
 * Thinking content is NEVER shown (Codex design: thinking is private).
 */
@customElement("thinking-node")
export class ThinkingNode extends LitElement {
  @property() text = "";
  @property({ type: Boolean }) streaming = false;

  override render() {
    return html`
      <div class=${this.streaming ? "thinking-node streaming" : "thinking-node"}>
        <div class="thinking-header">
          <span class=${this.streaming ? "thinking-label shimmer-text" : "thinking-label"}>Thinking</span>
        </div>
      </div>
    `;
  }

  static override styles = [activityShimmerStyles, css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }

    .thinking-node { display: grid; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; }
    .thinking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      min-width: 0;
      box-sizing: border-box;
      padding: 4px 0;
      border: 0;
      border-radius: 4px;
      background: transparent;
      overflow: hidden;
    }
    .thinking-label {
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 600;
      color: var(--activity-row-text);
    }
  `];
}
