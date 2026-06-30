import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { AppAction } from "../actions";
import { configApi, pluginsApi, type PiWebConfigResponse, type PiWebConfigValues, type PiWebPluginsResponse } from "../api";
import type { SettingsSection } from "../settingsRoute";
import "./settings/SettingsGeneralPanel";
import "./settings/SettingsSessiondPanel";
import "./settings/SettingsPluginsPanel";
import "./settings/SettingsShortcutsPanel";

@customElement("settings-dialog")
export class SettingsDialog extends LitElement {
  @property({ attribute: false }) section: SettingsSection = "general";
  @property({ attribute: false }) actions: AppAction[] = [];
  @property({ attribute: false }) onNavigate?: (section: SettingsSection) => void;
  @property({ attribute: false }) onClose?: () => void;
  @property({ attribute: false }) onConfigSaved?: (config: PiWebConfigValues) => void;
  @state() private configResponse: PiWebConfigResponse | undefined;
  @state() private pluginsResponse: PiWebPluginsResponse | undefined;
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = "";
  @state() private savedMessage = "";
  private savedMessageTimer: number | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadConfig();
  }

  override disconnectedCallback(): void {
    if (this.savedMessageTimer !== undefined) window.clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = undefined;
    super.disconnectedCallback();
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
              ${this.renderNavButton("sessiond", "Session daemon", "Runtime settings")}
              ${this.renderNavButton("plugins", "Plugins", "Enable and disable")}
              ${this.renderNavButton("shortcuts", "Keyboard", "Shortcuts")}
            </nav>
            <main class="settings-content">
              ${this.renderActiveSection()}
            </main>
          </div>
        </section>
      </div>
    `;
  }

  private renderActiveSection(): TemplateResult {
    if (this.section === "sessiond") {
      return html`
        <settings-sessiond-panel
          .configResponse=${this.configResponse}
          .loading=${this.loading}
          .saving=${this.saving}
          .error=${this.error}
          .savedMessage=${this.savedMessage}
          .onReload=${() => this.loadConfig()}
          .onSave=${(config: PiWebConfigValues) => this.saveConfig(config)}
        ></settings-sessiond-panel>
      `;
    }
    if (this.section === "shortcuts") {
      return html`
        <settings-shortcuts-panel
          .actions=${this.actions}
          .configResponse=${this.configResponse}
          .loading=${this.loading}
          .saving=${this.saving}
          .error=${this.error}
          .savedMessage=${this.savedMessage}
          .onReload=${() => this.loadConfig()}
          .onSave=${(config: PiWebConfigValues) => this.saveConfig(config)}
        ></settings-shortcuts-panel>
      `;
    }
    if (this.section === "plugins") {
      return html`
        <settings-plugins-panel
          .configResponse=${this.configResponse}
          .pluginsResponse=${this.pluginsResponse}
          .loading=${this.loading}
          .saving=${this.saving}
          .error=${this.error}
          .savedMessage=${this.savedMessage}
          .onReload=${() => this.loadConfig()}
          .onTogglePlugin=${(pluginId: string, enabled: boolean) => this.togglePlugin(pluginId, enabled)}
        ></settings-plugins-panel>
      `;
    }
    return html`
      <settings-general-panel
        .configResponse=${this.configResponse}
        .loading=${this.loading}
        .saving=${this.saving}
        .error=${this.error}
        .savedMessage=${this.savedMessage}
        .onReload=${() => this.loadConfig()}
        .onSave=${(config: PiWebConfigValues) => this.saveConfig(config)}
      ></settings-general-panel>
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

  private navigate(section: SettingsSection): void {
    this.onNavigate?.(section);
  }

  private async loadConfig(): Promise<void> {
    this.loading = true;
    this.error = "";
    try {
      const [config, plugins] = await Promise.all([configApi.config(), pluginsApi.plugins()]);
      this.configResponse = config;
      this.pluginsResponse = plugins;
    } catch (error) {
      this.error = `Failed to load settings: ${errorMessage(error)}`;
    } finally {
      this.loading = false;
    }
  }

  private async togglePlugin(pluginId: string, enabled: boolean): Promise<void> {
    const baseConfig = this.configResponse?.config ?? {};
    const currentPlugins = baseConfig.plugins ?? {};
    const currentPluginConfig = currentPlugins[pluginId] ?? {};
    await this.saveConfig({
      ...baseConfig,
      plugins: {
        ...currentPlugins,
        [pluginId]: { ...currentPluginConfig, enabled },
      },
    });
    await this.refreshPlugins();
  }

  private async saveConfig(config: PiWebConfigValues): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.error = "";
    this.savedMessage = "";
    try {
      const response = await configApi.saveConfig(config);
      this.configResponse = response;
      this.onConfigSaved?.(response.effectiveConfig);
      this.showSavedMessage();
    } catch (error) {
      this.error = `Failed to save config: ${errorMessage(error)}`;
    } finally {
      this.saving = false;
    }
  }

  private async refreshPlugins(): Promise<void> {
    try {
      this.pluginsResponse = await pluginsApi.plugins();
    } catch (error) {
      this.error = `Failed to refresh plugins: ${errorMessage(error)}`;
    }
  }

  private showSavedMessage(): void {
    this.savedMessage = "Config saved.";
    if (this.savedMessageTimer !== undefined) window.clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = window.setTimeout(() => {
      if (this.savedMessage === "Config saved.") this.savedMessage = "";
      this.savedMessageTimer = undefined;
    }, 3000);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    this.onClose?.();
  }

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 30;
      color: var(--pi-text);
      font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --codex-dialog-backdrop: color-mix(in srgb, #000 62%, transparent);
      --codex-dialog-surface: color-mix(in srgb, var(--pi-bg) 88%, #111 12%);
      --codex-dialog-panel: color-mix(in srgb, var(--pi-surface) 78%, var(--pi-bg) 22%);
      --codex-dialog-panel-hover: color-mix(in srgb, var(--pi-text) 9%, transparent);
      --codex-dialog-border: color-mix(in srgb, var(--pi-border) 72%, #fff 10%);
      --codex-dialog-hairline: color-mix(in srgb, var(--pi-border-muted) 70%, transparent);
      --codex-dialog-focus: color-mix(in srgb, var(--pi-text-bright) 34%, var(--pi-accent) 66%);
    }
    .backdrop { box-sizing: border-box; width: 100%; height: 100dvh; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); background: var(--codex-dialog-backdrop); backdrop-filter: blur(18px) saturate(115%); -webkit-backdrop-filter: blur(18px) saturate(115%); overflow: hidden; }
    .settings-shell { width: min(980px, 100%); max-height: min(760px, 100%); min-height: min(620px, 100%); display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--codex-dialog-border); border-radius: 18px; background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 96px), var(--codex-dialog-surface); box-shadow: 0 24px 80px color-mix(in srgb, #000 62%, transparent), 0 1px 0 color-mix(in srgb, #fff 8%, transparent) inset; overflow: hidden; }
    .settings-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 58%, transparent); }
    .eyebrow { display: block; color: var(--pi-muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; color: var(--pi-text-bright); font-size: 20px; line-height: 1.2; }
    button { border: 1px solid var(--codex-dialog-border); border-radius: 12px; background: var(--codex-dialog-panel); color: var(--pi-text); padding: 8px 11px; font: inherit; cursor: pointer; }
    button:hover, button:focus { background: var(--codex-dialog-panel-hover); }
    button:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
    .close-button { width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--pi-muted); padding: 0; font-size: 23px; line-height: 1; }
    .close-button:hover, .close-button:focus { color: var(--pi-text-bright); background: var(--codex-dialog-panel-hover); }
    .settings-body { min-height: 0; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
    .settings-nav { min-height: 0; padding: 10px; border-right: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 72%, transparent); overflow: auto; scrollbar-width: thin; }
    .settings-nav button { display: grid; gap: 2px; width: 100%; margin: 0 0 6px; text-align: left; border-color: transparent; background: transparent; }
    .settings-nav button:hover, .settings-nav button:focus { background: var(--codex-dialog-panel-hover); }
    .settings-nav button.selected { border-color: color-mix(in srgb, var(--pi-text) 20%, transparent); background: color-mix(in srgb, var(--pi-text) 10%, transparent); }
    .settings-nav small { color: var(--pi-muted); }
    .settings-content { min-width: 0; min-height: 0; overflow: auto; padding: 18px; scrollbar-width: thin; }

    @media (max-width: 760px) {
      .backdrop { padding: 0; place-items: stretch; }
      .settings-shell { width: 100%; height: 100dvh; max-height: none; min-height: 0; border: 0; border-radius: 0; }
      .settings-header { padding: max(12px, env(safe-area-inset-top)) 12px 12px; }
      .settings-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
      .settings-nav { display: flex; gap: 8px; padding: 8px; border-right: 0; border-bottom: 1px solid var(--codex-dialog-hairline); overflow-x: auto; overflow-y: hidden; }
      .settings-nav button { flex: 0 0 auto; width: auto; min-width: 128px; margin: 0; }
      .settings-content { padding: 14px 12px calc(18px + env(safe-area-inset-bottom)); }
    }
  `;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
