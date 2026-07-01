import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ExtensionOverlay as ExtensionOverlayState } from "../api";
import type { SessionInputQuestion, SessionInputRequest } from "../sessionInputRequests";
import { activeInputQuestionForOverlay, terminalInputSequenceForCustomAnswer, terminalInputSequenceForOption, type ActiveInputQuestion } from "../sessionInputRequestOverlay";

@customElement("extension-overlay")
export class ExtensionOverlay extends LitElement {
  @property({ attribute: false }) overlay?: ExtensionOverlayState;
  @property({ attribute: false }) inputRequest?: SessionInputRequest;
  @property({ attribute: false }) onClose?: (requestId: string) => void | Promise<void>;
  @property({ attribute: false }) onRespond?: (requestId: string, value: string) => void | Promise<void>;
  @property({ attribute: false }) onInput?: (requestId: string, data: string) => void | Promise<void>;
  @state() private answerText = "";
  @state() private customText = "";
  @state() private responding = false;
  @state() private error: string | undefined = undefined;
  private previousOverlayKey: string | undefined;

  override render() {
    const overlay = this.overlay;
    if (overlay === undefined) return null;
    const activeQuestion = activeInputQuestionForOverlay(this.inputRequest, overlay);
    if (activeQuestion !== undefined) return this.renderInputRequestDialog(overlay, activeQuestion);
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

  protected override willUpdate(): void {
    const overlay = this.overlay;
    const key = overlay === undefined ? undefined : overlay.requestId;
    if (key === this.previousOverlayKey) return;
    this.previousOverlayKey = key;
    this.answerText = "";
    this.customText = "";
    this.responding = false;
    this.error = undefined;
  }

  override firstUpdated(): void {
    this.renderRoot.querySelector<HTMLElement>("section")?.focus();
  }

  protected override updated(): void {
    if (this.renderRoot instanceof ShadowRoot && this.renderRoot.activeElement !== null) return;
    this.renderRoot.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }

  private renderInputRequestDialog(overlay: ExtensionOverlayState, activeQuestion: ActiveInputQuestion) {
    const question = activeQuestion.question;
    const hasOptions = question.options.length > 0;
    const total = this.inputRequest?.questions.length ?? 1;
    return html`
      <div class="backdrop" @mousedown=${() => { this.close(); }}>
        <section class="question-dialog" role="dialog" aria-modal="true" aria-labelledby="extension-question-title" @mousedown=${(event: MouseEvent) => { event.stopPropagation(); }} @keydown=${(event: KeyboardEvent) => { if (event.key === "Escape") this.close(); }}>
          <header>
            <div class="question-title-wrap">
              <strong id="extension-question-title">${question.header ?? overlay.title}</strong>
              ${total > 1 ? html`<span class="question-count">Question ${String(activeQuestion.index + 1)} of ${String(total)}</span>` : null}
            </div>
            ${overlay.closable ? html`<button type="button" title="Close" aria-label="Close" @click=${() => { this.close(); }}>×</button>` : null}
          </header>
          <div class="question-content">
            <p class="question-text">${question.question}</p>
            ${hasOptions ? this.renderOptionQuestion(overlay, question) : this.renderTextQuestion(overlay)}
            ${this.error === undefined ? null : html`<p class="dialog-error" role="alert">${this.error}</p>`}
          </div>
        </section>
      </div>
    `;
  }

  private renderOptionQuestion(overlay: ExtensionOverlayState, question: SessionInputQuestion) {
    return html`
      <div class="option-list" aria-label="Options">
        ${question.options.map((option, index) => html`
          <button class="option-button" type="button" ?data-autofocus=${index === 0} ?disabled=${this.responding} @click=${() => { void this.submitOption(overlay.requestId, index); }}>
            <span class="option-label">${option.label}</span>
            ${option.description === undefined || option.description === "" ? null : html`<span class="option-description">${option.description}</span>`}
          </button>
        `)}
      </div>
      <form class="custom-answer" @submit=${(event: SubmitEvent) => { void this.submitCustomOption(event, overlay.requestId); }}>
        <label>
          <span>Other</span>
          <textarea rows="3" .value=${this.customText} ?disabled=${this.responding} placeholder="Type a custom answer" @input=${(event: Event) => { this.customText = textareaValue(event); }}></textarea>
        </label>
        <div class="dialog-actions">
          <button type="button" ?disabled=${this.responding} @click=${() => { this.close(); }}>Cancel</button>
          <button class="primary" type="submit" ?disabled=${this.responding || this.customText.trim() === ""}>Submit custom</button>
        </div>
      </form>
    `;
  }

  private renderTextQuestion(overlay: ExtensionOverlayState) {
    return html`
      <form class="text-answer" @submit=${(event: SubmitEvent) => { void this.submitTextAnswer(event, overlay.requestId); }}>
        <textarea data-autofocus rows="4" .value=${this.answerText} ?disabled=${this.responding} placeholder="Type your answer" @input=${(event: Event) => { this.answerText = textareaValue(event); }}></textarea>
        <div class="dialog-actions">
          <button type="button" ?disabled=${this.responding} @click=${() => { this.close(); }}>Cancel</button>
          <button class="primary" type="submit" ?disabled=${this.responding || this.answerText.trim() === ""}>Submit</button>
        </div>
      </form>
    `;
  }

  private async submitOption(requestId: string, index: number): Promise<void> {
    await this.withResponseState(async () => {
      await this.sendInputSequence(requestId, terminalInputSequenceForOption(index));
    });
  }

  private async submitCustomOption(event: SubmitEvent, requestId: string): Promise<void> {
    event.preventDefault();
    const answer = this.customText.trim();
    if (answer === "") return;
    await this.withResponseState(async () => {
      await this.sendInputSequence(requestId, terminalInputSequenceForCustomAnswer(answer));
    });
  }

  private async submitTextAnswer(event: SubmitEvent, requestId: string): Promise<void> {
    event.preventDefault();
    const answer = this.answerText.trim();
    if (answer === "") return;
    await this.withResponseState(async () => {
      if (this.onRespond === undefined) throw new Error("Input response handler is not available.");
      await this.onRespond(requestId, answer);
    });
  }

  private async sendInputSequence(requestId: string, sequence: readonly string[]): Promise<void> {
    if (this.onInput === undefined) throw new Error("Input response handler is not available.");
    for (const input of sequence) await this.onInput(requestId, input);
  }

  private async withResponseState(action: () => Promise<void>): Promise<void> {
    if (this.responding) return;
    this.responding = true;
    this.error = undefined;
    try {
      await action();
    } catch (error: unknown) {
      this.error = error instanceof Error ? error.message : String(error);
      this.responding = false;
    }
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const overlay = this.overlay;
    if (overlay === undefined) return;
    const data = terminalInputFromKeyboardEvent(event);
    if (data === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    if (this.onInput !== undefined) {
      void this.onInput(overlay.requestId, data);
      return;
    }
    if (event.key === "Escape") this.close();
  }

  private close(): void {
    const overlay = this.overlay;
    if (overlay?.closable !== true) return;
    void this.onClose?.(overlay.requestId);
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
    button:disabled, textarea:disabled { opacity: .62; cursor: default; }
    pre { min-height: 0; margin: 0; padding: 14px 16px 18px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--pi-text); font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; scrollbar-width: thin; }
    .working-dot { width: 9px; height: 9px; border-radius: 999px; background: var(--pi-accent); box-shadow: 0 0 0 0 color-mix(in srgb, var(--pi-accent) 45%, transparent); animation: pulse 1.1s ease-out infinite; }
    .question-dialog { width: min(680px, 100%); min-height: 0; grid-template-rows: auto minmax(0, 1fr); }
    .question-dialog header { grid-template-columns: minmax(0, 1fr) auto; }
    .question-title-wrap { min-width: 0; display: grid; gap: 2px; }
    .question-count { color: var(--pi-muted); font-size: 12px; }
    .question-content { min-height: 0; display: grid; gap: 14px; padding: 16px; overflow: auto; }
    .question-text { margin: 0; color: var(--pi-text-bright); font-size: 15px; line-height: 1.45; overflow-wrap: anywhere; }
    .option-list { display: grid; gap: 8px; min-width: 0; }
    .option-button { width: 100%; height: auto; min-height: 44px; display: grid; gap: 3px; justify-items: start; text-align: left; padding: 9px 10px; }
    .option-label { color: var(--pi-text-bright); font-weight: 650; line-height: 1.3; }
    .option-description { color: var(--pi-muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .text-answer, .custom-answer { display: grid; gap: 10px; min-width: 0; }
    .custom-answer { border-top: 1px solid color-mix(in srgb, var(--pi-border-muted) 70%, transparent); padding-top: 12px; }
    label { display: grid; gap: 6px; min-width: 0; color: var(--pi-muted); font-size: 12px; font-weight: 600; }
    textarea { box-sizing: border-box; width: 100%; min-width: 0; resize: vertical; border: 1px solid color-mix(in srgb, var(--pi-border) 76%, #fff 8%); border-radius: 8px; background: color-mix(in srgb, var(--pi-surface) 80%, var(--pi-bg) 20%); color: var(--pi-text-bright); padding: 9px 10px; font: 13px/1.45 system-ui, sans-serif; }
    textarea:focus { outline: none; border-color: color-mix(in srgb, var(--pi-accent) 70%, var(--pi-border)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--pi-accent) 22%, transparent); }
    .dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .dialog-actions button { width: auto; min-width: 76px; height: 34px; padding: 0 10px; }
    .dialog-actions .primary { border-color: color-mix(in srgb, var(--pi-accent) 55%, var(--pi-border)); background: color-mix(in srgb, var(--pi-accent) 28%, var(--pi-surface)); color: var(--pi-text-bright); }
    .dialog-error { margin: 0; color: var(--pi-danger); font-size: 13px; }
    @keyframes pulse {
      0% { transform: scale(.82); box-shadow: 0 0 0 0 color-mix(in srgb, var(--pi-accent) 45%, transparent); }
      70% { transform: scale(1); box-shadow: 0 0 0 10px transparent; }
      100% { transform: scale(.82); box-shadow: 0 0 0 0 transparent; }
    }
  `;
}

function textareaValue(event: Event): string {
  return event.target instanceof HTMLTextAreaElement ? event.target.value : "";
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
