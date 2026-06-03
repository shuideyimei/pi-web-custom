import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { AppAction } from "../actions";
import { configApi, type PiWebConfigEnvOverrides, type PiWebConfigResponse, type PiWebConfigValues } from "../api";
import { formatShortcut } from "../keyboardShortcuts";
import type { SettingsSection } from "../settingsRoute";

interface ConfigDraft {
  host: string;
  port: string;
  allowedHostsMode: "list" | "all";
  allowedHostsText: string;
}

@customElement("settings-dialog")
export class SettingsDialog extends LitElement {
  @property({ attribute: false }) section: SettingsSection = "general";
  @property({ attribute: false }) actions: AppAction[] = [];
  @property({ attribute: false }) onNavigate?: (section: SettingsSection) => void;
  @property({ attribute: false }) onClose?: () => void;
  @state() private configResponse: PiWebConfigResponse | undefined;
  @state() private draft: ConfigDraft = emptyDraft();
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = "";
  @state() private savedMessage = "";

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadConfig();
  }

  override render(): TemplateResult {
    return html`
      <div class="backdrop" @mousedown=${() => this.onClose?.()}>
        <section class="settings-shell" role="dialog" aria-modal="true" aria-label="PI WEB settings" @mousedown=${(event: MouseEvent) => { event.stopPropagation(); }} @keydown=${(event: KeyboardEvent) => { this.handleKeyDown(event); }}>
          <header class="settings-header">
            <div>
              <span class="eyebrow">Settings</span>
              <h1>PI WEB</h1>
            </div>
            <button class="close-button" title="Close settings" aria-label="Close settings" @click=${() => this.onClose?.()}>×</button>
          </header>
          <div class="settings-body">
            <nav class="settings-nav" aria-label="Settings sections">
              ${this.renderNavButton("general", "General", "Server config")}
              ${this.renderNavButton("shortcuts", "Keyboard", "Shortcuts")}
            </nav>
            <main class="settings-content">
              ${this.section === "shortcuts" ? this.renderShortcuts() : this.renderGeneral()}
            </main>
          </div>
        </section>
      </div>
    `;
  }

  private renderNavButton(section: SettingsSection, label: string, detail: string): TemplateResult {
    const selected = this.section === section;
    return html`
      <button class=${selected ? "selected" : ""} aria-current=${selected ? "page" : "false"} @click=${() => { this.navigate(section); }}>
        <strong>${label}</strong>
        <small>${detail}</small>
      </button>
    `;
  }

  private renderGeneral(): TemplateResult {
    const config = this.configResponse;
    return html`
      <div class="section-heading">
        <div>
          <h2>General configuration</h2>
          <p>Update the JSON config file PI WEB is using. Host and port changes are saved immediately, but require the web service to restart before the running server binds to the new address.</p>
        </div>
        <button class="secondary" ?disabled=${this.loading} @click=${() => { void this.loadConfig(); }}>Reload</button>
      </div>
      ${this.renderMessages()}
      ${config === undefined && this.loading ? html`<div class="loading-card">Loading configuration…</div>` : html`
        <div class="config-path-card">
          <span>Config file</span>
          <code>${config?.path ?? "Unknown"}</code>
          <small>${config?.exists === true ? "Existing file" : "This file will be created on save"}</small>
        </div>
        <form class="config-form" @submit=${(event: Event) => { void this.saveConfig(event); }}>
          <label class="field">
            <span class="field-heading">
              <span>Host</span>
              ${this.renderOverrideBadge("host")}
            </span>
            <input .value=${this.draft.host} placeholder="127.0.0.1" autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateDraft({ host: inputValue(event) }); }}>
            <small>Address the web server should bind to. Leave empty to use PI WEB's default.</small>
          </label>

          <label class="field">
            <span class="field-heading">
              <span>Port</span>
              ${this.renderOverrideBadge("port")}
            </span>
            <input .value=${this.draft.port} inputmode="numeric" pattern="[0-9]*" placeholder="8504" autocomplete="off" @input=${(event: Event) => { this.updateDraft({ port: inputValue(event) }); }}>
            <small>TCP port from 1 to 65535. Leave empty to use PI WEB's default.</small>
          </label>

          <div class="field">
            <span class="field-heading">
              <span>Allowed hosts</span>
              ${this.renderOverrideBadge("allowedHosts")}
            </span>
            <select .value=${this.draft.allowedHostsMode} @change=${(event: Event) => { this.updateDraft({ allowedHostsMode: selectValue(event) === "all" ? "all" : "list" }); }}>
              <option value="list">Only listed hosts</option>
              <option value="all">Allow every host</option>
            </select>
            <textarea .value=${this.draft.allowedHostsText} ?disabled=${this.draft.allowedHostsMode === "all"} rows="4" placeholder="example.local&#10;192.168.1.20" spellcheck="false" @input=${(event: Event) => { this.updateDraft({ allowedHostsText: textAreaValue(event) }); }}></textarea>
            <small>Enter one host per line, or choose “Allow every host” to write <code>true</code>.</small>
          </div>

          ${this.renderEffectiveConfig()}

          <footer class="form-actions">
            <button class="primary" ?disabled=${this.loading || this.saving}>${this.saving ? "Saving…" : "Save config"}</button>
          </footer>
        </form>
      `}
    `;
  }

  private renderMessages(): TemplateResult | null {
    if (this.error !== "") return html`<div class="message error-message">${this.error}</div>`;
    if (this.savedMessage !== "") return html`<div class="message success-message">${this.savedMessage}</div>`;
    return null;
  }

  private renderOverrideBadge(key: keyof PiWebConfigEnvOverrides): TemplateResult | null {
    if (this.configResponse?.envOverrides[key] !== true) return null;
    return html`<span class="override-badge">environment override</span>`;
  }

  private renderEffectiveConfig(): TemplateResult {
    const effective = this.configResponse?.effectiveConfig ?? {};
    return html`
      <section class="effective-card" aria-label="Effective configuration summary">
        <h3>Effective after environment overrides</h3>
        <dl>
          <div><dt>Host</dt><dd>${effective.host ?? html`<span class="muted">127.0.0.1 default</span>`}</dd></div>
          <div><dt>Port</dt><dd>${effective.port ?? html`<span class="muted">8504 default</span>`}</dd></div>
          <div><dt>Allowed hosts</dt><dd>${formatAllowedHosts(effective.allowedHosts)}</dd></div>
        </dl>
      </section>
    `;
  }

  private renderShortcuts(): TemplateResult {
    const groups = shortcutGroups(this.actions);
    return html`
      <div class="section-heading">
        <div>
          <h2>Keyboard shortcuts</h2>
          <p>This is the shortcut inventory that the editable shortcut UI will build on. It already supports deep links with <code>?settings=shortcuts</code>.</p>
        </div>
      </div>
      <div class="shortcut-note">Editing shortcuts will use this settings surface and persist to the same PI WEB config file in the next step.</div>
      ${groups.length === 0 ? html`<div class="loading-card">No actions registered.</div>` : groups.map((group) => html`
        <section class="shortcut-group">
          <h3>${group.name}</h3>
          <div class="shortcut-list">
            ${group.actions.map((action) => html`
              <div class="shortcut-row">
                <div class="shortcut-main">
                  <strong>${action.title}</strong>
                  ${action.description !== undefined && action.description !== "" ? html`<small>${action.description}</small>` : null}
                </div>
                ${action.shortcut !== undefined && action.shortcut !== "" ? html`<kbd>${formatShortcut(action.shortcut)}</kbd>` : html`<span class="unassigned">Unassigned</span>`}
              </div>
            `)}
          </div>
        </section>
      `)}
    `;
  }

  private navigate(section: SettingsSection): void {
    this.onNavigate?.(section);
  }

  private async loadConfig(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      const response = await configApi.config();
      this.configResponse = response;
      this.draft = draftFromConfig(response.config);
    } catch (error) {
      this.error = `Failed to load config: ${errorMessage(error)}`;
    } finally {
      this.loading = false;
    }
  }

  private async saveConfig(event: Event): Promise<void> {
    event.preventDefault();
    if (this.saving) return;
    this.saving = true;
    this.error = "";
    this.savedMessage = "";
    try {
      const response = await configApi.saveConfig(configFromDraft(this.draft));
      this.configResponse = response;
      this.draft = draftFromConfig(response.config);
      this.savedMessage = "Config saved.";
      window.setTimeout(() => {
        if (this.savedMessage === "Config saved.") this.savedMessage = "";
      }, 3000);
    } catch (error) {
      this.error = `Failed to save config: ${errorMessage(error)}`;
    } finally {
      this.saving = false;
    }
  }

  private updateDraft(patch: Partial<ConfigDraft>): void {
    this.draft = { ...this.draft, ...patch };
    this.savedMessage = "";
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.onClose?.();
  }

  static override styles = css`
    :host { position: fixed; inset: 0; z-index: 30; color: var(--pi-text); font: 14px system-ui, sans-serif; }
    .backdrop { box-sizing: border-box; width: 100%; height: 100dvh; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); background: var(--pi-overlay); overflow: hidden; }
    .settings-shell { width: min(980px, 100%); max-height: min(760px, 100%); min-height: min(620px, 100%); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--pi-border); border-radius: 14px; background: var(--pi-bg); box-shadow: 0 20px 60px var(--pi-shadow-strong); overflow: hidden; }
    .settings-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--pi-border); }
    .eyebrow { display: block; color: var(--pi-muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 20px; line-height: 1.2; }
    h2 { font-size: 17px; line-height: 1.25; }
    h3 { font-size: 13px; line-height: 1.3; }
    p { color: var(--pi-muted); line-height: 1.45; }
    button, input, select, textarea { font: inherit; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .close-button { width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--pi-muted); padding: 0; font-size: 24px; }
    .close-button:hover, .close-button:focus { color: var(--pi-text); background: var(--pi-surface-hover); }
    .settings-body { min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
    .settings-nav { min-height: 0; padding: 10px; border-right: 1px solid var(--pi-border); background: var(--pi-surface); overflow: auto; }
    .settings-nav button { display: grid; gap: 2px; width: 100%; margin: 0 0 6px; text-align: left; border-color: transparent; background: transparent; }
    .settings-nav button:hover, .settings-nav button:focus { background: var(--pi-surface-hover); }
    .settings-nav button.selected { border-color: var(--pi-accent); background: var(--pi-selection-bg); }
    .settings-nav small { color: var(--pi-muted); }
    .settings-content { min-width: 0; min-height: 0; overflow: auto; padding: 18px; }
    .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .section-heading > div { display: grid; gap: 6px; min-width: 0; }
    .secondary { flex: 0 0 auto; }
    .message, .loading-card, .config-path-card, .effective-card, .shortcut-note { border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 12px; }
    .message { margin-bottom: 12px; }
    .error-message { border-color: var(--pi-danger); color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 10%, var(--pi-surface)); }
    .success-message { border-color: var(--pi-success-border); color: var(--pi-success); background: var(--pi-success-surface); }
    .loading-card { color: var(--pi-muted); }
    .config-path-card { display: grid; gap: 5px; margin-bottom: 14px; }
    .config-path-card span, .field-heading, dt { color: var(--pi-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    code { border: 1px solid var(--pi-border-muted); border-radius: 5px; background: var(--pi-bg); padding: 1px 4px; color: var(--pi-text); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .config-path-card small, .field small, .shortcut-main small { color: var(--pi-muted); }
    .config-form { display: grid; gap: 14px; }
    .field { display: grid; gap: 7px; }
    .field-heading { display: flex; align-items: center; gap: 8px; }
    input, select, textarea { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); padding: 9px 10px; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: var(--pi-accent); box-shadow: 0 0 0 1px var(--pi-accent-border); }
    textarea { resize: vertical; min-height: 94px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    textarea:disabled { opacity: .55; }
    .override-badge { border: 1px solid var(--pi-warning-border); border-radius: 999px; color: var(--pi-warning); background: var(--pi-warning-surface); padding: 2px 7px; font-size: 11px; font-weight: 600; text-transform: none; }
    .effective-card { display: grid; gap: 10px; }
    .effective-card dl { display: grid; gap: 8px; margin: 0; }
    .effective-card dl > div { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 12px; align-items: baseline; }
    dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .muted, .unassigned { color: var(--pi-muted); }
    .form-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 2px; }
    .primary { border-color: var(--pi-accent); background: var(--pi-selection-bg); color: var(--pi-text-bright); }
    .shortcut-note { margin-bottom: 14px; color: var(--pi-muted); }
    .shortcut-group { margin: 0 0 16px; }
    .shortcut-group h3 { margin: 0 0 8px; color: var(--pi-muted); font-size: 12px; text-transform: uppercase; }
    .shortcut-list { border: 1px solid var(--pi-border); border-radius: 10px; overflow: hidden; }
    .shortcut-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-surface); }
    .shortcut-row:last-child { border-bottom: 0; }
    .shortcut-main { min-width: 0; display: grid; gap: 3px; }
    .shortcut-main strong, .shortcut-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    kbd { justify-self: end; border: 1px solid var(--pi-border); border-radius: 6px; background: var(--pi-bg); color: var(--pi-text-secondary); padding: 3px 7px; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; }
    .unassigned { justify-self: end; font-size: 12px; }

    @media (max-width: 760px) {
      .backdrop { padding: 0; place-items: stretch; }
      .settings-shell { width: 100%; height: 100dvh; max-height: none; min-height: 0; border: 0; border-radius: 0; }
      .settings-header { padding: max(12px, env(safe-area-inset-top)) 12px 12px; }
      .settings-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
      .settings-nav { display: flex; gap: 8px; padding: 8px; border-right: 0; border-bottom: 1px solid var(--pi-border); overflow-x: auto; overflow-y: hidden; }
      .settings-nav button { flex: 0 0 auto; width: auto; min-width: 128px; margin: 0; }
      .settings-content { padding: 14px 12px calc(18px + env(safe-area-inset-bottom)); }
      .section-heading { display: grid; gap: 12px; }
      .section-heading .secondary { justify-self: start; }
      .effective-card dl > div { grid-template-columns: minmax(0, 1fr); gap: 3px; }
      .shortcut-row { grid-template-columns: minmax(0, 1fr); align-items: start; }
      kbd, .unassigned { justify-self: start; }
    }
  `;
}

