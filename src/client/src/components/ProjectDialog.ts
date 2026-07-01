import { LitElement, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { api, type FileSuggestion } from "../api";
import { css } from "lit";

@customElement("project-dialog")
export class ProjectDialog extends LitElement {
  @property({ attribute: false }) onSubmit?: (path: string, create: boolean) => void;
  @property({ attribute: false }) onCancel?: () => void;
  @property() machineId = "local";
  @state() private path = "";
  @state() private createMissing = true;
  @state() private suggestions: FileSuggestion[] = [];
  @state() private selected = 0;
  @state() private loading = false;
  @query("input") private pathInput?: HTMLInputElement;

  private requestId = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadSuggestions();
  }

  override firstUpdated(): void {
    this.pathInput?.focus();
  }

  private async loadSuggestions() {
    const requestId = ++this.requestId;
    this.loading = true;
    try {
      const suggestions = await api.projectDirectories(this.path, this.machineId);
      if (requestId !== this.requestId) return;
      this.suggestions = suggestions;
      this.selected = Math.min(this.selected, Math.max(0, suggestions.length - 1));
    } catch {
      if (requestId === this.requestId) this.suggestions = [];
    } finally {
      if (requestId === this.requestId) this.loading = false;
    }
  }

  private setPath(value: string) {
    this.path = value;
    this.selected = 0;
    void this.loadSuggestions();
  }

  private pick(suggestion: FileSuggestion) {
    this.setPath(suggestion.path);
  }

  private submit() {
    if (this.path.trim() === "") return;
    this.onSubmit?.(this.path, this.createMissing);
  }

  private onPathInput(event: InputEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.setPath(event.target.value);
  }

  private onCreateMissingChange(event: InputEvent) {
    if (!(event.target instanceof HTMLInputElement)) return;
    this.createMissing = event.target.checked;
  }

  private onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.onCancel?.();
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.submit();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.selected = Math.min(this.selected + 1, Math.max(0, this.suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.selected = Math.max(0, this.selected - 1);
    } else if (event.key === "Tab") {
      const suggestion = this.suggestions[this.selected];
      if (suggestion === undefined) return;
      event.preventDefault();
      this.pick(suggestion);
    }
  }

  override render() {
    return html`
      <div class="backdrop" @click=${() => this.onCancel?.()}>
        <section role="dialog" aria-modal="true" aria-label="Add project" @click=${(event: Event) => { event.stopPropagation(); }}>
          <header>
            <strong>Add project</strong>
            <button @click=${() => { this.onCancel?.(); }} aria-label="Close">×</button>
          </header>
          <div class="body">
            <label>
              Project folder
              <input .value=${this.path} @input=${(event: InputEvent) => { this.onPathInput(event); }} @keydown=${(event: KeyboardEvent) => { this.onKeyDown(event); }} placeholder="/path/to/project or ~/code/project" autofocus />
            </label>
            <div class="suggestions">
              ${this.loading ? html`<div class="hint">Loading folders…</div>` : null}
              ${this.suggestions.map((suggestion, index) => html`
                <button class=${index === this.selected ? "selected" : ""} @click=${() => { this.pick(suggestion); }}>
                  ${suggestion.path}
                </button>
              `)}
              ${!this.loading && this.suggestions.length === 0 ? html`<div class="hint">No matching folders. Enter a new path to create it.</div>` : null}
            </div>
            <label class="check">
              <input type="checkbox" .checked=${this.createMissing} @change=${(event: InputEvent) => { this.onCreateMissingChange(event); }} />
              Create the folder if it does not exist
            </label>
          </div>
          <footer>
            <button @click=${() => { this.onCancel?.(); }}>Cancel</button>
            <button class="primary" ?disabled=${this.path.trim() === ""} @click=${() => { this.submit(); }}>Add project</button>
          </footer>
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
    section { width: min(720px, 100%); max-height: min(700px, calc(100dvh - min(12dvh, 92px) - max(20px, env(safe-area-inset-bottom)))); display: flex; flex-direction: column; border: 1px solid var(--codex-dialog-border); border-radius: 18px; background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 80px), var(--codex-dialog-surface); box-shadow: 0 24px 80px var(--pi-backdrop), 0 1px 0 var(--pi-inset-highlight) inset; overflow: hidden; }
    header, footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 58%, transparent); }
    header strong { color: var(--pi-text-secondary); font-size: 13px; font-weight: 650; letter-spacing: .01em; }
    footer { border-top: 1px solid var(--codex-dialog-hairline); border-bottom: 0; justify-content: end; }
    .body { display: grid; gap: 14px; min-height: 0; overflow: auto; padding: 16px; }
    label { display: grid; gap: 7px; color: var(--pi-muted); }
    input[type="text"], input:not([type]) { box-sizing: border-box; width: 100%; border: 1px solid var(--codex-dialog-border); border-radius: 13px; background: var(--codex-dialog-panel); color: var(--pi-text); padding: 10px 12px; outline: none; font: 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; box-shadow: 0 1px 0 var(--pi-inset-highlight) inset; }
    input:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
    .check { display: flex; grid-template-columns: auto 1fr; align-items: center; color: var(--pi-text); }
    .suggestions { min-height: 90px; max-height: 320px; overflow: auto; border: 1px solid var(--codex-dialog-border); border-radius: 13px; background: color-mix(in srgb, var(--codex-dialog-panel) 82%, transparent); padding: 5px; scrollbar-width: thin; }
    .suggestions button { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border: 0; border-radius: 10px; background: transparent; color: var(--pi-text); padding: 9px 10px; text-align: left; font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .suggestions button.selected, .suggestions button:hover { background: var(--codex-dialog-panel-hover); }
    .hint { padding: 12px; color: var(--pi-muted); }
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
