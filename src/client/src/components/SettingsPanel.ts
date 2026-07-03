import { css, html, LitElement, svg, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { AppAction } from "../actions";
import { configApi, packagesApi, pluginsApi, type PiPackageScope, type PiPackagesResponse, type PiWebConfigResponse, type PiWebConfigValues, type PiWebPluginsResponse } from "../api";
import type { SettingsSection } from "../settingsRoute";
import "./settings/SettingsGeneralPanel";
import "./settings/SettingsSessiondPanel";
import "./settings/SettingsMarketplacePanel";
import "./settings/SettingsPluginsPanel";
import "./settings/SettingsShortcutsPanel";

type SettingsPresentation = "panel" | "dialog";
type SettingsNavIcon = "appearance" | "chat" | "notifications" | "sessions" | "snippets" | "agents" | "behavior" | "commands" | "mcp" | "plugins" | "providers" | "usage" | "skills" | "catalog";

interface SettingsNavItem {
  section: SettingsSection;
  label: string;
  detail: string;
  icon: SettingsNavIcon;
  keywords: readonly string[];
}

const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  { section: "appearance", label: "Appearance", detail: "Theme and display", icon: "appearance", keywords: ["theme", "color", "dark", "light"] },
  { section: "chat", label: "Chat", detail: "Composer behavior", icon: "chat", keywords: ["prompt", "enter", "conversation", "keyboard"] },
  { section: "notifications", label: "Notifications", detail: "Alerts and notices", icon: "notifications", keywords: ["alerts", "messages", "toast"] },
  { section: "sessiond", label: "Sessions", detail: "Runtime settings", icon: "sessions", keywords: ["session daemon", "runtime", "subsessions"] },
  { section: "snippets", label: "Snippets", detail: "Prompt packages", icon: "snippets", keywords: ["prompts", "templates", "packages", "marketplace"] },
  { section: "agents", label: "Agents", detail: "Agent capabilities", icon: "agents", keywords: ["spawn", "subagents", "runtime", "sessions"] },
  { section: "behavior", label: "Behavior", detail: "Server behavior", icon: "behavior", keywords: ["general", "host", "port", "paths", "allowed hosts"] },
  { section: "shortcuts", label: "Commands", detail: "Keyboard shortcuts", icon: "commands", keywords: ["commands", "hotkeys", "keybindings", "keyboard"] },
  { section: "mcp", label: "MCP", detail: "Install integrations", icon: "mcp", keywords: ["model context protocol", "packages", "marketplace"] },
  { section: "plugins", label: "Plugins", detail: "Enable and disable", icon: "plugins", keywords: ["extensions", "panels", "tools"] },
  { section: "providers", label: "Providers", detail: "Authentication", icon: "providers", keywords: ["auth", "login", "logout", "models", "api key"] },
  { section: "usage", label: "Usage", detail: "Token dashboard", icon: "usage", keywords: ["tokens", "cost", "stats", "dashboard"] },
  { section: "skills", label: "Skills", detail: "Install skill packages", icon: "skills", keywords: ["skills", "packages", "marketplace"] },
  { section: "skills-catalog", label: "Skills Catalog", detail: "Browse packages", icon: "catalog", keywords: ["catalog", "skills", "marketplace"] },
];

