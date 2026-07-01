import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";

export interface MachineDialogSubmit {
  name: string;
  baseUrl: string;
  token?: string;
}

@customElement("machine-dialog")
export class MachineDialog extends LitElement {
  @property({ attribute: false }) onSubmit?: (input: MachineDialogSubmit) => void | Promise<void>;
  @property({ attribute: false }) onCancel?: () => void;
  @property() error = "";

  @state() private url = "";
  @state() private name = "";
  @state() private token = "";
  @state() private submitting = false;
  @query("input[name='baseUrl']") private urlInput?: HTMLInputElement;
  @query("input[name='name']") private nameInput?: HTMLInputElement;

  private nameEdited = false;
  private previousSuggestedName = "";

  override firstUpdated(): void {
    this.urlInput?.focus();
  }

  private handleUrlInput(event: InputEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const url = event.target.value;
    const suggestedName = suggestedMachineNameFromUrl(url);
    if (!this.nameEdited || this.name.trim() === "" || this.name === this.previousSuggestedName) this.name = suggestedName;
    this.previousSuggestedName = suggestedName;
    this.url = url;
  }

  private handleNameInput(event: InputEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.nameEdited = true;
    this.name = event.target.value;
  }

  private handleTokenInput(event: InputEvent): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.token = event.target.value;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.onCancel?.();
      return;
    }
    if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.name === "baseUrl" && machineBaseUrlValidationMessage(this.url) === undefined) {
      event.preventDefault();
      void this.updateComplete.then(() => {
        this.nameInput?.focus();
        this.nameInput?.select();
      });
    }
  }

  private handleSubmit(event: SubmitEvent): void {
    event.preventDefault();
    void this.submit();
  }

  private async submit(): Promise<void> {
    const input = this.validInput();
    if (input === undefined || this.submitting) return;
    this.submitting = true;
    try {
      await this.onSubmit?.(input);
    } finally {
      if (this.isConnected) this.submitting = false;
    }
  }

  private validInput(): MachineDialogSubmit | undefined {
    const baseUrl = this.url.trim();
    const name = this.name.trim();
    if (baseUrl === "" || name === "" || machineBaseUrlValidationMessage(baseUrl) !== undefined) return undefined;
    const token = this.token.trim();
    return { name, baseUrl, ...(token === "" ? {} : { token }) };
  }

  override render() {
    const hasUrl = this.url.trim() !== "";
    const urlError = hasUrl ? machineBaseUrlValidationMessage(this.url) : undefined;
    const canSubmit = this.validInput() !== undefined && !this.submitting;
    return html`
      <div class="backdrop" @click=${() => this.onCancel?.()}>
        <section role="dialog" aria-modal="true" aria-label="Add machine" @click=${(event: Event) => { event.stopPropagation(); }}>
          <form @submit=${(event: SubmitEvent) => { this.handleSubmit(event); }} @keydown=${(event: KeyboardEvent) => { this.handleKeyDown(event); }}>
            <header>
              <strong>Add machine</strong>
              <button type="button" @click=${() => { this.onCancel?.(); }} aria-label="Close">×</button>
            </header>
            <div class="body">
              ${this.error === "" ? null : html`<div class="dialog-error" role="alert">${this.error}</div>`}
              <label>
                Remote PI WEB URL
                <input name="baseUrl" type="url" .value=${this.url} @input=${(event: InputEvent) => { this.handleUrlInput(event); }} placeholder="http://dev-box.local:8504" autocomplete="url" inputmode="url" autofocus />
              </label>
              <small class=${urlError === undefined ? "hint" : "field-error"}>${urlError ?? "Enter the reachable base URL first, including http:// or https://."}</small>
              ${hasUrl ? html`
                <label>
                  Machine name
                  <input name="name" type="text" .value=${this.name} @input=${(event: InputEvent) => { this.handleNameInput(event); }} placeholder=${this.previousSuggestedName || "Dev Box"} autocomplete="off" />
                </label>
                <small class="hint">Suggested from the URL. Edit it to use a friendlier sidebar label.</small>
                <label>
                  Bearer token <span class="optional">optional</span>
                  <input name="token" type="password" .value=${this.token} @input=${(event: InputEvent) => { this.handleTokenInput(event); }} placeholder="Leave blank if the remote machine does not require one" autocomplete="off" />
                </label>
                <small class="hint">Paste only the token value; PI WEB sends it as an Authorization: Bearer header.</small>
              ` : html`<p class="hint intro">After you enter a URL, PI WEB will suggest a machine name and let you add an optional bearer token.</p>`}
            </div>
            <footer>
              <button type="button" @click=${() => { this.onCancel?.(); }}>Cancel</button>
              <button class="primary" type="submit" ?disabled=${!canSubmit}>${this.submitting ? "Adding…" : "Add machine"}</button>
            </footer>
          </form>
        </section>
      </div>
    `;
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 30;
      color: var(--pi-text);
      font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --codex-dialog-backdrop: var(--pi-backdrop);
      --codex-dialog-surface: var(--pi-elevated-bg);
      --codex-dialog-panel: color-mix(in srgb, var(--pi-surface) 78%, var(--pi-bg) 22%);
      --codex-dialog-panel-hover: color-mix(in srgb, var(--pi-text) 9%, transparent);
      --codex-dialog-border: var(--pi-elevated-border);
      --codex-dialog-hairline: color-mix(in srgb, var(--pi-border-muted) 70%, transparent);
      --codex-dialog-focus: color-mix(in srgb, var(--pi-text-bright) 34%, var(--pi-accent) 66%);
    }
    .backdrop { display: grid; place-items: start center; width: 100%; height: 100dvh; box-sizing: border-box; padding: min(12dvh, 92px) 20px max(20px, env(safe-area-inset-bottom)); background: var(--codex-dialog-backdrop); backdrop-filter: blur(18px) saturate(115%); -webkit-backdrop-filter: blur(18px) saturate(115%); overflow: hidden; }
    section { width: min(560px, 100%); max-height: min(640px, calc(100dvh - min(12dvh, 92px) - max(20px, env(safe-area-inset-bottom)))); border: 1px solid var(--codex-dialog-border); border-radius: 18px; background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 80px), var(--codex-dialog-surface); box-shadow: 0 24px 80px var(--pi-backdrop), 0 1px 0 var(--pi-inset-highlight) inset; overflow: hidden; }
    form { display: flex; flex-direction: column; max-height: inherit; min-height: 0; }
    header, footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 58%, transparent); }
    header strong { color: var(--pi-text-secondary); font-size: 13px; font-weight: 650; letter-spacing: .01em; }
    footer { border-top: 1px solid var(--codex-dialog-hairline); border-bottom: 0; justify-content: end; }
    .body { display: grid; gap: 10px; min-height: 0; overflow: auto; padding: 16px; }
    label { display: grid; gap: 7px; color: var(--pi-muted); }
    input { box-sizing: border-box; width: 100%; border: 1px solid var(--codex-dialog-border); border-radius: 13px; background: var(--codex-dialog-panel); color: var(--pi-text); padding: 10px 12px; outline: none; font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; box-shadow: 0 1px 0 var(--pi-inset-highlight) inset; }
    input:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
    .hint { color: var(--pi-muted); }
    .intro { margin: 4px 0 0; line-height: 1.45; }
    .optional { color: var(--pi-muted); font-weight: 400; }
    .field-error { color: var(--pi-danger); }
    .dialog-error { border: 1px solid color-mix(in srgb, var(--pi-danger) 70%, var(--codex-dialog-border)); border-radius: 12px; background: color-mix(in srgb, var(--pi-danger) 10%, transparent); color: var(--pi-danger); padding: 10px 11px; line-height: 1.35; }
    button { border: 1px solid var(--codex-dialog-border); border-radius: 12px; background: var(--codex-dialog-panel); color: var(--pi-text); padding: 8px 11px; font: inherit; cursor: pointer; }
    button:hover, button:focus { background: var(--codex-dialog-panel-hover); }
    button:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
    header button { display: grid; place-items: center; width: 30px; height: 30px; border: 0; background: transparent; color: var(--pi-muted); padding: 0; font-size: 20px; line-height: 1; }
    header button:hover, header button:focus { color: var(--pi-text-bright); background: var(--codex-dialog-panel-hover); }
    .primary { border-color: color-mix(in srgb, var(--pi-accent) 72%, var(--codex-dialog-border)); background: color-mix(in srgb, var(--pi-accent) 18%, var(--codex-dialog-panel)); color: var(--pi-text-bright); }
    button:disabled { opacity: .5; cursor: not-allowed; }
    @media (max-width: 640px) {
      .backdrop { padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); }
      section { max-height: calc(100dvh - max(12px, env(safe-area-inset-top)) - max(12px, env(safe-area-inset-bottom))); border-radius: 16px; }
    }
  `;
}

export function suggestedMachineNameFromUrl(value: string): string {
  const raw = value.trim();
  if (raw === "") return "";
  const parsed = parseUrlForSuggestion(raw) ?? parseUrlForSuggestion(`http://${raw.replace(/^\/+/u, "")}`);
  if (parsed !== undefined && parsed.hostname !== "") return parsed.hostname.replace(/^\[(.*)\]$/u, "$1");
  return fallbackSuggestedName(raw);
}

export function machineBaseUrlValidationMessage(value: string): string | undefined {
  const raw = value.trim();
  if (raw === "") return "Remote PI WEB URL is required.";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a valid URL including http:// or https://.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Use an http:// or https:// URL.";
  if (url.username !== "" || url.password !== "") return "Do not include credentials in the machine URL.";
  if (url.search !== "" || url.hash !== "") return "Do not include a query string or fragment.";
  return undefined;
}

function parseUrlForSuggestion(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function fallbackSuggestedName(value: string): string {
  const withoutProtocol = value.replace(/^[a-z][a-z\d+.-]*:\/\//iu, "");
  const withoutCredentials = withoutProtocol.slice(withoutProtocol.lastIndexOf("@") + 1);
  const host = withoutCredentials.split(/[/?#]/u)[0] ?? "";
  if (host.startsWith("[") && host.includes("]")) return host.slice(1, host.indexOf("]"));
  return host.replace(/:\d+$/u, "");
}
