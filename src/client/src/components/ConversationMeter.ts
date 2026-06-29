import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

@customElement("conversation-meter")
export class ConversationMeter extends LitElement {
  @property({ type: Number }) positionPercent = 0;
  @property({ type: Number }) loadedPercent = 100;

  @state() private visualPositionPercent: number | undefined;
  private dragging = false;
  private lastDragPercent = 0;

  override render() {
    const position = clampPercent(this.visualPositionPercent ?? this.positionPercent);
    const loaded = clampPercent(this.loadedPercent);
    const label = `Message position: about ${String(Math.round(position))}% through conversation. ${String(Math.round(loaded))}% of messages loaded.`;
    return html`
      <div
        class="meter"
        style=${`--position:${position.toFixed(2)}%;`}
        role="slider"
        tabindex="0"
        aria-label=${label}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${String(Math.round(position))}
        title=${label}
        @pointerdown=${this.onPointerDown}
        @keydown=${this.onKeyDown}
      >
        <div class="track" aria-hidden="true">
          <div class="progress"></div>
          <div class="marker"></div>
        </div>
      </div>
    `;
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!(event.currentTarget instanceof HTMLElement)) return;
    this.dragging = true;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    this.seekFromPointer(event);
    event.currentTarget.addEventListener("pointermove", this.onPointerMove);
    event.currentTarget.addEventListener("pointerup", this.onPointerEnd);
    event.currentTarget.addEventListener("pointercancel", this.onPointerEnd);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.dragging) return;
    this.seekFromPointer(event);
  };

  private readonly onPointerEnd = (event: PointerEvent): void => {
    this.dragging = false;
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.removeEventListener("pointermove", this.onPointerMove);
      event.currentTarget.removeEventListener("pointerup", this.onPointerEnd);
      event.currentTarget.removeEventListener("pointercancel", this.onPointerEnd);
    }
    this.emitSeek(this.lastDragPercent, false);
    window.setTimeout(() => {
      if (!this.dragging) this.visualPositionPercent = undefined;
    }, 80);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    const step = event.shiftKey ? 10 : 3;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      this.emitSeek(this.positionPercent - step);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      this.emitSeek(this.positionPercent + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.emitSeek(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.emitSeek(100);
    }
  };

  private seekFromPointer(event: PointerEvent): void {
    const track = this.renderRoot.querySelector(".track");
    if (!(track instanceof HTMLElement)) return;
    const bounds = track.getBoundingClientRect();
    const percent = clampPercent(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100);
    this.lastDragPercent = percent;
    this.visualPositionPercent = percent;
    this.syncMeterPosition(percent);
    this.emitSeek(percent, true);
  }

  private syncMeterPosition(percent: number): void {
    const meter = this.renderRoot.querySelector<HTMLElement>(".meter");
    if (meter !== null) meter.style.setProperty("--position", `${clampPercent(percent).toFixed(2)}%`);
  }

  private emitSeek(percent: number, dragging = false): void {
    this.dispatchEvent(new CustomEvent<{ percent: number; dragging: boolean }>("conversation-meter-seek", {
      detail: { percent: clampPercent(percent), dragging },
      bubbles: true,
      composed: true,
    }));
  }

  static override styles = css`
    :host { position: absolute; top: -4px; left: 16px; right: 16px; z-index: 6; display: block; height: 12px; opacity: .58; transition: opacity .15s ease; }
    :host(:hover), :host(:focus-within) { opacity: .92; }
    .meter { height: 100%; cursor: grab; touch-action: none; outline: none; }
    .meter:active { cursor: grabbing; }
    .meter:focus-visible .track { box-shadow: 0 0 0 2px var(--pi-accent-border); }
    .track { position: relative; height: 4px; margin-top: 4px; border-radius: 999px; background: color-mix(in srgb, var(--pi-border-muted) 34%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--pi-bg) 55%, transparent); }
    .progress { position: absolute; left: 0; width: var(--position); top: 0; bottom: 0; border-radius: 999px; background: color-mix(in srgb, var(--pi-accent) 42%, var(--pi-border-muted)); }
    .marker { position: absolute; left: var(--position); top: 50%; width: 10px; height: 10px; border: 2px solid var(--pi-bg); border-radius: 50%; background: var(--pi-accent); box-shadow: 0 2px 8px var(--pi-shadow); transform: translate(-50%, -50%); }
  `;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