@customElement("settings-panel")
export class SettingsPanel extends LitElement {
  @property({ attribute: false }) section: SettingsSection = "appearance";
  @property({ attribute: false }) actions: AppAction[] = [];
  @property({ attribute: false }) projectCwd: string | undefined;
  @property({ reflect: true }) presentation: SettingsPresentation = "panel";
  @property({ attribute: false }) onNavigate?: (section: SettingsSection) => void;
  @property({ attribute: false }) onClose?: () => void;
  @property({ attribute: false }) onConfigSaved?: (config: PiWebConfigValues) => void;
  @property({ attribute: false }) onOpenThemePicker?: () => void;
  @property({ attribute: false }) onConfigureAuth?: () => void;
  @property({ attribute: false }) onLogoutAuth?: () => void;
  @property({ attribute: false }) onOpenUsageDashboard?: () => void;
  @state() private configResponse: PiWebConfigResponse | undefined;
  @state() private pluginsResponse: PiWebPluginsResponse | undefined;
  @state() private packagesResponse: PiPackagesResponse | undefined;
  @state() private loading = true;
  @state() private packagesLoading = true;
  @state() private saving = false;
  @state() private installingPackage = false;
  @state() private error = "";
  @state() private packageError = "";
  @state() private savedMessage = "";
  @state() private packageSavedMessage = "";
  @state() private settingsSearch = "";
  private savedMessageTimer: number | undefined;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadConfig();
    void this.loadPackages();
  }

  override disconnectedCallback(): void {
    if (this.savedMessageTimer !== undefined) window.clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = undefined;
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has("projectCwd")) void this.loadPackages();
  }

  override render(): TemplateResult {
    const navItems = this.filteredNavItems();
    return html`
      <section class="settings-shell" aria-label="PI WEB settings" @keydown=${(event: KeyboardEvent) => { this.handleKeyDown(event); }}>
        <header class="settings-header">
          <div>
            <span class="eyebrow">Settings</span>
            <h1>PI WEB</h1>
          </div>
          ${this.onClose === undefined ? null : html`<button class="close-button" title="Close settings" aria-label="Close settings" @click=${() => this.onClose?.()}>×</button>`}
        </header>
        <div class="settings-body">
          <aside class="settings-sidebar">
            <label class="settings-search">
              ${searchIcon()}
              <input type="search" placeholder="Search settings" autocomplete="off" spellcheck="false" .value=${this.settingsSearch} @input=${(event: Event) => { this.settingsSearch = inputValue(event); }}>
            </label>
            <nav class="settings-nav" aria-label="Settings sections">
              ${navItems.map((item) => this.renderNavButton(item))}
              ${navItems.length === 0 ? html`<p class="empty-nav">No settings match “${this.settingsSearch.trim()}”.</p>` : null}
            </nav>
          </aside>
          <main class="settings-content">
            ${this.renderActiveSection()}
          </main>
        </div>
      </section>
    `;
  }

  private renderActiveSection(): TemplateResult {
    switch (this.section) {
      case "appearance":
        return this.renderActionSection({
          title: "Appearance",
          body: "Choose the PI WEB theme and color behavior. The full theme picker opens as a focused command dialog.",
          actions: [{ label: "Open theme picker", primary: true, run: this.onOpenThemePicker }],
        });
      case "chat":
      case "shortcuts":
        return this.renderShortcutsPanel();
      case "notifications":
        return this.renderInfoSection("Notifications", "Notification preferences are not exposed in PI WEB yet. Runtime notices, toasts, and session activity indicators continue to use the current app defaults.");
      case "sessiond":
      case "agents":
        return this.renderSessionRuntimePanel();
      case "snippets":
      case "mcp":
      case "skills":
      case "skills-catalog":
      case "marketplace":
        return this.renderMarketplacePanel();
      case "plugins":
        return this.renderPluginsPanel();
      case "providers":
        return this.renderActionSection({
          title: "Providers",
          body: "Configure or remove stored provider authentication without sending a slash command to the active session.",
          actions: [
            { label: "Configure authentication", primary: true, run: this.onConfigureAuth },
            { label: "Remove authentication", run: this.onLogoutAuth },
          ],
        });
      case "usage":
        return this.renderActionSection({
          title: "Usage",
          body: "Open the token usage dashboard to review sessions, messages, active days, model metadata, and token history.",
          actions: [{ label: "Open usage dashboard", primary: true, run: this.onOpenUsageDashboard }],
        });
      case "behavior":
      case "general":
        return this.renderGeneralPanel();
    }
  }

  private renderGeneralPanel(): TemplateResult {
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

  private renderSessionRuntimePanel(): TemplateResult {
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

  private renderShortcutsPanel(): TemplateResult {
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

  private renderMarketplacePanel(): TemplateResult {
    return html`
      <settings-marketplace-panel
        .packagesResponse=${this.packagesResponse}
        .projectCwd=${this.projectCwd}
        .loading=${this.packagesLoading}
        .installing=${this.installingPackage}
        .error=${this.packageError}
        .savedMessage=${this.packageSavedMessage}
        .onReload=${() => this.loadPackages()}
        .onInstallPackage=${(source: string, scope: PiPackageScope) => this.installPackage(source, scope)}
      ></settings-marketplace-panel>
    `;
  }

  private renderPluginsPanel(): TemplateResult {
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

  private renderActionSection(options: { title: string; body: string; actions: readonly { label: string; primary?: boolean; run?: (() => void) | undefined }[] }): TemplateResult {
    return html`
      <section class="category-card">
        <div>
          <h2>${options.title}</h2>
          <p>${options.body}</p>
        </div>
        <div class="action-row">
          ${options.actions.map((action) => html`
            <button class=${action.primary === true ? "primary" : "secondary"} type="button" ?disabled=${action.run === undefined} @click=${() => { action.run?.(); }}>${action.label}</button>
          `)}
        </div>
      </section>
    `;
  }

  private renderInfoSection(title: string, body: string): TemplateResult {
    return html`
      <section class="category-card">
        <div>
          <h2>${title}</h2>
          <p>${body}</p>
        </div>
      </section>
    `;
  }

  private renderNavButton(item: SettingsNavItem): TemplateResult {
    const selected = this.selectedNavSection() === item.section;
    return html`
      <button class=${selected ? "selected" : ""} title=${`${item.label}: ${item.detail}`} aria-current=${selected ? "page" : "false"} @click=${() => { this.navigate(item.section); }}>
        <span class="nav-icon" aria-hidden="true">${settingsIcon(item.icon)}</span>
        <span class="nav-copy">
          <strong>${item.label}</strong>
          <small>${item.detail}</small>
        </span>
      </button>
    `;
  }

  private filteredNavItems(): readonly SettingsNavItem[] {
    const query = this.settingsSearch.trim().toLocaleLowerCase();
    if (query === "") return SETTINGS_NAV_ITEMS;
    return SETTINGS_NAV_ITEMS.filter((item) => [item.label, item.detail, ...item.keywords].some((value) => value.toLocaleLowerCase().includes(query)));
  }

  private selectedNavSection(): SettingsSection {
    if (this.section === "general") return "behavior";
    if (this.section === "marketplace") return "skills-catalog";
    return this.section;
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

  private async loadPackages(): Promise<void> {
    this.packagesLoading = true;
    this.packageError = "";
    try {
      this.packagesResponse = await packagesApi.packages(this.projectCwd);
    } catch (error) {
      this.packageError = `Failed to load packages: ${errorMessage(error)}`;
    } finally {
      this.packagesLoading = false;
    }
  }

  private async installPackage(source: string, scope: PiPackageScope): Promise<void> {
    if (this.installingPackage) return;
    this.installingPackage = true;
    this.packageError = "";
    this.packageSavedMessage = "";
    try {
      const response = await packagesApi.installPackage(source, { scope, ...(scope === "project" && this.projectCwd !== undefined ? { cwd: this.projectCwd } : {}) });
      this.packagesResponse = { packages: response.packages };
      this.packageSavedMessage = `Installed ${response.package.source}. Reload active Pi sessions to load new extensions/skills; reload the browser tab to load PI WEB plugins.`;
      await this.refreshPlugins();
    } catch (error) {
      this.packageError = `Failed to install package: ${errorMessage(error)}`;
    } finally {
      this.installingPackage = false;
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
    if (event.key !== "Escape" || this.onClose === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    this.onClose();
  }

  static override styles = css`
    :host {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: flex;
      color: var(--pi-text);
      font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      container-type: inline-size;
      --settings-panel-surface: var(--pi-elevated-bg);
      --settings-panel-nav: color-mix(in srgb, var(--pi-surface) 78%, var(--pi-bg) 22%);
      --settings-panel-nav-hover: color-mix(in srgb, var(--pi-text) 9%, transparent);
      --settings-panel-border: var(--pi-elevated-border);
      --settings-panel-hairline: color-mix(in srgb, var(--pi-border-muted) 70%, transparent);
      --settings-panel-focus: color-mix(in srgb, var(--pi-text-bright) 34%, var(--pi-accent) 66%);
    }
    :host([presentation="dialog"]) {
      flex: 0 1 auto;
      width: min(980px, 100%);
      max-height: min(760px, 100%);
      min-height: min(620px, 100%);
    }
    .settings-shell {
      flex: 1 1 auto;
      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 96px), var(--settings-panel-surface);
      overflow: hidden;
    }
    :host([presentation="dialog"]) .settings-shell {
      border: 1px solid var(--settings-panel-border);
      border-radius: 18px;
      box-shadow: 0 24px 80px var(--pi-backdrop), 0 1px 0 var(--pi-inset-highlight) inset;
    }
    .settings-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--settings-panel-hairline); background: color-mix(in srgb, var(--settings-panel-nav) 58%, transparent); }
    .eyebrow { display: block; color: var(--pi-muted); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; color: var(--pi-text-bright); font-size: 20px; line-height: 1.2; }
    button, input { font: inherit; }
    button { border: 1px solid var(--settings-panel-border); border-radius: 12px; background: var(--settings-panel-nav); color: var(--pi-text); padding: 8px 11px; cursor: pointer; }
    button:hover, button:focus { background: var(--settings-panel-nav-hover); }
    button:focus-visible, input:focus-visible { outline: 2px solid var(--settings-panel-focus); outline-offset: 2px; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .close-button { width: 34px; height: 34px; display: grid; place-items: center; border: 0; background: transparent; color: var(--pi-muted); padding: 0; font-size: 23px; line-height: 1; }
    .close-button:hover, .close-button:focus { color: var(--pi-text-bright); background: var(--settings-panel-nav-hover); }
    .settings-body { min-height: 0; display: grid; grid-template-columns: 236px minmax(0, 1fr); }
    .settings-sidebar { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 10px; border-right: 1px solid var(--settings-panel-hairline); background: color-mix(in srgb, var(--settings-panel-nav) 72%, transparent); overflow: hidden; }
    .settings-search { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; min-width: 0; border: 1px solid var(--settings-panel-border); border-radius: 14px; background: color-mix(in srgb, var(--pi-bg) 72%, transparent); padding: 9px 11px; color: var(--pi-muted); }
    .settings-search svg { flex: 0 0 auto; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .settings-search input { flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--pi-text); padding: 0; }
    .settings-search input::placeholder { color: var(--pi-muted); opacity: .9; }
    .settings-nav { flex: 1 1 auto; min-height: 0; overflow: auto; scrollbar-width: thin; }
    .settings-nav button { display: grid; grid-template-columns: 24px minmax(0, 1fr); align-items: center; gap: 10px; width: 100%; margin: 0 0 6px; text-align: left; border-color: transparent; background: transparent; color: var(--pi-muted); }
    .settings-nav button:hover, .settings-nav button:focus { background: var(--settings-panel-nav-hover); color: var(--pi-text); }
    .settings-nav button.selected { border-color: color-mix(in srgb, var(--pi-accent) 35%, transparent); background: color-mix(in srgb, var(--pi-accent) 28%, transparent); color: var(--pi-text-bright); }
    .nav-icon { display: grid; place-items: center; color: currentColor; }
    .nav-icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .nav-copy { min-width: 0; display: grid; gap: 2px; }
    .nav-copy strong, .nav-copy small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .nav-copy strong { font-weight: 650; }
    .nav-copy small, .empty-nav { color: var(--pi-muted); }
    .empty-nav { margin: 8px 6px; line-height: 1.4; }
    .settings-content { min-width: 0; min-height: 0; overflow: auto; padding: 18px; scrollbar-width: thin; }
    .category-card { display: grid; gap: 16px; border: 1px solid var(--pi-border); border-radius: 12px; background: var(--pi-surface); padding: 16px; }
    .category-card h2, .category-card p { margin: 0; }
    .category-card h2 { color: var(--pi-text-bright); font-size: 17px; line-height: 1.25; }
    .category-card p { color: var(--pi-muted); line-height: 1.5; }
    .action-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .primary { border-color: var(--pi-accent); background: var(--pi-selection-bg); color: var(--pi-text-bright); }

    @container (max-width: 760px) {
      .settings-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
      .settings-sidebar { max-height: 260px; border-right: 0; border-bottom: 1px solid var(--settings-panel-hairline); }
      .settings-content { padding: 14px 12px; }
    }
    @container (max-width: 430px) {
      .settings-header { padding: 12px; }
      .settings-sidebar { max-height: none; }
      .nav-copy small { display: none; }
      .settings-nav button { grid-template-columns: 22px minmax(0, 1fr); gap: 9px; padding: 9px 10px; }
    }
  `;
}

function searchIcon(): TemplateResult {
  return svg`
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5"></circle>
      <path d="m16 16 4 4"></path>
    </svg>
  `;
}

function settingsIcon(icon: SettingsNavIcon): TemplateResult {
  switch (icon) {
    case "appearance":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3a9 9 0 1 0 9 9"></path>
          <path d="M12 3v4"></path>
          <path d="m16.5 4.5-2.4 2.4"></path>
          <circle cx="12" cy="12" r="2.5"></circle>
        </svg>
      `;
    case "chat":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 5h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-5l-5 4v-4a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"></path>
          <path d="m18 4 2 2-2 2"></path>
        </svg>
      `;
    case "notifications":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
          <path d="M10 21h4"></path>
        </svg>
      `;
    case "sessions":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 6h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3h-5l-5 4v-4a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z"></path>
          <path d="M12 9v3l2 1"></path>
        </svg>
      `;
    case "snippets":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M8 4h8a2 2 0 0 1 2 2v14l-6-3-6 3V6a2 2 0 0 1 2-2Z"></path>
          <path d="M9 9h6"></path>
          <path d="M9 12h4"></path>
        </svg>
      `;
    case "agents":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="8" r="4"></circle>
          <path d="M5 21a7 7 0 0 1 14 0"></path>
          <path d="m8.5 8 1.5 1.5L15.5 4"></path>
        </svg>
      `;
    case "behavior":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 3v18"></path>
          <path d="M5 8h7"></path>
          <path d="M12 16h7"></path>
          <circle cx="5" cy="8" r="2"></circle>
          <circle cx="19" cy="16" r="2"></circle>
        </svg>
      `;
    case "commands":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="4" y="5" width="16" height="14" rx="2"></rect>
          <path d="m8 10 3 2-3 2"></path>
          <path d="M13 15h3"></path>
        </svg>
      `;
    case "mcp":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m8 12 4-4 4 4"></path>
          <path d="m8 16 4-4 4 4"></path>
          <path d="M4 20 20 4"></path>
        </svg>
      `;
    case "plugins":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 7V4"></path>
          <path d="M15 7V4"></path>
          <rect x="6" y="7" width="12" height="10" rx="2"></rect>
          <path d="M9 20v-3"></path>
          <path d="M15 20v-3"></path>
          <path d="m10 11 4 2-4 2"></path>
        </svg>
      `;
    case "providers":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 18a4 4 0 1 1 .8-7.9A6 6 0 1 1 18 18Z"></path>
        </svg>
      `;
    case "usage":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 19V5"></path>
          <path d="M4 19h16"></path>
          <rect x="7" y="11" width="2.8" height="5.5" rx="1"></rect>
          <rect x="12" y="7" width="2.8" height="9.5" rx="1"></rect>
          <rect x="17" y="9" width="2.8" height="7.5" rx="1"></rect>
        </svg>
      `;
    case "skills":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 5h7a3 3 0 0 1 3 3v11a3 3 0 0 0-3-3H4Z"></path>
          <path d="M20 5h-7a3 3 0 0 0-3 3"></path>
          <path d="M20 5v11h-7a3 3 0 0 0-3 3"></path>
        </svg>
      `;
    case "catalog":
      return svg`
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
          <path d="M8 8h8"></path>
          <path d="M8 12h8"></path>
          <path d="M8 16h5"></path>
        </svg>
      `;
  }
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