function emptyDraft(): ConfigDraft {
  return { host: "", port: "", allowedHostsMode: "list", allowedHostsText: "" };
}

function draftFromConfig(config: PiWebConfigValues): ConfigDraft {
  return {
    host: config.host ?? "",
    port: config.port === undefined ? "" : String(config.port),
    allowedHostsMode: config.allowedHosts === true ? "all" : "list",
    allowedHostsText: Array.isArray(config.allowedHosts) ? config.allowedHosts.join("\n") : "",
  };
}

function configFromDraft(draft: ConfigDraft): PiWebConfigValues {
  const config: PiWebConfigValues = {};
  const host = draft.host.trim();
  const port = draft.port.trim();
  if (host !== "") config.host = host;
  if (port !== "") {
    const parsed = Number(port);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) throw new Error("Port must be an integer from 1 to 65535.");
    config.port = parsed;
  }
  config.allowedHosts = draft.allowedHostsMode === "all" ? true : parseAllowedHostsText(draft.allowedHostsText);
  return config;
}

function parseAllowedHostsText(value: string): string[] {
  return value.split(/[\n,]/u).map((host) => host.trim()).filter((host) => host !== "");
}

function formatAllowedHosts(value: PiWebConfigValues["allowedHosts"]): string | TemplateResult {
  if (value === true) return "Any host";
  if (Array.isArray(value)) return value.length === 0 ? html`<span class="muted">None listed</span>` : value.join(", ");
  return html`<span class="muted">Unset</span>`;
}

function shortcutGroups(actions: AppAction[]): { name: string; actions: AppAction[] }[] {
  const grouped = new Map<string, AppAction[]>();
  for (const action of [...actions].sort(compareActions)) {
    const group = action.group ?? "Other";
    grouped.set(group, [...(grouped.get(group) ?? []), action]);
  }
  return [...grouped.entries()].map(([name, groupActions]) => ({ name, actions: groupActions }));
}

function compareActions(left: AppAction, right: AppAction): number {
  return (left.group ?? "Other").localeCompare(right.group ?? "Other") || left.title.localeCompare(right.title);
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function selectValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : "";
}

function textAreaValue(event: Event): string {
  return event.target instanceof HTMLTextAreaElement ? event.target.value : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
