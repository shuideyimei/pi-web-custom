import { css, html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { PiPackageInfo, PiPackageScope, PiPackagesResponse } from "../../api";

const MARKETPLACE_LINKS: readonly { label: string; description: string; url: string }[] = [
  { label: "All packages", description: "Browse the full Pi package catalog", url: "https://pi.dev/packages" },
  { label: "Plugins / extensions", description: "Tools, commands, providers, and runtime extensions", url: "https://pi.dev/packages?type=extension" },
  { label: "MCP", description: "Find MCP adapters and MCP-related packages", url: "https://pi.dev/packages?q=mcp" },
  { label: "Skills", description: "Install reusable Agent Skills and workflows", url: "https://pi.dev/packages?type=skill" },
];

const RECOMMENDED_PACKAGES: readonly { label: string; source: string; description: string }[] = [
  { label: "MCP adapter", source: "npm:pi-mcp-adapter", description: "MCP server integration for Pi through an extension package." },
  { label: "Web access tools", source: "npm:pi-web-access", description: "Web search, URL fetch, GitHub, PDF, and video tools." },
  { label: "Subagents", source: "npm:pi-subagents", description: "Delegation, reviewers, scouts, workers, and async child agents." },
  { label: "Skill pack", source: "npm:bigpowers", description: "A large skills package for spec-driven and test-first workflows." },
];

@customElement("settings-marketplace-panel")
export class SettingsMarketplacePanel extends LitElement {
  @property({ attribute: false }) packagesResponse: PiPackagesResponse | undefined;
  @property({ attribute: false }) projectCwd: string | undefined;
  @property({ type: Boolean }) loading = false;
  @property({ type: Boolean }) installing = false;
  @property() error = "";
  @property() savedMessage = "";
  @property({ attribute: false }) onReload?: () => void | Promise<void>;
  @property({ attribute: false }) onInstallPackage?: (source: string, scope: PiPackageScope) => void | Promise<void>;
  @state() private installSource = "";
  @state() private scope: PiPackageScope = "user";

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("projectCwd") && this.projectCwd === undefined && this.scope === "project") this.scope = "user";
  }

  override render(): TemplateResult {
    const packages = this.packagesResponse?.packages ?? [];
    return html`
      <div class="section-heading">
        <div>
          <h2>Pi package marketplace</h2>
          <p>Browse and install Pi packages that provide plugins/extensions, MCP integrations, skills, prompt templates, and themes.</p>
        </div>
        <button class="secondary" ?disabled=${this.loading || this.installing} @click=${() => { void this.onReload?.(); }}>Reload</button>
      </div>
      ${this.renderMessages()}
      <div class="warning-card">
        <strong>Security reminder</strong>
        <span>Pi packages can execute code and influence agent behavior. Review third-party package source before installing.</span>
      </div>
      <div class="market-grid">
        ${MARKETPLACE_LINKS.map((link) => html`
          <a class="market-card" href=${link.url} target="_blank" rel="noreferrer">
            <strong>${link.label}</strong>
            <span>${link.description}</span>
            <small>${link.url}</small>
          </a>
        `)}
      </div>
      <form class="install-card" @submit=${(event: Event) => { void this.install(event); }}>
        <div>
          <h3>Install package</h3>
          <p>Paste a package name, source, or full command such as <code>pi install npm:pi-mcp-adapter</code>.</p>
        </div>
        <label class="field">
          <span>Package source</span>
          <input .value=${this.installSource} placeholder="npm:pi-mcp-adapter" autocomplete="off" spellcheck="false" ?disabled=${this.installing} @input=${(event: Event) => { this.installSource = inputValue(event); }}>
        </label>
        <label class="field">
          <span>Install scope</span>
          <select .value=${this.scope} ?disabled=${this.installing} @change=${(event: Event) => { this.scope = selectValue(event) === "project" ? "project" : "user"; }}>
            <option value="user">User — available to all Pi projects</option>
            <option value="project" ?disabled=${this.projectCwd === undefined}>Project — write selected workspace .pi/settings.json</option>
          </select>
          <small>${this.projectCwd === undefined ? "Select a workspace to enable project-scoped installs." : html`Project scope target: <code>${this.projectCwd}</code>`}</small>
        </label>
        <div class="actions-row">
          <button class="primary" type="submit" ?disabled=${this.installing || this.installSource.trim() === ""}>${this.installing ? "Installing…" : "Install"}</button>
          <button type="button" ?disabled=${this.installing} @click=${() => { this.installSource = ""; }}>Clear</button>
        </div>
      </form>
      <div class="recommendations">
        <h3>Quick starts</h3>
        <div class="recommendation-grid">
          ${RECOMMENDED_PACKAGES.map((pkg) => html`
            <article class="recommendation-card">
              <div>
                <strong>${pkg.label}</strong>
                <span>${pkg.description}</span>
                <code>${pkg.source}</code>
              </div>
              <button type="button" ?disabled=${this.installing} @click=${() => { this.installSource = pkg.source; }}>Use</button>
            </article>
          `)}
        </div>
      </div>
      <div class="installed-section">
        <div class="installed-heading">
          <h3>Installed packages</h3>
          <small>${packages.length} configured</small>
        </div>
        ${this.loading && packages.length === 0 ? html`<div class="loading-card">Loading packages…</div>` : packages.length === 0 ? html`<div class="loading-card">No Pi packages configured yet.</div>` : html`
          <div class="package-list">
            ${packages.map((pkg) => this.renderPackage(pkg))}
          </div>
        `}
      </div>
    `;
  }

  private renderMessages(): TemplateResult | null {
    if (this.error !== "") return html`<div class="message error-message">${this.error}</div>`;
    if (this.savedMessage !== "") return html`<div class="message success-message">${this.savedMessage}</div>`;
    return null;
  }

  private renderPackage(pkg: PiPackageInfo): TemplateResult {
    return html`
      <article class="package-card">
        <div class="package-main">
          <strong>${pkg.source}${pkg.filtered ? " (filtered)" : ""}</strong>
          <small>${pkg.scope} scope${pkg.installedPath === undefined ? " · not installed on disk" : ""}</small>
          ${pkg.installedPath === undefined ? null : html`<code>${pkg.installedPath}</code>`}
        </div>
      </article>
    `;
  }

  private async install(event: Event): Promise<void> {
    event.preventDefault();
    const source = this.installSource.trim();
    if (source === "") return;
    await this.onInstallPackage?.(source, this.scope);
  }

  static override styles = css`
    :host { display: block; }
    .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .section-heading > div, .install-card > div, .recommendations, .installed-section { display: grid; gap: 6px; min-width: 0; }
    h2, h3, p { margin: 0; }
    h2 { font-size: 17px; line-height: 1.25; }
    h3 { font-size: 14px; line-height: 1.3; }
    p, small, .warning-card span, .market-card span, .recommendation-card span, .package-main small { color: var(--pi-muted); line-height: 1.45; }
    button, input, select { font: inherit; }
    button, input, select { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); }
    button { padding: 7px 9px; cursor: pointer; }
    input, select { box-sizing: border-box; width: 100%; padding: 8px 9px; }
    button:hover, button:focus { background: color-mix(in srgb, var(--pi-text) 9%, var(--pi-surface)); }
    button:disabled, input:disabled, select:disabled { opacity: .55; cursor: not-allowed; }
    .primary { border-color: color-mix(in srgb, var(--pi-accent) 70%, var(--pi-border)); background: color-mix(in srgb, var(--pi-accent) 18%, var(--pi-surface)); }
    .secondary { flex: 0 0 auto; }
    .message, .warning-card, .market-card, .install-card, .recommendation-card, .loading-card, .package-card { border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 12px; }
    .message { margin-bottom: 12px; }
    .error-message { border-color: var(--pi-danger); color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 10%, var(--pi-surface)); }
    .success-message { border-color: var(--pi-success-border); color: var(--pi-success); background: var(--pi-success-surface); }
    .warning-card { display: grid; gap: 4px; margin-bottom: 14px; border-color: color-mix(in srgb, var(--pi-warning, #f6c177) 55%, var(--pi-border)); }
    .market-grid, .recommendation-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .market-card { display: grid; gap: 4px; color: inherit; text-decoration: none; }
    .market-card:hover, .market-card:focus { border-color: var(--pi-accent); }
    .market-card small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .install-card { display: grid; gap: 12px; margin-bottom: 14px; }
    .field { display: grid; gap: 6px; }
    .field > span { font-weight: 700; }
    .actions-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .recommendations { margin-bottom: 14px; }
    .recommendation-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
    .recommendation-card > div, .package-main { min-width: 0; display: grid; gap: 4px; }
    .installed-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
    .package-list { display: grid; gap: 10px; }
    code { border: 1px solid var(--pi-border-muted); border-radius: 5px; background: var(--pi-bg); padding: 1px 4px; color: var(--pi-text); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    .package-main code { width: fit-content; max-width: 100%; }
    .loading-card { color: var(--pi-muted); }

    @media (max-width: 760px) {
      .section-heading { display: grid; gap: 12px; }
      .section-heading .secondary { justify-self: start; }
      .market-grid, .recommendation-grid { grid-template-columns: minmax(0, 1fr); }
      .recommendation-card { grid-template-columns: minmax(0, 1fr); }
      .recommendation-card button { justify-self: start; }
    }
  `;
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function selectValue(event: Event): string {
  return event.target instanceof HTMLSelectElement ? event.target.value : "";
}
