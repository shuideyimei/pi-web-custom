import { css, html, LitElement, svg, type SVGTemplateResult, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { GitDiffResponse, GitFileState, GitLogEntry, GitStatusResponse } from "../api";
import type { WorkspacePanelContext } from "../plugins/types";
import type { SelectedReviewDiff } from "../reviewDiff";
import { workspacePanelStyles } from "./shared";

type GitStatusFile = GitStatusResponse["files"][number];

@customElement("workspace-git-panel")
export class WorkspaceGitPanel extends LitElement {
  @property({ attribute: false }) context: WorkspacePanelContext | undefined;
  @state() private detailsPanelWidth = readStoredDetailsPanelWidth();
  @state() private commitMessage = "";
  @state() private pendingAction: string | undefined;
  @state() private actionError = "";

  private splitResize: SplitResizeState | undefined;

  override render(): TemplateResult {
    const context = this.context;
    if (context === undefined) return html`<p class="muted">Git unavailable.</p>`;
    const detailsWidth = clampDetailsPanelWidth(this.detailsPanelWidth);
    return html`
      <section class="git-panel">
        <div class="git-sidebar-split" style=${`--git-details-panel-width: ${String(detailsWidth)}px;`}>
          <div class="git-diff-viewer">
            ${this.renderDiffViewer(context)}
          </div>
          <div
            class="git-sidebar-split-divider"
            role="separator"
            aria-label="Resize Git details"
            aria-orientation="vertical"
            aria-valuemin=${String(DETAILS_PANEL_MIN_WIDTH)}
            aria-valuemax=${String(DETAILS_PANEL_MAX_WIDTH)}
            aria-valuenow=${String(detailsWidth)}
            tabindex="0"
            @pointerdown=${this.onSplitDividerPointerDown}
            @pointermove=${this.onSplitDividerPointerMove}
            @pointerup=${this.onSplitDividerPointerUp}
            @pointercancel=${this.onSplitDividerPointerCancel}
            @keydown=${this.onSplitDividerKeyDown}
          ></div>
          <aside class="git-details-panel" aria-label="Git details">
            ${this.renderGitDetails(context)}
          </aside>
        </div>
      </section>
    `;
  }

  private renderGitDetails(context: WorkspacePanelContext): TemplateResult {
    const status = context.gitStatus;
    return html`
      ${this.renderToolbar(context, status)}
      <div class="git-details-scroll">
        ${status === undefined ? html`
          <p class="muted empty-note">No status loaded.</p>
        ` : !status.isGitRepo ? html`
          <p class="muted empty-note">Not a git repository.</p>
        ` : html`
          ${this.renderCommitBox(context, status)}
          ${this.renderRepositorySummary(status)}
          ${this.renderChangedFiles(context, status)}
          ${this.renderSelectedFileDetails(status, context.selectedDiffPath)}
          ${this.renderGraph(context)}
        `}
      </div>
    `;
  }

  private renderToolbar(context: WorkspacePanelContext, status: GitStatusResponse | undefined): TemplateResult {
    const stageable = status?.isGitRepo === true && status.files.some(hasStageableChange);
    const staged = status?.isGitRepo === true && status.files.some(hasStagedChange);
    const busy = this.pendingAction !== undefined;
    return html`
      <section class="git-toolbar" aria-label="Source control actions">
        <div class="git-section-header">
          <div class="git-section-title">
            ${renderIcon("chevron-down", "git-section-chevron")}
            <strong>Changes</strong>
            ${context.gitStale ? html`<span class="stale">stale</span>` : null}
          </div>
          <div class="git-toolbar-actions">
            <button class="git-icon-button" type="button" title="Stage all changes" aria-label="Stage all changes" ?disabled=${!stageable || busy} @click=${() => { void this.runAction("stage-all", () => { return context.onStageAllGitFiles(); }); }}>${renderIcon("check")}</button>
            <button class="git-icon-button" type="button" title="Unstage all changes" aria-label="Unstage all changes" ?disabled=${!staged || busy} @click=${() => { void this.runAction("unstage-all", () => { return context.onUnstageAllGitFiles(); }); }}>${renderIcon("undo")}</button>
            <button class="git-icon-button" type="button" title="Refresh Git" aria-label="Refresh Git" ?disabled=${busy} @click=${() => { void this.runAction("refresh", () => { context.onRefreshGit(); }); }}>${renderIcon("refresh")}</button>
          </div>
        </div>
      </section>
    `;
  }

  private renderCommitBox(context: WorkspacePanelContext, status: GitStatusResponse): TemplateResult {
    const stagedCount = status.files.filter(hasStagedChange).length;
    const canCommit = stagedCount > 0 && this.commitMessage.trim() !== "" && this.pendingAction === undefined;
    return html`
      <form class="commit-box" @submit=${(event: SubmitEvent) => { this.handleCommitSubmit(event, context); }}>
        <label class="commit-input-wrapper">
          <span class="sr-only">Commit message</span>
          <input
            type="text"
            placeholder=${stagedCount === 0 ? "Stage changes before committing" : "Message (⌘Enter to commit)"}
            autocomplete="off"
            spellcheck="true"
            .value=${this.commitMessage}
            @input=${this.handleCommitInput}
            @keydown=${(event: KeyboardEvent) => { this.handleCommitKeyDown(event, context); }}
          />
          <span class="commit-input-icon" aria-hidden="true">${renderIcon("sparkles")}</span>
        </label>
        <button class="commit-button" type="submit" ?disabled=${!canCommit}>
          ${renderIcon("check")}
          <span>${this.pendingAction === "commit" ? "Committing…" : stagedCount === 0 ? "Commit staged changes" : `Commit ${String(stagedCount)} staged`}</span>
        </button>
        ${this.actionError === "" ? null : html`<p class="action-error" role="alert">${this.actionError}</p>`}
      </form>
    `;
  }

  private renderRepositorySummary(status: GitStatusResponse): TemplateResult {
    const stagedCount = status.files.filter(hasStagedChange).length;
    const unstagedCount = status.files.filter(hasUnstagedChange).length;
    return html`
      <section class="git-card repository-card" aria-label="Repository status">
        <span class="eyebrow">Repository</span>
        <strong class="repo-branch">${status.branch ?? "detached"}</strong>
        ${status.upstream === undefined ? null : html`<small>${status.upstream}</small>`}
        <dl class="repo-stats">
          <div><dt>Staged</dt><dd>${String(stagedCount)}</dd></div>
          <div><dt>Unstaged</dt><dd>${String(unstagedCount)}</dd></div>
          <div><dt>Ahead</dt><dd>${String(status.ahead ?? 0)}</dd></div>
          <div><dt>Behind</dt><dd>${String(status.behind ?? 0)}</dd></div>
        </dl>
      </section>
    `;
  }

  private renderSelectedFileDetails(status: GitStatusResponse, selectedDiffPath: string | undefined): TemplateResult {
    const selectedFile = selectedDiffPath === undefined ? undefined : status.files.find((file) => file.path === selectedDiffPath);
    if (selectedDiffPath === undefined || selectedDiffPath === "") return html``;
    return html`
      <section class="git-card" aria-label="Selected file">
        <span class="eyebrow">Selected file</span>
        ${selectedFile === undefined ? html`
          <strong class="selected-file-path">${selectedDiffPath}</strong>
          <p class="muted card-note">This file is no longer in the current Git status.</p>
        ` : html`
          <strong class="selected-file-path" title=${selectedFile.path}>${selectedFile.path}</strong>
          ${selectedFile.oldPath === undefined ? null : html`<small title=${selectedFile.oldPath}>Renamed from ${selectedFile.oldPath}</small>`}
          <dl>
            <div><dt>Index</dt><dd>${stateName(selectedFile.index)}</dd></div>
            <div><dt>Working tree</dt><dd>${stateName(selectedFile.workingTree)}</dd></div>
          </dl>
        `}
      </section>
    `;
  }

  private renderChangedFiles(context: WorkspacePanelContext, status: GitStatusResponse): TemplateResult {
    return html`
      <section class="git-files" aria-label="Changed files">
        <div class="section-heading">
          <button class="section-toggle" type="button" aria-expanded="true">
            <span class="section-toggle-title">${renderIcon("chevron-down", "git-section-chevron")}<span>Changes</span></span>
            <span class="count-badge">${String(status.files.length)}</span>
          </button>
        </div>
        ${status.files.length === 0 ? html`<p class="muted empty-note">No changes.</p>` : html`
          <div class="git-file-list">
            ${status.files.map((file) => this.renderChangedFile(context, file))}
          </div>
        `}
      </section>
    `;
  }

  private renderChangedFile(context: WorkspacePanelContext, file: GitStatusFile): TemplateResult {
    const selected = context.selectedDiffPath === file.path;
    const visibleState = visibleGitState(file);
    const title = file.oldPath === undefined ? file.path : `${file.oldPath} → ${file.path}`;
    const stageable = hasStageableChange(file);
    const staged = hasStagedChange(file);
    const busy = this.pendingAction !== undefined;
    return html`
      <div class=${selected ? "git-file-row selected" : "git-file-row"} title=${title}>
        <button class="git-file-main" type="button" @click=${() => { context.onSelectDiff(file.path); }}>
          <span class=${`state-pill ${stateClass(visibleState)}`}>${stateLabel(visibleState)}</span>
          <span class="git-file-text">
            <span class="git-file-name">${fileName(file.path)}</span>
            <small>${file.oldPath === undefined ? parentPath(file.path) : `${file.oldPath} → ${parentPath(file.path)}`}</small>
          </span>
        </button>
        <div class="git-file-actions" aria-label=${`Actions for ${file.path}`}>
          ${stageable ? html`<button class="git-icon-button small" type="button" title="Stage change" aria-label=${`Stage ${file.path}`} ?disabled=${busy} @click=${(event: MouseEvent) => { this.stageFile(event, context, file.path); }}>${renderIcon("plus")}</button>` : null}
          ${staged ? html`<button class="git-icon-button small" type="button" title="Unstage change" aria-label=${`Unstage ${file.path}`} ?disabled=${busy} @click=${(event: MouseEvent) => { this.unstageFile(event, context, file.path); }}>${renderIcon("undo")}</button>` : null}
        </div>
      </div>
    `;
  }

  private renderGraph(context: WorkspacePanelContext): TemplateResult {
    const gitLog = context.gitLog;
    const branch = gitLog?.branch ?? context.gitStatus?.branch ?? "detached";
    const busy = this.pendingAction !== undefined;
    return html`
      <section class="git-graph" aria-label="Git graph">
        <div class="git-section-header graph-header">
          <div class="git-section-title">
            ${renderIcon("chevron-down", "git-section-chevron")}
            <strong>Graph</strong>
          </div>
          <div class="graph-toolbar" aria-label="Graph controls">
            <span class="graph-branch-tool" title=${branch}>${renderIcon("branch")}<span>${branch}</span></span>
            <button class="git-icon-button" type="button" title="Refresh Git" aria-label="Refresh Git" ?disabled=${busy} @click=${() => { void this.runAction("refresh-graph", () => { context.onRefreshGit(); }); }}>${renderIcon("refresh")}</button>
          </div>
        </div>
        ${gitLog === undefined ? html`
          <p class="muted empty-note">No history loaded.</p>
        ` : !gitLog.isGitRepo ? html`
          <p class="muted empty-note">No Git history available.</p>
        ` : gitLog.entries.length === 0 ? html`
          <p class="muted empty-note">No commits yet.</p>
        ` : html`
          <ol class="graph-list">
            ${gitLog.entries.map((entry, index) => this.renderGraphEntry(entry, index))}
          </ol>
        `}
      </section>
    `;
  }

  private renderGraphEntry(entry: GitLogEntry, index: number): TemplateResult {
    const first = index === 0;
    const refs = entry.refs.filter((ref) => ref !== "HEAD");
    return html`
      <li class=${first ? "graph-entry current" : "graph-entry"}>
        <span class="graph-line" aria-hidden="true"><span></span></span>
        <div class="graph-entry-main">
          <span class="graph-subject" title=${entry.subject}>${entry.subject}</span>
          ${refs.length === 0 ? null : html`<span class="graph-refs">${refs.slice(0, 2).map((ref) => html`<span>${formatRef(ref)}</span>`)}</span>`}
          <small>${entry.shortHash} · ${entry.authorName} · ${entry.relativeDate}</small>
        </div>
      </li>
    `;
  }

  private renderDiffViewer(context: WorkspacePanelContext): TemplateResult {
    if (context.selectedDiffPath === undefined || context.selectedDiffPath === "") return html`<p class="muted git-empty">Select a changed file.</p>`;
    const review = context.selectedReviewDiff;
    const unstaged = context.selectedDiff;
    const staged = context.selectedStagedDiff;
    if (review === undefined && (unstaged === undefined || staged === undefined)) return html`<p class="muted git-empty">Loading diff…</p>`;
    const liveDiffs = [staged, unstaged].filter((diff): diff is GitDiffResponse => diff !== undefined && diff.diff !== "" && (review === undefined || diff.committed !== true));
    const diffs = [review, ...liveDiffs].filter((diff): diff is GitDiffResponse | SelectedReviewDiff => diff !== undefined && diff.diff !== "");
    if (diffs.length === 0) return html`<p class="muted git-empty">No staged or unstaged diff.</p>`;
    const liveDiffLoaded = staged !== undefined && unstaged !== undefined;
    const hasCurrentWorkspaceDiff = [staged, unstaged].some((diff) => diff !== undefined && diff.diff !== "" && diff.committed !== true);
    return html`
      <div class=${diffs.length === 1 ? "diffs single" : "diffs"}>
        ${review !== undefined && liveDiffLoaded && !hasCurrentWorkspaceDiff ? html`
          <p class="review-note">Working tree is clean. Showing the saved diff from this session.</p>
        ` : null}
        ${diffs.map((diff) => renderDiffSection(diff))}
      </div>
    `;
  }

  private readonly handleCommitInput = (event: Event): void => {
    this.commitMessage = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : "";
  };

  private handleCommitKeyDown(event: KeyboardEvent, context: WorkspacePanelContext): void {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    void this.commit(context);
  }

  private handleCommitSubmit(event: SubmitEvent, context: WorkspacePanelContext): void {
    event.preventDefault();
    void this.commit(context);
  }

  private async commit(context: WorkspacePanelContext): Promise<void> {
    const message = this.commitMessage.trim();
    if (message === "") return;
    await this.runAction("commit", async () => {
      await context.onCommitGitChanges(message);
      this.commitMessage = "";
    });
  }

  private stageFile(event: MouseEvent, context: WorkspacePanelContext, path: string): void {
    event.stopPropagation();
    void this.runAction(`stage:${path}`, () => context.onStageGitFile(path));
  }

  private unstageFile(event: MouseEvent, context: WorkspacePanelContext, path: string): void {
    event.stopPropagation();
    void this.runAction(`unstage:${path}`, () => context.onUnstageGitFile(path));
  }

  private async runAction(action: string, callback: () => void | Promise<void>): Promise<void> {
    if (this.pendingAction !== undefined) return;
    this.pendingAction = action;
    this.actionError = "";
    try {
      await callback();
    } catch (error) {
      this.actionError = errorMessage(error);
    } finally {
      this.pendingAction = undefined;
    }
  }

  private readonly onSplitDividerPointerDown = (event: PointerEvent): void => {
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
    this.splitResize = { pointerId: event.pointerId, startClientX: event.clientX, startWidth: clampDetailsPanelWidth(this.detailsPanelWidth), handle };
    this.toggleAttribute("resizing", true);
  };

  private readonly onSplitDividerPointerMove = (event: PointerEvent): void => {
    const resize = this.splitResize;
    if (resize?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientX - resize.startClientX;
    this.detailsPanelWidth = clampDetailsPanelWidth(resize.startWidth - delta);
  };

  private readonly onSplitDividerPointerUp = (event: PointerEvent): void => {
    this.finishSplitResize(event.pointerId);
  };

  private readonly onSplitDividerPointerCancel = (event: PointerEvent): void => {
    this.finishSplitResize(event.pointerId);
  };

  private readonly onSplitDividerKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    const current = clampDetailsPanelWidth(this.detailsPanelWidth);
    let next = current;
    switch (event.key) {
      case "ArrowLeft": next = current + DETAILS_PANEL_KEYBOARD_STEP; break;
      case "ArrowRight": next = current - DETAILS_PANEL_KEYBOARD_STEP; break;
      case "Home": next = DETAILS_PANEL_MIN_WIDTH; break;
      case "End": next = DETAILS_PANEL_MAX_WIDTH; break;
    }
    event.preventDefault();
    event.stopPropagation();
    this.detailsPanelWidth = clampDetailsPanelWidth(next);
    writeStoredDetailsPanelWidth(this.detailsPanelWidth);
  };

  private finishSplitResize(pointerId: number): void {
    if (this.splitResize?.pointerId !== pointerId) return;
    try {
      this.splitResize.handle.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already be gone if the browser canceled the drag.
    }
    this.splitResize = undefined;
    this.toggleAttribute("resizing", false);
    writeStoredDetailsPanelWidth(clampDetailsPanelWidth(this.detailsPanelWidth));
  }

  static override styles = [
    workspacePanelStyles,
    css`
      :host { flex: 1 1 auto; min-height: 0; border-left: 0; box-shadow: none; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; clip-path: inset(50%); }
      .git-panel { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
      .git-sidebar-split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 8px minmax(0, var(--git-details-panel-width, 300px)); }
      .git-diff-viewer { min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; background: var(--pi-main-bg); }
      .git-diff-viewer .viewer-header { padding: 14px 18px; background: color-mix(in srgb, var(--pi-bg) 78%, transparent); }
      .git-sidebar-split-divider { position: relative; min-width: 0; min-height: 0; cursor: col-resize; touch-action: none; outline: none; }
      .git-sidebar-split-divider::after { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; transform: translateX(-50%); background: var(--pi-border-muted); transition: width .12s ease, background .12s ease; }
      .git-sidebar-split-divider:hover::after, .git-sidebar-split-divider:focus-visible::after, :host([resizing]) .git-sidebar-split-divider::after { width: 3px; background: var(--pi-accent); }
      .git-details-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border-left: 0; background: transparent; }
      .git-toolbar { flex: 0 0 auto; border-bottom: 1px solid var(--pi-border-muted); background: transparent; }
      .git-section-header { min-height: 36px; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 10px 4px 0; color: var(--pi-muted); }
      .git-section-title { min-width: 0; display: flex; align-items: center; gap: 4px; color: var(--pi-muted); letter-spacing: .04em; text-transform: uppercase; }
      .git-section-title strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font-size: 13px; font-weight: 700; line-height: 24px; }
      .git-section-chevron { --git-icon-size: 22px; margin-left: 0; color: var(--pi-text-secondary); }
      .git-toolbar-actions, .graph-toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; color: var(--pi-text-secondary); }
      .git-icon { width: var(--git-icon-size, 20px); height: var(--git-icon-size, 20px); display: block; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
      .git-icon-button { box-sizing: border-box; width: 28px; height: 28px; min-width: 28px; min-height: 28px; display: inline-grid; place-items: center; margin: 0; border: 0; border-radius: 5px; background: transparent; color: var(--pi-text-secondary); padding: 0; line-height: 1; }
      .git-icon-button .git-icon { --git-icon-size: 22px; }
      .git-icon-button.small { width: 24px; height: 24px; min-width: 24px; min-height: 24px; border-radius: 5px; }
      .git-icon-button.small .git-icon { --git-icon-size: 18px; }
      .git-icon-button:hover:not(:disabled) { background: color-mix(in srgb, var(--pi-text) 9%, transparent); color: var(--pi-text-bright); }
      .git-icon-button:disabled { opacity: .38; }
      .git-details-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 12px; }
      .commit-box { display: grid; gap: 9px; margin: 0 0 14px; }
      .commit-input-wrapper { position: relative; display: block; }
      .commit-box input { box-sizing: border-box; width: 100%; min-height: 36px; border: 1px solid color-mix(in srgb, var(--pi-accent) 85%, var(--pi-border-muted)); border-radius: 6px; background: color-mix(in srgb, var(--pi-bg) 82%, transparent); color: var(--pi-text); padding: 5px 38px 5px 12px; outline: none; font: inherit; font-size: 15px; line-height: 24px; }
      .commit-box input:focus { border-color: var(--pi-accent); box-shadow: 0 0 0 1px var(--pi-accent) inset; }
      .commit-box input::placeholder { color: var(--pi-muted); opacity: .86; }
      .commit-input-icon { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); color: var(--pi-muted); pointer-events: none; }
      .commit-input-icon .git-icon { --git-icon-size: 20px; stroke-width: 1.7; }
      .commit-button { width: 100%; min-height: 40px; display: inline-flex; align-items: center; gap: 8px; justify-content: center; border: 0; border-radius: 6px; background: var(--pi-accent); color: var(--pi-bg); font-size: 15px; font-weight: 650; }
      .commit-button .git-icon { --git-icon-size: 22px; stroke-width: 1.9; }
      .commit-button:hover:not(:disabled), .commit-button:focus-visible:not(:disabled) { filter: brightness(1.05); background: var(--pi-accent); }
      .commit-button:disabled { opacity: .55; }
      .action-error { margin: 0; border: 1px solid color-mix(in srgb, var(--pi-danger) 60%, var(--pi-border-muted)); border-radius: 10px; background: color-mix(in srgb, var(--pi-danger) 10%, transparent); color: var(--pi-danger); padding: 8px 10px; line-height: 1.35; overflow-wrap: anywhere; }
      .git-card { display: grid; gap: 7px; margin-bottom: 12px; border: 1px solid var(--pi-border-muted); border-radius: 14px; background: color-mix(in srgb, var(--pi-bg) 70%, transparent); padding: 12px; box-shadow: 0 1px 0 var(--pi-inset-highlight) inset; }
      .eyebrow { color: var(--pi-muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .repo-branch, .selected-file-path { min-width: 0; color: var(--pi-text-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .git-card small { display: block; min-width: 0; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .git-card dl { display: grid; gap: 6px; margin: 4px 0 0; }
      .git-card dl div { display: grid; grid-template-columns: minmax(72px, max-content) minmax(0, 1fr); gap: 8px; align-items: baseline; }
      .repo-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .git-card dt { color: var(--pi-muted); font-size: 12px; }
      .git-card dd { min-width: 0; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .card-note { margin: 0; }
      .section-heading { margin: 0 0 5px; }
      .section-toggle { width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; border: 0; background: transparent; color: var(--pi-text); padding: 0; font-size: 18px; font-weight: 650; }
      .section-toggle-title { flex: 1 1 auto; min-width: 0; display: inline-flex; align-items: center; gap: 4px; text-align: left; }
      .section-toggle-title > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .count-badge { flex: 0 0 auto; display: inline-grid; place-items: center; min-width: 24px; min-height: 24px; border-radius: 999px; background: color-mix(in srgb, var(--pi-text) 14%, transparent); color: var(--pi-muted); padding: 0 7px; font-size: 13px; }
      .git-file-list { display: grid; gap: 1px; margin: 0 0 14px; }
      .git-file-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px; min-height: 38px; border-radius: 8px; color: var(--pi-text); }
      .git-file-row:hover, .git-file-row.selected { background: color-mix(in srgb, var(--pi-text) 9%, transparent); }
      .git-file-main { min-width: 0; width: 100%; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 6px; border: 0; background: transparent; color: inherit; padding: 5px 6px; text-align: left; }
      .git-file-main:hover, .git-file-main:focus-visible { background: transparent; }
      .git-file-text { min-width: 0; display: flex; align-items: baseline; gap: 8px; }
      .git-file-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }
      .git-file-text small { flex: 0 10 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-muted); font-size: 12px; }
      .git-file-actions { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; padding-right: 4px; opacity: .72; }
      .git-file-row:hover .git-file-actions, .git-file-row.selected .git-file-actions { opacity: 1; }
      .state-pill { box-sizing: border-box; min-width: 22px; justify-self: center; display: inline-flex; justify-content: center; color: var(--pi-muted); font-size: 12px; font-weight: 800; line-height: 18px; }
      .state-pill.modified, .state-pill.renamed, .state-pill.copied { color: var(--pi-warning); }
      .state-pill.added, .state-pill.untracked { color: var(--pi-success); }
      .state-pill.deleted { color: var(--pi-danger); }
      .state-pill.conflicted { color: var(--pi-danger); }
      .git-graph { margin-top: 16px; border-top: 1px solid var(--pi-border-muted); padding-top: 4px; }
      .graph-header { margin-bottom: 7px; padding-right: 0; }
      .graph-toolbar { flex: 1 1 auto; min-width: 0; justify-content: flex-end; gap: 2px; }
      .graph-branch-tool { min-width: 0; max-width: 74px; height: 28px; display: inline-flex; align-items: center; gap: 5px; color: var(--pi-text-secondary); font-size: 13px; font-weight: 600; line-height: 1; text-transform: none; letter-spacing: 0; }
      .graph-branch-tool .git-icon { --git-icon-size: 22px; }
      .graph-branch-tool span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .graph-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
      .graph-entry { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr); min-height: 28px; }
      .graph-line { position: relative; display: grid; justify-items: center; }
      .graph-line::before { content: ""; position: absolute; top: 0; bottom: 0; width: 2px; background: color-mix(in srgb, var(--pi-purple) 82%, var(--pi-accent) 18%); }
      .graph-entry:first-child .graph-line::before { top: 50%; }
      .graph-entry:last-child .graph-line::before { bottom: 50%; }
      .graph-line span { position: relative; z-index: 1; width: 10px; height: 10px; margin-top: 8px; border-radius: 999px; background: var(--pi-purple); box-shadow: 0 0 0 2px color-mix(in srgb, var(--pi-bg) 82%, transparent); }
      .graph-entry.current .graph-line span { width: 12px; height: 12px; border: 2px solid var(--pi-accent); background: var(--pi-bg); }
      .graph-entry-main { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; column-gap: 8px; padding: 2px 0 6px; }
      .graph-subject { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; font-weight: 650; }
      .graph-entry-main small { grid-column: 1 / -1; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .graph-refs { display: inline-flex; gap: 4px; min-width: 0; }
      .graph-refs span { max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; border-radius: 999px; background: color-mix(in srgb, var(--pi-accent) 18%, transparent); color: var(--pi-accent); padding: 1px 7px; font-size: 12px; font-weight: 700; }
      .empty-note { margin: 10px 0; }
      .git-empty { margin: auto; padding: 24px; text-align: center; }
      .diffs { overflow: auto; }
      .review-note { margin: 0; border-bottom: 1px solid var(--pi-border-muted); background: color-mix(in srgb, var(--pi-info-bg) 72%, transparent); color: var(--pi-info); padding: 10px 18px; font-size: 13px; }
    `,
  ];
}

type GitIconName = "branch" | "check" | "chevron-down" | "plus" | "refresh" | "sparkles" | "undo";

function renderIcon(name: GitIconName, className = ""): SVGTemplateResult {
  const classes = className === "" ? "git-icon" : `git-icon ${className}`;
  switch (name) {
    case "branch": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="6" cy="5" r="2.5"></circle><circle cx="6" cy="19" r="2.5"></circle><circle cx="18" cy="12" r="2.5"></circle><path d="M6 7.5v9"></path><path d="M8.3 6.1c4.6 1 7.2 2.9 7.7 5.9"></path><path d="M8.3 17.9c4.6-1 7.2-2.9 7.7-5.9"></path></svg>`;
    case "check": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m4 12.5 5 5L20 6.5"></path></svg>`;
    case "chevron-down": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 9 7 7 7-7"></path></svg>`;
    case "plus": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>`;
    case "refresh": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.35-5.65"></path><path d="M20 4v6h-6"></path></svg>`;
    case "sparkles": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3 10.6 8.6 5 10l5.6 1.4L12 17l1.4-5.6L19 10l-5.6-1.4L12 3Z"></path><path d="M19 15l-.7 2.3L16 18l2.3.7L19 21l.7-2.3L22 18l-2.3-.7L19 15Z"></path></svg>`;
    case "undo": return svg`<svg class=${classes} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 7H4v5"></path><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"></path></svg>`;
  }
}

function renderDiffSection(diff: GitDiffResponse | SelectedReviewDiff): TemplateResult {
  loadUnifiedDiffViewer();
  const statusLabel = diffStatusLabel(diff);
  const statusClass = diffStatusClass(diff);
  return html`
    <section class="diff-section">
      <div class="viewer-header"><strong>${diff.path ?? "diff"}</strong><small class=${`diff-status ${statusClass}`}>${statusLabel}${diff.truncated ? " · truncated" : ""}</small></div>
      <unified-diff-viewer .diff=${diff.diff}></unified-diff-viewer>
    </section>
  `;
}

function diffStatusLabel(diff: GitDiffResponse | SelectedReviewDiff): string {
  if (isSelectedReviewDiff(diff)) return diff.label ?? "saved edit";
  return diff.committed === true ? "committed" : diff.staged ? "staged" : "unstaged";
}

function diffStatusClass(diff: GitDiffResponse | SelectedReviewDiff): string {
  if (isSelectedReviewDiff(diff)) return "session";
  return diff.committed === true ? "committed" : diff.staged ? "staged" : "unstaged";
}

function isSelectedReviewDiff(diff: GitDiffResponse | SelectedReviewDiff): diff is SelectedReviewDiff {
  return "source" in diff;
}

function loadUnifiedDiffViewer(): void {
  void import("./UnifiedDiffViewer");
}

function hasStagedChange(file: GitStatusFile): boolean {
  return file.index !== "unmodified" && file.index !== "untracked" && file.index !== "ignored";
}

function hasUnstagedChange(file: GitStatusFile): boolean {
  return file.workingTree !== "unmodified" && file.workingTree !== "ignored";
}

function hasStageableChange(file: GitStatusFile): boolean {
  return hasUnstagedChange(file) || (file.index === "untracked" && file.workingTree === "untracked");
}

function visibleGitState(file: GitStatusFile): GitFileState {
  if (hasStagedChange(file)) return file.index;
  return file.workingTree !== "unmodified" ? file.workingTree : file.index;
}

function stateLabel(state: GitFileState): string {
  return state.slice(0, 1).toUpperCase();
}

function stateName(state: GitFileState): string {
  return state === "unmodified" ? "Unmodified" : `${state.slice(0, 1).toUpperCase()}${state.slice(1)}`;
}

function stateClass(state: GitFileState): string {
  return state;
}

function fileName(path: string): string {
  const parts = path.split("/").filter((part) => part !== "");
  return parts.at(-1) ?? path;
}

function parentPath(path: string): string {
  const parts = path.split("/").filter((part) => part !== "");
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function formatRef(ref: string): string {
  if (ref.startsWith("HEAD -> ")) return ref.slice("HEAD -> ".length);
  return ref;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DETAILS_PANEL_STORAGE_KEY = "pi-web:git-details-panel-width:v1";
const DETAILS_PANEL_MIN_WIDTH = 220;
const DETAILS_PANEL_MAX_WIDTH = 1200;
const DETAILS_PANEL_DEFAULT_WIDTH = 300;
const DETAILS_PANEL_KEYBOARD_STEP = 24;

interface SplitResizeState {
  pointerId: number;
  startClientX: number;
  startWidth: number;
  handle: HTMLElement;
}

function clampDetailsPanelWidth(width: number): number {
  if (!Number.isFinite(width)) return DETAILS_PANEL_DEFAULT_WIDTH;
  return Math.round(Math.min(Math.max(width, DETAILS_PANEL_MIN_WIDTH), DETAILS_PANEL_MAX_WIDTH));
}

function readStoredDetailsPanelWidth(): number {
  try {
    if (typeof localStorage === "undefined") return DETAILS_PANEL_DEFAULT_WIDTH;
    const raw = localStorage.getItem(DETAILS_PANEL_STORAGE_KEY);
    if (raw === null || raw === "") return DETAILS_PANEL_DEFAULT_WIDTH;
    return clampDetailsPanelWidth(Number(raw));
  } catch {
    return DETAILS_PANEL_DEFAULT_WIDTH;
  }
}

function writeStoredDetailsPanelWidth(width: number): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(DETAILS_PANEL_STORAGE_KEY, String(clampDetailsPanelWidth(width)));
  } catch {
    // Ignore localStorage quota/privacy errors; the resized layout still applies in memory for this tab.
  }
}
