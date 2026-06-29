import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

/**
 * ThinkingNode — Codex-style compact thinking indicator.
 *
 * Displays a single-line status with shimmer sweep animation.
 * Thinking content is NEVER shown (Codex design: thinking is private).
 * Status phrases cycle through: Thinking…, Analyzing request…, Inspecting project…
 */
const STATUS_PHRASES = [
  "Thinking…",
  "Analyzing request…",
  "Inspecting project…",
  "Reasoning…",
  "Planning…",
] as const;

@customElement("thinking-node")
export class ThinkingNode extends LitElement {
  @property() text = "";
  @property({ type: Boolean }) streaming = false;
  @state() private phraseIndex = 0;
  private phraseTimer: number | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.streaming) this.startPhraseCycle();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopPhraseCycle();
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("streaming")) {
      if (this.streaming) this.startPhraseCycle();
      else this.stopPhraseCycle();
    }
  }

  private startPhraseCycle(): void {
    this.stopPhraseCycle();
    this.phraseTimer = window.setInterval(() => {
      this.phraseIndex = (this.phraseIndex + 1) % STATUS_PHRASES.length;
    }, 3000);
  }

  private stopPhraseCycle(): void {
    if (this.phraseTimer !== undefined) {
      window.clearInterval(this.phraseTimer);
      this.phraseTimer = undefined;
    }
  }

  override render() {
    const phrase = STATUS_PHRASES[this.phraseIndex] ?? STATUS_PHRASES[0];
    return html`
      <div class="thinking-node">
        <div class="thinking-header">
          <span class="thinking-label shimmer-text" aria-hidden="true">${phrase}</span>
          <span class="thinking-scan" aria-hidden="true"></span>
        </div>
      </div>
    `;
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }

    .thinking-node {
      display: grid;
      gap: 0;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    /* ── Single-line header ── */
    .thinking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 2px 0;
    }

    /* ── Shimmer text: Codex-style character sweep ── */
    .thinking-label {
      flex: 0 0 auto;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .shimmer-text {
      color: var(--pi-dim);
      background: linear-gradient(
        90deg,
        var(--pi-dim) 0%,
        var(--pi-text-secondary) 40%,
        var(--pi-dim) 60%,
        var(--pi-dim) 100%
      );
      background-size: 250% 100%;
      background-clip: text;
      -webkit-background-clip: text;
      animation: shimmer-sweep 2s ease-in-out infinite;
    }
    @keyframes shimmer-sweep {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }

    /* ── Scanning shimmer bar ── */
    .thinking-scan {
      flex: 1 1 auto;
      position: relative;
      height: 2px;
      min-width: 30px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--pi-border-muted) 30%, transparent);
      overflow: hidden;
    }
    .thinking-scan::after {
      content: "";
      position: absolute;
      top: 0;
      left: -30%;
      width: 30%;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--pi-accent) 50%, transparent), transparent);
      animation: thinking-scan 1.8s ease-in-out infinite;
    }
    @keyframes thinking-scan {
      0% { left: -30%; }
      100% { left: 100%; }
    }
  `;
}
