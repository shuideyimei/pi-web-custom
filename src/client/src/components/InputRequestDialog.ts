import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { SessionInputQuestion, SessionInputRequest } from "../sessionInputRequests";

@customElement("input-request-dialog")
export class InputRequestDialog extends LitElement {
  @property({ attribute: false }) request?: SessionInputRequest;
  @property({ attribute: false }) onAnswer?: (answer: string, question: SessionInputQuestion) => void | Promise<void>;
  @property({ attribute: false }) onStop?: () => void | Promise<void>;
  @state() private text = "";
  @state() private responding = false;
  @state() private dismissedRequestKey: string | undefined;

  override render() {
    const request = this.request;
    const question = request?.questions[0];
    if (request === undefined || question === undefined) return null;
    if (this.dismissedRequestKey === requestKey(request)) return null;
    const hasOptions = question.options.length > 0;
    return html`
      <div class="backdrop">
        <section role="dialog" aria-modal="true" aria-labelledby="input-request-title">
          <header>
            <div>
              <strong id="input-request-title">${question.header ?? "Input requested"}</strong>
              ${request.questions.length > 1 ? html`<span>${String(request.questions.length)} questions pending</span>` : null}
            </div>
            <button type="button" title="Stop" aria-label="Stop current request" ?disabled=${this.responding} @click=${() => { void this.stop(); }}>Stop</button>
          </header>
          <main>
            <p>${question.question}</p>
            ${hasOptions ? html`
              <div class="options">
                ${question.options.map((option) => html`
                  <button type="button" ?disabled=${this.responding} @click=${() => { void this.answer(option.label, question); }}>
                    <b>${option.label}</b>
                    ${option.description === undefined ? null : html`<span>${option.description}</span>`}
                  </button>
                `)}
              </div>
            ` : null}
            <form @submit=${(event: SubmitEvent) => { void this.submitText(event, question); }}>
              <label>
                <span>${hasOptions ? "Other" : "Answer"}</span>
                <textarea rows="4" .value=${this.text} ?disabled=${this.responding} @input=${(event: Event) => { this.text = event.target instanceof HTMLTextAreaElement ? event.target.value : ""; }}></textarea>
              </label>
              <div class="actions">
                <button type="button" ?disabled=${this.responding} @click=${() => { void this.stop(); }}>Cancel request</button>
                <button class="primary" type="submit" ?disabled=${this.responding || this.text.trim() === ""}>Submit</button>
              </div>
            </form>
          </main>
        </section>
      </div>
    `;
  }

  private async answer(answer: string, question: SessionInputQuestion): Promise<void> {
    if (this.responding) return;
    this.responding = true;
    try {
      await this.onAnswer?.(answer, question);
    } finally {
      this.responding = false;
    }
  }

  private async submitText(event: SubmitEvent, question: SessionInputQuestion): Promise<void> {
    event.preventDefault();
    const answer = this.text.trim();
    if (answer === "") return;
    await this.answer(answer, question);
  }

  private async stop(): Promise<void> {
    if (this.responding) return;
    const request = this.request;
    if (request !== undefined) this.dismissedRequestKey = requestKey(request);
    this.responding = true;
    try {
      await this.onStop?.();
    } finally {
      this.responding = false;
    }
  }

  static override styles = css`
    :host { position: fixed; inset: 0; z-index: 61; display: block; color: var(--pi-text); }
    .backdrop { display: grid; place-items: center; width: 100%; height: 100dvh; box-sizing: border-box; padding: 18px; background: color-mix(in srgb, #000 54%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
    section { width: min(680px, 100%); max-height: min(760px, 100%); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid color-mix(in srgb, var(--pi-border) 72%, #fff 10%); border-radius: 8px; background: var(--pi-bg); box-shadow: 0 24px 80px color-mix(in srgb, #000 58%, transparent); overflow: hidden; }
    header { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 14px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-surface); }
    header div { min-width: 0; display: grid; gap: 2px; }
    strong { color: var(--pi-text-bright); font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    header span, label span { color: var(--pi-muted); font-size: 12px; }
    main { min-height: 0; display: grid; gap: 14px; padding: 16px; overflow: auto; }
    p { margin: 0; color: var(--pi-text-bright); font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
    .options { display: grid; gap: 8px; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 8px 10px; font: inherit; cursor: pointer; }
    button:hover, button:focus { background: var(--pi-surface-hover); color: var(--pi-text-bright); }
    button:focus-visible, textarea:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
    button:disabled, textarea:disabled { opacity: .62; cursor: default; }
    .options button { display: grid; gap: 3px; text-align: left; }
    .options b { color: var(--pi-text-bright); }
    .options span { color: var(--pi-muted); font-size: 12px; }
    form, label { display: grid; gap: 8px; min-width: 0; }
    textarea { box-sizing: border-box; width: 100%; min-width: 0; resize: vertical; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text-bright); padding: 9px 10px; font: 13px/1.45 system-ui, sans-serif; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    .primary { border-color: color-mix(in srgb, var(--pi-accent) 55%, var(--pi-border)); background: color-mix(in srgb, var(--pi-accent) 28%, var(--pi-surface)); color: var(--pi-text-bright); }
  `;
}

function requestKey(request: SessionInputRequest): string {
  return request.toolCallId ?? `${request.toolName ?? "input"}:${request.questions.map((question) => question.id ?? question.question).join("\n")}`;
}
