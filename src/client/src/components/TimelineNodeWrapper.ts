import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { TimelineNodeStatus } from "./timelineAdapter";

/**
 * TimelineNodeWrapper — wraps every node on the execution stream.
 *
 * Layout: single-column content with slot for node content.
 */
@customElement("timeline-node-wrapper")
export class TimelineNodeWrapper extends LitElement {
  @property() status: TimelineNodeStatus = "idle";
  @property({ type: Boolean }) isLive = false;

  override render() {
    return html`
      <div class=${`tl-node tl-node--${this.status}${this.isLive ? " tl-node--live" : ""}`}>
        <div class="tl-content">
          <slot></slot>
        </div>
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; min-width: 0; }

    .tl-node {
      display: flex;
      align-items: flex-start;
      gap: 0;
      position: relative;
      min-width: 0;
    }

    .tl-content {
      flex: 1 1 auto;
      min-width: 0;
      padding-top: 1px;
      padding-bottom: 4px;
    }
  `;
}
