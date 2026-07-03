import { LitElement, html, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { Workspace } from "../api";
import type { QualifiedContributionId, QualifiedWorkspacePanelContribution, WorkspacePanelContext } from "../plugins/types";
import { workspacePanelStyles } from "./shared";
import { renderBuiltinTabIcon } from "./tabIcons";

export interface WorkspacePanelEmptyState {
  title: string;
  body?: string;
}

type WorkspacePanelBadge = string | number | TemplateResult | undefined;

@customElement("workspace-panel")
export class WorkspacePanel extends LitElement {
  @property({ attribute: false }) workspace: Workspace | undefined;
  @property({ attribute: false }) panelContext: WorkspacePanelContext | undefined;
  @property({ attribute: false }) emptyState: WorkspacePanelEmptyState | undefined;
  @property() tool: QualifiedContributionId = "core:workspace.summary";
  @property({ attribute: false }) panels: QualifiedWorkspacePanelContribution[] = [];
  @property({ type: Boolean }) hideToolTabs = false;
  @property({ attribute: false }) onSelectTool: (tool: QualifiedContributionId) => void = () => undefined;
  @property({ attribute: false }) onCloseLastTool?: () => void;
  @property({ attribute: false }) onOpenSettings?: () => void;
  @query(".workspace-header-strip") private workspaceHeaderStrip?: HTMLElement | null;
  @state() private toolMenuOpen = false;
  @state() private openedToolIds: QualifiedContributionId[] = [];
  @state() private workspaceHeaderCanScrollLeft = false;
  @state() private workspaceHeaderCanScrollRight = false;

  private observedWorkspaceHeaderStrip: HTMLElement | undefined;
  private workspaceHeaderResizeObserver: ResizeObserver | undefined;
  private readonly onWorkspaceHeaderScroll = () => {
    this.updateWorkspaceHeaderScrollState();
  };

  override firstUpdated(): void {
    this.observeWorkspaceHeaderStrip();
    this.updateWorkspaceHeaderScrollState();
  }

  override updated(): void {
    this.observeWorkspaceHeaderStrip();
    this.updateWorkspaceHeaderScrollState();
  }

  override disconnectedCallback(): void {
    this.workspaceHeaderResizeObserver?.disconnect();
    this.workspaceHeaderResizeObserver = undefined;
    this.observedWorkspaceHeaderStrip = undefined;
    super.disconnectedCallback();
  }

  override render() {
    const workspace = this.workspace;
    const context = this.panelContext;
    const visiblePanels = workspace === undefined || context === undefined ? [] : this.panels;
    const selectedPanel = visiblePanels.find((panel) => panel.id === this.tool) ?? visiblePanels[0];
    return html`
      ${this.hideToolTabs ? null : this.renderHeader(visiblePanels, selectedPanel, context)}
      ${this.renderContent(workspace, context, selectedPanel)}
    `;
  }

  private renderHeader(visiblePanels: QualifiedWorkspacePanelContribution[], selectedPanel: QualifiedWorkspacePanelContribution | undefined, context: WorkspacePanelContext | undefined): TemplateResult {
    const openedPanels = this.openedPanels(visiblePanels, selectedPanel);
    return html`
      <header @keydown=${(event: KeyboardEvent) => { this.onHeaderKeyDown(event); }}>
        <div class=${this.workspaceHeaderFrameClass()}>
          <div class="workspace-header-strip" @scroll=${this.onWorkspaceHeaderScroll}>
            <div class="tool-picker">
              <div class="opened-tools" aria-label="Opened workspace tools">
                ${openedPanels.map((panel) => {
                  const selected = selectedPanel?.id === panel.id;
                  const badge = context === undefined ? undefined : panel.badge?.(context);
                  const ariaLabel = this.panelTabAriaLabel(panel, badge);
                  const canClose = openedPanels.length > 0;
                  return html`
                    <span class=${selected ? "opened-tool selected" : "opened-tool"}>
                      <button type="button" class="opened-tool-main" title=${ariaLabel} aria-label=${ariaLabel} aria-pressed=${String(selected)} @click=${() => { this.selectOpenedTool(panel.id); }}>
                        ${this.renderPanelTabContent(panel, badge)}
                      </button>
                      ${canClose ? html`
                        <button type="button" class="opened-tool-close" title=${`Close ${panel.title}`} aria-label=${`Close ${panel.title}`} @click=${(event: MouseEvent) => { this.closeOpenedTool(event, panel.id, openedPanels, visiblePanels, selectedPanel); }}>
                          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>
                        </button>
                      ` : null}
                    </span>
                  `;
                })}
              </div>
              <button type="button" class="add-tool" title="Open workspace tool menu" aria-label="Open workspace tool menu" aria-haspopup="menu" aria-expanded=${String(this.toolMenuOpen)} @click=${() => { this.toolMenuOpen = !this.toolMenuOpen; }}>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
              </button>
              ${this.toolMenuOpen ? this.renderToolMenu(visiblePanels, selectedPanel, context) : null}
            </div>
          </div>
        </div>
      </header>
    `;
  }

  private renderToolMenu(visiblePanels: QualifiedWorkspacePanelContribution[], selectedPanel: QualifiedWorkspacePanelContribution | undefined, context: WorkspacePanelContext | undefined): TemplateResult {
    return html`
      <div class="tool-menu" role="menu" aria-label="Workspace tools">
        ${visiblePanels.map((panel) => {
          const selected = selectedPanel?.id === panel.id;
          const badge = context === undefined ? undefined : panel.badge?.(context);
          const ariaLabel = this.panelTabAriaLabel(panel, badge);
          return html`
            <button class=${selected ? "selected" : ""} role="menuitemradio" aria-checked=${String(selected)} title=${ariaLabel} @click=${() => { this.selectToolFromMenu(panel.id, selectedPanel?.id); }}>
              ${this.renderPanelTabContent(panel, badge)}
              ${this.renderPanelShortcut(panel.id)}
            </button>
          `;
        })}
        ${this.onOpenSettings === undefined ? null : html`
          <button role="menuitem" title="Settings" @click=${() => { this.openSettingsFromMenu(); }}>
            ${renderBuiltinTabIcon("settings")}
            <span class="tab-label">Settings</span>
            <span class="tool-shortcut">⌘,</span>
          </button>
        `}
      </div>
    `;
  }

  private renderContent(workspace: Workspace | undefined, context: WorkspacePanelContext | undefined, selectedPanel: QualifiedWorkspacePanelContribution | undefined): TemplateResult {
    if (workspace === undefined) return this.renderEmptyState(this.emptyState ?? {
      title: "Select a workspace",
      body: "Choose a workspace to inspect files, Git, or terminals.",
    });
    if (context === undefined) return this.renderEmptyState({
      title: "Workspace tools unavailable",
      body: "Try selecting the workspace again.",
    });
    if (selectedPanel === undefined) return this.renderEmptyState({
      title: "No workspace tools available",
      body: "No tools are available for this workspace.",
    });
    return html`
      <div class="panel-content">
        ${selectedPanel.render(context)}
      </div>
    `;
  }

  private selectToolFromMenu(tool: QualifiedContributionId, currentTool: QualifiedContributionId | undefined): void {
    const openedWithCurrent = currentTool === undefined ? this.openedToolIds : addOpenedToolId(this.openedToolIds, currentTool);
    this.openedToolIds = addOpenedToolId(openedWithCurrent, tool);
    this.toolMenuOpen = false;
    this.onSelectTool(tool);
  }

  private selectOpenedTool(tool: QualifiedContributionId): void {
    this.onSelectTool(tool);
  }

  private closeOpenedTool(
    event: MouseEvent,
    tool: QualifiedContributionId,
    openedPanels: readonly QualifiedWorkspacePanelContribution[],
    visiblePanels: readonly QualifiedWorkspacePanelContribution[],
    selectedPanel: QualifiedWorkspacePanelContribution | undefined,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    const selectedTool = selectedPanel?.id;
    const remainingOpenedPanels = openedPanels.filter((panel) => panel.id !== tool);
    this.openedToolIds = this.openedToolIds.filter((id) => id !== tool);
    if (selectedTool !== tool) return;
    const nextPanel = remainingOpenedPanels[0];
    if (nextPanel !== undefined) {
      this.onSelectTool(nextPanel.id);
      return;
    }
    this.onCloseLastTool?.();
  }

  private openedPanels(visiblePanels: readonly QualifiedWorkspacePanelContribution[], selectedPanel: QualifiedWorkspacePanelContribution | undefined): QualifiedWorkspacePanelContribution[] {
    const ids = selectedPanel === undefined ? this.openedToolIds : addOpenedToolId(this.openedToolIds, selectedPanel.id);
    const panels = ids.flatMap((id) => {
      const panel = visiblePanels.find((candidate) => candidate.id === id);
      return panel === undefined ? [] : [panel];
    });
    return panels.length > 0 ? panels : selectedPanel === undefined ? [] : [selectedPanel];
  }

  private openSettingsFromMenu(): void {
    this.toolMenuOpen = false;
    this.onOpenSettings?.();
  }

  private onHeaderKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") return;
    this.toolMenuOpen = false;
  }

  private renderPanelShortcut(id: QualifiedContributionId): TemplateResult | null {
    const shortcut = panelShortcut(id);
    return shortcut === undefined ? null : html`<span class="tool-shortcut">${shortcut}</span>`;
  }

  private panelTabAriaLabel(panel: QualifiedWorkspacePanelContribution, badge: WorkspacePanelBadge): string {
    if (typeof badge !== "string" && typeof badge !== "number") return panel.title;
    const trimmedBadge = String(badge).trim();
    return trimmedBadge === "" ? panel.title : `${panel.title}, ${trimmedBadge}`;
  }

  private renderPanelTabContent(panel: QualifiedWorkspacePanelContribution, badge: WorkspacePanelBadge): TemplateResult {
    return html`
      ${panel.icon === undefined ? null : html`<span class="tab-custom-icon" aria-hidden="true">${panel.icon}</span>`}
      <span class="tab-label">${panel.title}</span>
      ${this.isEmptyBadge(badge) ? null : html`<span class="tab-badge">${badge}</span>`}
    `;
  }

  private isEmptyBadge(badge: WorkspacePanelBadge): boolean {
    return badge === undefined || badge === "";
  }

  private renderEmptyState(state: WorkspacePanelEmptyState): TemplateResult {
    return html`
      <section class="empty-state" role="status">
        <h2>${state.title}</h2>
        ${state.body === undefined ? null : html`<p>${state.body}</p>`}
      </section>
    `;
  }

  private workspaceHeaderFrameClass(): string {
    return `workspace-header-scroll-frame${this.workspaceHeaderCanScrollLeft ? " can-scroll-left" : ""}${this.workspaceHeaderCanScrollRight ? " can-scroll-right" : ""}`;
  }

  private observeWorkspaceHeaderStrip(): void {
    const strip = this.workspaceHeaderStripElement();
    if (this.observedWorkspaceHeaderStrip === strip) return;
    this.workspaceHeaderResizeObserver?.disconnect();
    this.observedWorkspaceHeaderStrip = strip;
    this.workspaceHeaderResizeObserver = undefined;
    if (strip === undefined || typeof ResizeObserver === "undefined") return;
    this.workspaceHeaderResizeObserver = new ResizeObserver(() => {
      this.updateWorkspaceHeaderScrollState();
    });
    this.workspaceHeaderResizeObserver.observe(strip);
  }

  private updateWorkspaceHeaderScrollState(): void {
    const strip = this.workspaceHeaderStripElement();
    const maxScrollLeft = strip === undefined ? 0 : Math.max(0, strip.scrollWidth - strip.clientWidth);
    const canScrollLeft = strip !== undefined && strip.scrollLeft > 1;
    const canScrollRight = strip !== undefined && maxScrollLeft - strip.scrollLeft > 1;
    if (this.workspaceHeaderCanScrollLeft !== canScrollLeft) this.workspaceHeaderCanScrollLeft = canScrollLeft;
    if (this.workspaceHeaderCanScrollRight !== canScrollRight) this.workspaceHeaderCanScrollRight = canScrollRight;
  }

  private workspaceHeaderStripElement(): HTMLElement | undefined {
    const strip = this.workspaceHeaderStrip;
    return strip instanceof HTMLElement ? strip : undefined;
  }

  static override styles = workspacePanelStyles;
}

function addOpenedToolId(ids: readonly QualifiedContributionId[], id: QualifiedContributionId): QualifiedContributionId[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

function panelShortcut(id: QualifiedContributionId): string | undefined {
  switch (id) {
    case "core:workspace.files": return "⌘2";
    case "core:workspace.git": return "⌘3";
    case "core:workspace.terminal": return "⌘4";
    default: return undefined;
  }
}
