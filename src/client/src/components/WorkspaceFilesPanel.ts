import { css, html, LitElement, type PropertyValues, type TemplateResult } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { FileContentResponse, FileTreeEntry } from "../api";
import { workspaceImagePreviewUrl } from "../api/urls";
import { workspaceUploadPath } from "../api/workspaceUploads";
import type { WorkspaceUploadBatchState, WorkspaceUploadFileState } from "../workspaceUploadState";
import { MAX_IMAGE_PREVIEW_BYTES, MAX_IMAGE_PREVIEW_LABEL } from "../../../shared/workspaceFiles";
import type { WorkspacePanelContext } from "../plugins/types";
import { workspacePanelStyles } from "./shared";

interface PendingWorkspaceUploadReview {
  files: File[];
}

interface FileContextMenuState {
  entry: FileTreeEntry;
  x: number;
  y: number;
}

type WorkspaceFilesPanelVariant = "split" | "sidebar" | "viewer" | "sidebar-split";

export interface WorkspaceUploadScope {
  projectId: string;
  workspaceId: string;
  machineId: string;
}

@customElement("workspace-files-panel")
export class WorkspaceFilesPanel extends LitElement {
  @property({ attribute: false }) context: WorkspacePanelContext | undefined;
  @property({ reflect: true }) variant: WorkspaceFilesPanelVariant = "split";
  @query("#workspace-upload-input") private uploadInput?: HTMLInputElement;
  @state() private pendingUpload: PendingWorkspaceUploadReview | undefined;
  @state() private filterText = "";
  @state() private destinationFolder = "";
  @state() private overwrite = false;
  @state() private createDirs = true;
  @state() private formError = "";
  @state() private dragActive = false;
  @state() private treePanelWidth = readStoredTreePanelWidth();
  @state() private fileContextMenu: FileContextMenuState | undefined;
  private dragDepth = 0;
  private splitResize: SplitResizeState | undefined;
  private fileContextMenuListeners: AbortController | undefined;

  protected override willUpdate(changedProperties: PropertyValues<this>): void {
    if (!changedProperties.has("context")) return;
    const previous = changedProperties.get("context");
    if (previous !== undefined && this.context !== undefined && workspaceContextKey(previous) !== workspaceContextKey(this.context)) {
      this.resetPendingUpload();
      this.closeFileContextMenu();
    }
  }

  override render(): TemplateResult {
    const context = this.context;
    if (context === undefined) return html`<p class="muted">Files unavailable.</p>`;
    if (this.variant === "viewer") return this.renderViewerPanel(context);
    if (this.variant === "sidebar") return this.renderSidebarPanel(context);
    if (this.variant === "sidebar-split") return this.renderSidebarSplitPanel(context);
    return this.renderSplitPanel(context);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.uninstallFileContextMenuListeners();
  }

  private renderSplitPanel(context: WorkspacePanelContext): TemplateResult {
    return html`
      <section
        class=${this.dragActive ? "files-panel dragging" : "files-panel"}
        @dragenter=${this.handleDragEnter}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        <section class="toolbar">
          <strong>Files</strong>
          ${context.fileTreeStale ? html`<span class="stale">stale</span>` : null}
          <div class="toolbar-actions">
            <button @click=${this.openFilePicker}>Upload</button>
            <button @click=${context.onRefreshFiles}>Refresh</button>
          </div>
          ${this.renderUploadInput()}
        </section>
        ${this.renderUploadProgress(context)}
        <section class="split">
          <div class="list tree">
            ${context.fileTree.length === 0 ? html`<p class="muted">No files loaded.</p>` : context.fileTree.map((entry) => this.renderTreeEntry(context, entry, 0))}
          </div>
          <div class="viewer">
            ${this.renderFileViewer(context)}
          </div>
        </section>
        ${this.renderDropOverlay()}
        ${this.renderFileContextMenu(context)}
        ${this.pendingUpload === undefined ? null : this.renderUploadDialog(context, this.pendingUpload)}
      </section>
    `;
  }

  private renderSidebarPanel(context: WorkspacePanelContext): TemplateResult {
    const filteredTree = this.filteredFileTree(context);
    return html`
      <section
        class=${this.dragActive ? "files-panel files-sidebar dragging" : "files-panel files-sidebar"}
        @dragenter=${this.handleDragEnter}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        <section class="sidebar-toolbar" aria-label="File sidebar actions">
          <button class="icon-button" title="More file actions" aria-label="More file actions">…</button>
          <button class="open-button" @click=${this.openFilePicker}>Open <span aria-hidden="true">⌄</span></button>
          <button class="icon-button" title="Upload files" aria-label="Upload files" @click=${this.openFilePicker}>${folderIcon()}</button>
          ${this.renderUploadInput()}
        </section>
        ${this.renderUploadProgress(context)}
        <label class="filter-box">
          ${searchIcon()}
          <input type="search" placeholder="Filter files…" autocomplete="off" spellcheck="false" .value=${this.filterText} @input=${this.handleFilterInput}>
        </label>
        <section class="list tree sidebar-list" aria-label="Workspace files">
          ${context.fileTree.length === 0 ? html`<p class="muted">No files loaded.</p>` : filteredTree.length === 0 ? html`<p class="muted">No files match your filter.</p>` : filteredTree.map((entry) => this.renderTreeEntry(context, entry, 0, this.filterText.trim().toLocaleLowerCase()))}
        </section>
        ${this.renderDropOverlay()}
        ${this.renderFileContextMenu(context)}
        ${this.pendingUpload === undefined ? null : this.renderUploadDialog(context, this.pendingUpload)}
      </section>
    `;
  }

  private renderSidebarSplitPanel(context: WorkspacePanelContext): TemplateResult {
    const filteredTree = this.filteredFileTree(context);
    const treeWidth = clampTreePanelWidth(this.treePanelWidth);
    return html`
      <section
        class=${this.dragActive ? "files-panel files-sidebar dragging" : "files-panel files-sidebar"}
        @dragenter=${this.handleDragEnter}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        <section class="sidebar-toolbar" aria-label="File sidebar actions">
          <button class="icon-button" title="More file actions" aria-label="More file actions">…</button>
          <button class="open-button" @click=${this.openFilePicker}>Open <span aria-hidden="true">⌄</span></button>
          <button class="icon-button" title="Upload files" aria-label="Upload files" @click=${this.openFilePicker}>${folderIcon()}</button>
          ${this.renderUploadInput()}
        </section>
        ${this.renderUploadProgress(context)}
        <div class="sidebar-split" style=${`--files-tree-panel-width: ${String(treeWidth)}px;`}>
          <div class="sidebar-split-viewer">
            ${this.renderFileViewer(context)}
          </div>
          <div
            class="sidebar-split-divider"
            role="separator"
            aria-label="Resize file tree"
            aria-orientation="vertical"
            aria-valuemin=${String(TREE_PANEL_MIN_WIDTH)}
            aria-valuemax=${String(TREE_PANEL_MAX_WIDTH)}
            aria-valuenow=${String(treeWidth)}
            tabindex="0"
            @pointerdown=${this.onSplitDividerPointerDown}
            @pointermove=${this.onSplitDividerPointerMove}
            @pointerup=${this.onSplitDividerPointerUp}
            @pointercancel=${this.onSplitDividerPointerCancel}
            @keydown=${this.onSplitDividerKeyDown}
          ></div>
          <div class="sidebar-split-tree">
            <label class="filter-box">
              ${searchIcon()}
              <input type="search" placeholder="Filter files…" autocomplete="off" spellcheck="false" .value=${this.filterText} @input=${this.handleFilterInput}>
            </label>
            <section class="list tree sidebar-list" aria-label="Workspace files">
              ${context.fileTree.length === 0 ? html`<p class="muted">No files loaded.</p>` : filteredTree.length === 0 ? html`<p class="muted">No files match your filter.</p>` : filteredTree.map((entry) => this.renderTreeEntry(context, entry, 0, this.filterText.trim().toLocaleLowerCase()))}
            </section>
          </div>
        </div>
        ${this.renderDropOverlay()}
        ${this.renderFileContextMenu(context)}
        ${this.pendingUpload === undefined ? null : this.renderUploadDialog(context, this.pendingUpload)}
      </section>
    `;
  }

  private renderViewerPanel(context: WorkspacePanelContext): TemplateResult {
    return html`
      <section class="files-panel file-view-page">
        ${this.renderFileViewer(context)}
      </section>
    `;
  }

  private renderUploadInput(): TemplateResult {
    return html`<input id="workspace-upload-input" class="visually-hidden" type="file" multiple @change=${this.handleFileInputChange} />`;
  }

  private renderDropOverlay(): TemplateResult {
    return html`
      <div class="drop-overlay" aria-hidden=${this.dragActive ? "false" : "true"}>
        <div>
          <strong>Drop files to upload</strong>
          <span>Uploads immediately to the default folder.</span>
        </div>
      </div>
    `;
  }

  private renderFileContextMenu(context: WorkspacePanelContext): TemplateResult | null {
    const menu = this.fileContextMenu;
    if (menu === undefined) return null;
    const absolutePath = workspaceFileAbsolutePath(context.workspace.path, menu.entry.path);
    return html`
      <div
        class="file-context-menu"
        role="menu"
        style=${`left:${String(menu.x)}px;top:${String(menu.y)}px;`}
        @contextmenu=${preventMenuEvent}
        @pointerdown=${stopMenuEvent}
      >
        <button role="menuitem" @click=${() => { void this.copyMenuText(absolutePath); }}>Copy Path</button>
        <button role="menuitem" @click=${() => { void this.copyMenuText(menu.entry.path); }}>Copy Relative Path</button>
        <div class="menu-separator" role="separator"></div>
        <button role="menuitem" @click=${() => { this.renameMenuFile(context, menu.entry); }}>Rename…</button>
        <button class="danger" role="menuitem" @click=${() => { this.deleteMenuFile(context, menu.entry); }}>
          <span>Delete Permanently</span>
          <span class="shortcut" aria-hidden="true">⌘⌫</span>
        </button>
      </div>
    `;
  }

  private renderTreeEntry(context: WorkspacePanelContext, entry: FileTreeEntry, depth: number, filter = ""): TemplateResult {
    const children = this.treeChildrenForEntry(context, entry, filter);
    const hasChildren = context.expandedDirs[entry.path] !== undefined;
    const selected = entry.type !== "directory" && context.selectedFilePath === entry.path;
    return html`
      <button
        class=${selected ? "row selected" : "row"}
        style=${`--depth:${String(depth)}`}
        @click=${() => { this.selectTreeEntry(context, entry); }}
        @contextmenu=${(event: MouseEvent) => { this.openFileContextMenu(event, entry); }}
      >
        <span>${entry.type === "directory" ? (hasChildren ? "▾" : "▸") : fileIcon(entry)}</span>
        <span>${entry.name}</span>
      </button>
      ${hasChildren ? children.map((child) => this.renderTreeEntry(context, child, depth + 1, filter)) : null}
    `;
  }

  private selectTreeEntry(context: WorkspacePanelContext, entry: FileTreeEntry): void {
    if (entry.type === "directory") context.onExpandDir(entry.path);
    else context.onSelectFile(entry.path);
  }

  private openFileContextMenu(event: MouseEvent, entry: FileTreeEntry): void {
    if (entry.type !== "file") return;
    event.preventDefault();
    event.stopPropagation();
    this.fileContextMenu = { entry, ...this.clampedFileContextMenuPosition(event.clientX, event.clientY) };
    this.installFileContextMenuListeners();
  }

  private closeFileContextMenu(): void {
    this.fileContextMenu = undefined;
    this.uninstallFileContextMenuListeners();
  }

  private async copyMenuText(text: string): Promise<void> {
    this.closeFileContextMenu();
    await writeClipboard(text);
  }

  private renameMenuFile(context: WorkspacePanelContext, entry: FileTreeEntry): void {
    this.closeFileContextMenu();
    const nextName = prompt("Rename file", entry.name);
    const trimmed = nextName?.trim();
    if (trimmed === undefined || trimmed === "") return;
    const nextPath = pathForRename(entry.path, trimmed);
    if (nextPath === entry.path) return;
    void context.onRenameFile(entry.path, nextPath);
  }

  private deleteMenuFile(context: WorkspacePanelContext, entry: FileTreeEntry): void {
    this.closeFileContextMenu();
    if (!confirm(`Delete ${entry.path} permanently? This cannot be undone.`)) return;
    void context.onDeleteFile(entry.path);
  }

  private clampedFileContextMenuPosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.getBoundingClientRect();
    const menuWidth = 240;
    const menuHeight = 170;
    const padding = 8;
    const maxX = Math.max(padding, rect.width - menuWidth - padding);
    const maxY = Math.max(padding, rect.height - menuHeight - padding);
    return {
      x: Math.min(Math.max(clientX - rect.left, padding), maxX),
      y: Math.min(Math.max(clientY - rect.top, padding), maxY),
    };
  }

  private installFileContextMenuListeners(): void {
    this.uninstallFileContextMenuListeners();
    this.fileContextMenuListeners = new AbortController();
    const { signal } = this.fileContextMenuListeners;
    window.addEventListener("pointerdown", this.onWindowPointerDown, { signal });
    window.addEventListener("keydown", this.onWindowKeyDown, { signal });
    window.addEventListener("blur", this.onWindowBlur, { signal });
    window.addEventListener("resize", this.onWindowResize, { signal });
  }

  private uninstallFileContextMenuListeners(): void {
    this.fileContextMenuListeners?.abort();
    this.fileContextMenuListeners = undefined;
  }

  private readonly onWindowPointerDown = (): void => {
    this.closeFileContextMenu();
  };

  private readonly onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeFileContextMenu();
      return;
    }
    const menu = this.fileContextMenu;
    const context = this.context;
    if (menu === undefined || context === undefined || !isDeletePermanentlyShortcut(event)) return;
    event.preventDefault();
    this.deleteMenuFile(context, menu.entry);
  };

  private readonly onWindowBlur = (): void => {
    this.closeFileContextMenu();
  };

  private readonly onWindowResize = (): void => {
    this.closeFileContextMenu();
  };

  private filteredFileTree(context: WorkspacePanelContext): FileTreeEntry[] {
    const filter = this.filterText.trim().toLocaleLowerCase();
    if (filter === "") return context.fileTree;
    return context.fileTree.filter((entry) => this.entryMatchesFilter(context, entry, filter));
  }

  private treeChildrenForEntry(context: WorkspacePanelContext, entry: FileTreeEntry, filter: string): FileTreeEntry[] {
    const children = context.expandedDirs[entry.path] ?? [];
    if (filter === "" || this.entryTextMatchesFilter(entry, filter)) return children;
    return children.filter((child) => this.entryMatchesFilter(context, child, filter));
  }

  private entryMatchesFilter(context: WorkspacePanelContext, entry: FileTreeEntry, filter: string): boolean {
    if (this.entryTextMatchesFilter(entry, filter)) return true;
    return (context.expandedDirs[entry.path] ?? []).some((child) => this.entryMatchesFilter(context, child, filter));
  }

  private entryTextMatchesFilter(entry: FileTreeEntry, filter: string): boolean {
    return entry.name.toLocaleLowerCase().includes(filter) || entry.path.toLocaleLowerCase().includes(filter);
  }

  private renderFileViewer(context: WorkspacePanelContext): TemplateResult {
    const file = context.selectedFileContent;
    if (context.selectedFilePath === undefined || context.selectedFilePath === "") return html`<p class="muted">Select a file.</p>`;
    if (file === undefined) return html`<p class="muted">Loading ${context.selectedFilePath}…</p>`;
    if (file.mediaType === "image") return this.renderImageViewer(context, file);
    if (file.binary) return html`<p class="muted">Binary file: ${file.path} · ${formatFileSize(file.size)}</p>`;
    loadCodeViewer();
    return html`
      <div class="viewer-header"><strong>${file.path}</strong><small>${file.language ?? "text"}${file.truncated ? " · truncated" : ""}</small></div>
      <code-viewer .content=${file.content} .language=${file.language}></code-viewer>
    `;
  }

  private renderImageViewer(context: WorkspacePanelContext, file: FileContentResponse): TemplateResult {
    const metadata = `${file.mimeType ?? "image"} · ${formatFileSize(file.size)}`;
    if (file.size > MAX_IMAGE_PREVIEW_BYTES) {
      return html`
        <div class="viewer-header"><strong>${file.path}</strong><small>${metadata}</small></div>
        <p class="muted">Image too large to preview: ${formatFileSize(file.size)} · limit ${MAX_IMAGE_PREVIEW_LABEL}</p>
      `;
    }
    const src = workspaceImagePreviewUrl(context.workspace.projectId, context.workspace.id, file.path, { modifiedAt: file.modifiedAt, machineId: context.machine.id });
    return html`
      <div class="viewer-header"><strong>${file.path}</strong><small>${metadata}</small></div>
      <div class="image-preview">
        <img src=${src} alt=${file.path} decoding="async" />
      </div>
    `;
  }

  private renderUploadProgress(context: WorkspacePanelContext): TemplateResult | null {
    const batches = workspaceUploadBatchesForScope(context.state.workspaceUploadBatches, {
      projectId: context.workspace.projectId,
      workspaceId: context.workspace.id,
      machineId: context.machine.id,
    });
    if (batches.length === 0) return null;
    return html`
      <section class="upload-progress" aria-label="Workspace uploads">
        <div class="upload-progress-header">
          <strong>Uploads</strong>
          <small>${uploadSummaryLabel(batches)}</small>
        </div>
        ${batches.map((batch) => this.renderUploadBatch(context, batch))}
      </section>
    `;
  }

  private renderUploadBatch(context: WorkspacePanelContext, batch: WorkspaceUploadBatchState): TemplateResult {
    return html`
      <article class=${`upload-batch ${batch.status}`}>
        <div class="upload-batch-heading">
          <div>
            <strong>${uploadBatchTitle(batch)}</strong>
            <small>${batch.destinationFolder === "" ? "workspace root" : batch.destinationFolder}</small>
          </div>
          <span>${uploadBatchStatusLabel(batch)}</span>
        </div>
        <progress max="1" .value=${uploadBatchProgressValue(batch)}></progress>
        <div class="upload-file-list">
          ${batch.files.map((file) => this.renderUploadFile(file))}
        </div>
        <div class="upload-actions">
          ${batch.status === "uploading" ? html`<button @click=${() => { context.onCancelWorkspaceUpload(batch.id); }}>Cancel</button>` : html`<button @click=${() => { context.onClearWorkspaceUpload(batch.id); }}>Dismiss</button>`}
        </div>
      </article>
    `;
  }

  private renderUploadFile(file: WorkspaceUploadFileState): TemplateResult {
    const detail = uploadFileDetail(file);
    return html`
      <div class=${`upload-file ${file.status}`}>
        <div class="upload-file-main">
          <span>${file.name}</span>
          <small>${detail}</small>
        </div>
        <span class="upload-file-status">${uploadFileStatusLabel(file)}</span>
      </div>
    `;
  }

  private renderUploadDialog(context: WorkspacePanelContext, review: PendingWorkspaceUploadReview): TemplateResult {
    const fileCount = review.files.length;
    return html`
      <div class="dialog-backdrop" @mousedown=${() => { this.closeUploadDialog(); }}>
        <section class="upload-dialog" role="dialog" aria-modal="true" aria-label="Review file upload" @mousedown=${(event: MouseEvent) => { event.stopPropagation(); }} @keydown=${this.handleDialogKeyDown}>
          <header>
            <div>
              <span class="eyebrow">Upload</span>
              <h2>Review ${fileCount === 1 ? "file" : `${String(fileCount)} files`}</h2>
            </div>
            <button class="close-button" title="Cancel upload" aria-label="Cancel upload" @click=${() => { this.closeUploadDialog(); }}>×</button>
          </header>
          <form @submit=${(event: SubmitEvent) => { this.submitUploadReview(event, context, review); }}>
            <label>
              <span>Destination folder</span>
              <input .value=${this.destinationFolder} placeholder=${context.workspaceUploadDefaultFolder} @input=${this.handleDestinationInput} />
              <small>Workspace-relative. Leave empty to upload at the workspace root.</small>
            </label>
            <div class="dialog-options">
              <label>
                <input type="checkbox" .checked=${this.createDirs} @change=${this.handleCreateDirsChange} />
                <span>Create parent folders</span>
              </label>
              <label>
                <input type="checkbox" .checked=${this.overwrite} @change=${this.handleOverwriteChange} />
                <span>Overwrite existing files</span>
              </label>
            </div>
            <section class="review-files" aria-label="Files to upload">
              <strong>${fileCount === 1 ? "File" : "Files"}</strong>
              ${review.files.map((file) => html`
                <div class="review-file">
                  <span>${file.name}</span>
                  <small>${formatFileSize(file.size)}</small>
                </div>
              `)}
            </section>
            ${this.formError === "" ? null : html`<div class="dialog-error" role="alert">${this.formError}</div>`}
            <footer>
              <button type="button" @click=${() => { this.closeUploadDialog(); }}>Cancel</button>
              <button type="submit">Upload</button>
            </footer>
          </form>
        </section>
      </div>
    `;
  }

  private readonly onSplitDividerPointerDown = (event: PointerEvent): void => {
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement) || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    handle.setPointerCapture(event.pointerId);
    this.splitResize = { pointerId: event.pointerId, startClientX: event.clientX, startWidth: clampTreePanelWidth(this.treePanelWidth), handle };
    this.toggleAttribute("resizing", true);
  };

  private readonly onSplitDividerPointerMove = (event: PointerEvent): void => {
    const resize = this.splitResize;
    if (resize?.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientX - resize.startClientX;
    this.treePanelWidth = clampTreePanelWidth(resize.startWidth - delta);
  };

  private readonly onSplitDividerPointerUp = (event: PointerEvent): void => {
    this.finishSplitResize(event.pointerId);
  };

  private readonly onSplitDividerPointerCancel = (event: PointerEvent): void => {
    this.finishSplitResize(event.pointerId);
  };

  private readonly onSplitDividerKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    const current = clampTreePanelWidth(this.treePanelWidth);
    let next = current;
    switch (event.key) {
      case "ArrowLeft": next = current + TREE_PANEL_KEYBOARD_STEP; break;
      case "ArrowRight": next = current - TREE_PANEL_KEYBOARD_STEP; break;
      case "Home": next = TREE_PANEL_MIN_WIDTH; break;
      case "End": next = TREE_PANEL_MAX_WIDTH; break;
    }
    event.preventDefault();
    event.stopPropagation();
    this.treePanelWidth = clampTreePanelWidth(next);
    writeStoredTreePanelWidth(this.treePanelWidth);
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
    writeStoredTreePanelWidth(clampTreePanelWidth(this.treePanelWidth));
  }

  private readonly openFilePicker = (): void => {
    this.uploadInput?.click();
  };

  private readonly handleFileInputChange = (event: Event): void => {
    const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : undefined;
    const files = fileListToArray(input?.files);
    if (input !== undefined) input.value = "";
    if (files.length > 0) this.openUploadReview(files);
  };

  private readonly handleFilterInput = (event: Event): void => {
    this.filterText = event.currentTarget instanceof HTMLInputElement ? event.currentTarget.value : "";
  };

  private readonly handleDragEnter = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    this.dragDepth += 1;
    this.dragActive = true;
  };

  private readonly handleDragOver = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer !== null) event.dataTransfer.dropEffect = "copy";
    this.dragActive = true;
  };

  private readonly handleDragLeave = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) this.dragActive = false;
  };

  private readonly handleDrop = (event: DragEvent): void => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    this.dragDepth = 0;
    this.dragActive = false;
    const files = fileListToArray(event.dataTransfer?.files);
    const context = this.context;
    if (files.length > 0 && context !== undefined) startDirectWorkspaceUpload(context, files);
  };

  private readonly handleDestinationInput = (event: Event): void => {
    const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : undefined;
    this.destinationFolder = input?.value ?? "";
    this.formError = "";
  };

  private readonly handleCreateDirsChange = (event: Event): void => {
    const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : undefined;
    this.createDirs = input?.checked ?? true;
  };

  private readonly handleOverwriteChange = (event: Event): void => {
    const input = event.currentTarget instanceof HTMLInputElement ? event.currentTarget : undefined;
    this.overwrite = input?.checked ?? false;
  };

  private readonly handleDialogKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.closeUploadDialog();
  };

  private openUploadReview(files: File[]): void {
    const context = this.context;
    const defaults = workspaceUploadReviewDefaults(context?.workspaceUploadDefaultFolder ?? "");
    this.pendingUpload = { files };
    this.destinationFolder = defaults.destinationFolder;
    this.overwrite = defaults.overwrite;
    this.createDirs = defaults.createDirs;
    this.formError = "";
  }

  private submitUploadReview(event: SubmitEvent, context: WorkspacePanelContext, review: PendingWorkspaceUploadReview): void {
    event.preventDefault();
    const validationError = workspaceUploadReviewError(review.files, this.destinationFolder);
    if (validationError !== undefined) {
      this.formError = validationError;
      return;
    }
    const run = context.onStartWorkspaceUpload(review.files, {
      destinationFolder: this.destinationFolder,
      createDirs: this.createDirs,
      overwrite: this.overwrite,
      selectUploadedFile: true,
    });
    if (run !== undefined) this.closeUploadDialog();
  }

  private closeUploadDialog(): void {
    this.pendingUpload = undefined;
    this.formError = "";
  }

  private resetPendingUpload(): void {
    this.closeUploadDialog();
    this.dragDepth = 0;
    this.dragActive = false;
  }

  static override styles = [
    workspacePanelStyles,
    css`
      :host { flex: 1 1 auto; }
      :host([variant="viewer"]) { background: var(--pi-main-bg); border-left: 0; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; font-size: 14px; }
      .files-panel { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
      .file-view-page { background: var(--pi-main-bg); }
      .sidebar-split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 8px minmax(0, var(--files-tree-panel-width, 280px)); }
      .sidebar-split-tree { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .sidebar-split-tree .filter-box { margin: 12px 12px 4px; }
      .sidebar-split-tree .sidebar-list { flex: 1 1 auto; border-bottom: 0; padding: 0 10px 12px; }
      .sidebar-split-divider { position: relative; min-width: 0; min-height: 0; cursor: col-resize; touch-action: none; outline: none; }
      .sidebar-split-divider::after { content: ""; position: absolute; top: 0; bottom: 0; left: 50%; width: 1px; transform: translateX(-50%); background: var(--pi-border-muted); transition: width .12s ease, background .12s ease; }
      .sidebar-split-divider:hover::after, .sidebar-split-divider:focus-visible::after, :host([resizing]) .sidebar-split-divider::after { width: 3px; background: var(--pi-accent); }
      .sidebar-split-viewer { min-width: 0; min-height: 0; overflow: auto; display: flex; flex-direction: column; background: var(--pi-main-bg); }
      .sidebar-split-viewer .viewer-header { position: sticky; top: 0; padding: 14px 18px; background: color-mix(in srgb, var(--pi-bg) 78%, transparent); }
      .file-view-page .viewer-header { padding: 14px 18px; background: color-mix(in srgb, var(--pi-bg) 78%, transparent); }
      .file-view-page code-viewer { background: var(--pi-main-bg); }
      .toolbar-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
      .toolbar .toolbar-actions button { margin-left: 0; }
      .sidebar-toolbar { flex: 0 0 auto; display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 12px 12px 8px; border-bottom: 1px solid var(--pi-border-muted); background: transparent; }
      .sidebar-toolbar button { margin-left: 0; border-color: var(--pi-border-muted); border-radius: 12px; background: color-mix(in srgb, var(--pi-surface) 86%, transparent); min-height: 38px; font-weight: 650; }
      .sidebar-toolbar .icon-button { width: 38px; justify-content: center; padding: 0; font-size: 20px; line-height: 1; }
      .sidebar-toolbar .open-button { gap: 8px; padding-inline: 14px; color: var(--pi-text-bright); }
      .sidebar-toolbar svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .filter-box { flex: 0 0 auto; box-sizing: border-box; display: flex; align-items: center; gap: 9px; margin: 12px 12px 4px; border: 1px solid var(--pi-border-muted); border-radius: 14px; background: color-mix(in srgb, var(--pi-bg) 82%, transparent); color: var(--pi-muted); padding: 10px 12px; }
      .filter-box svg { flex: 0 0 auto; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .filter-box input { flex: 1 1 auto; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--pi-text); font: inherit; }
      .filter-box input::placeholder { color: var(--pi-muted); }
      .sidebar-list { flex: 1 1 auto; border-bottom: 0; padding: 0 10px 12px; }
      .sidebar-list .row { grid-template-columns: 22px minmax(0, 1fr); align-items: center; min-height: 38px; border-radius: 10px; color: var(--pi-text); font-size: 13.5px; }
      .sidebar-list .row:hover { background: color-mix(in srgb, var(--pi-text) 7%, transparent); }
      .sidebar-list .row.selected { background: color-mix(in srgb, var(--pi-text) 10%, transparent); color: var(--pi-text-bright); }
      .file-context-menu { position: absolute; z-index: 50; box-sizing: border-box; min-width: 230px; padding: 6px 0; border: 1px solid var(--pi-elevated-border); border-radius: 10px; background: var(--pi-elevated-bg); color: var(--pi-text); box-shadow: 0 16px 38px var(--pi-shadow), 0 1px 0 var(--pi-inset-highlight) inset; }
      .file-context-menu button { width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 0; padding: 6px 14px; border: 0; border-radius: 0; background: transparent; color: inherit; font: inherit; text-align: left; }
      .file-context-menu button:hover, .file-context-menu button:focus-visible { background: color-mix(in srgb, var(--pi-text) 9%, transparent); color: var(--pi-text-bright); outline: none; }
      .file-context-menu button.danger:hover, .file-context-menu button.danger:focus-visible { background: color-mix(in srgb, var(--pi-danger) 14%, transparent); color: var(--pi-danger); }
      .file-context-menu .shortcut { color: var(--pi-muted); font-size: 12px; }
      .menu-separator { height: 1px; margin: 6px 0; background: var(--pi-border-muted); }
      .file-glyph { color: var(--pi-success); font-weight: 800; letter-spacing: -.08em; }
      .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
      .drop-overlay { position: absolute; inset: 52px 10px 10px; z-index: 15; display: grid; place-items: center; border: 2px dashed var(--pi-accent); border-radius: 12px; background: color-mix(in srgb, var(--pi-bg-overlay) 90%, var(--pi-accent) 10%); color: var(--pi-text); opacity: 0; pointer-events: none; transition: opacity .12s ease; }
      .files-panel.dragging .drop-overlay { opacity: 1; }
      .drop-overlay div { display: grid; gap: 4px; justify-items: center; padding: 18px; border-radius: 10px; background: var(--pi-bg-overlay); box-shadow: 0 8px 24px var(--pi-shadow); }
      .drop-overlay span { color: var(--pi-muted); }
      .upload-progress { flex: 0 0 auto; display: grid; gap: 8px; padding: 8px; border-bottom: 1px solid var(--pi-border-muted); background: color-mix(in srgb, var(--pi-surface) 55%, transparent); }
      .upload-progress-header, .upload-batch-heading, .upload-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .upload-batch { display: grid; gap: 6px; border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-bg); padding: 8px; }
      .upload-batch.error { border-color: var(--pi-danger); }
      .upload-batch.cancelled { border-color: var(--pi-warning-border); }
      .upload-batch.completed { border-color: var(--pi-success-border); }
      .upload-batch-heading > div { min-width: 0; display: grid; gap: 2px; }
      .upload-batch-heading strong, .upload-batch-heading small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      progress { width: 100%; accent-color: var(--pi-accent); }
      .upload-file-list { display: grid; gap: 4px; max-height: 180px; overflow: auto; padding-right: 2px; }
      .upload-file { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; color: var(--pi-muted); }
      .upload-file.completed .upload-file-status { color: var(--pi-success); }
      .upload-file.error { color: var(--pi-danger); }
      .upload-file.cancelled .upload-file-status { color: var(--pi-warning); }
      .upload-file-main { min-width: 0; display: grid; gap: 1px; }
      .upload-file-main span, .upload-file-main small { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .upload-file-status { font-size: 12px; white-space: nowrap; }
      .upload-actions { justify-content: end; }
      .dialog-backdrop {
        position: fixed;
        inset: 0;
        z-index: 100;
        box-sizing: border-box;
        display: grid;
        place-items: center;
        padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
        background: var(--pi-backdrop);
        backdrop-filter: blur(18px) saturate(115%);
        -webkit-backdrop-filter: blur(18px) saturate(115%);
      }
      .upload-dialog {
        --codex-dialog-panel: color-mix(in srgb, var(--pi-surface) 78%, var(--pi-bg) 22%);
        --codex-dialog-panel-hover: color-mix(in srgb, var(--pi-text) 9%, transparent);
        --codex-dialog-border: var(--pi-elevated-border);
        --codex-dialog-hairline: color-mix(in srgb, var(--pi-border-muted) 70%, transparent);
        --codex-dialog-focus: color-mix(in srgb, var(--pi-text-bright) 34%, var(--pi-accent) 66%);
        box-sizing: border-box;
        width: min(560px, 100%);
        max-height: min(720px, 100%);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid var(--codex-dialog-border);
        border-radius: 18px;
        background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 80px), var(--pi-elevated-bg);
        box-shadow: 0 24px 80px var(--pi-backdrop), 0 1px 0 var(--pi-inset-highlight) inset;
      }
      .upload-dialog header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 58%, transparent); }
      .upload-dialog h2 { margin: 2px 0 0; color: var(--pi-text-bright); font-size: 18px; line-height: 1.2; }
      .eyebrow { color: var(--pi-muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
      .close-button { border-color: transparent; background: transparent; color: var(--pi-muted); font-size: 20px; line-height: 1; padding: 4px 9px; }
      .close-button:hover, .close-button:focus { color: var(--pi-text-bright); background: var(--codex-dialog-panel-hover); }
      form { min-height: 0; display: flex; flex-direction: column; gap: 13px; overflow: auto; padding: 16px; scrollbar-width: thin; }
      form > label { display: grid; gap: 7px; }
      form > label > span, .review-files > strong { font-weight: 600; }
      input[type="text"], form > label > input:not([type]) { box-sizing: border-box; width: 100%; border: 1px solid var(--codex-dialog-border); border-radius: 13px; background: var(--codex-dialog-panel); color: var(--pi-text); padding: 10px 12px; outline: none; font: inherit; box-shadow: 0 1px 0 var(--pi-inset-highlight) inset; }
      input:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
      .dialog-options { display: grid; gap: 8px; }
      .dialog-options label { display: flex; align-items: center; gap: 8px; color: var(--pi-text); }
      .review-files { display: grid; gap: 6px; min-height: 0; max-height: 180px; overflow: auto; border: 1px solid var(--codex-dialog-border); border-radius: 13px; background: color-mix(in srgb, var(--codex-dialog-panel) 82%, transparent); padding: 10px; scrollbar-width: thin; }
      .review-file { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: baseline; }
      .review-file span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dialog-error { border: 1px solid color-mix(in srgb, var(--pi-danger) 70%, var(--codex-dialog-border)); border-radius: 12px; background: color-mix(in srgb, var(--pi-danger) 10%, transparent); color: var(--pi-danger); padding: 10px 11px; line-height: 1.35; overflow-wrap: anywhere; }
      footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; }
      footer button { border-radius: 12px; }
      footer button[type="submit"] { border-color: color-mix(in srgb, var(--pi-accent) 72%, var(--codex-dialog-border)); background: color-mix(in srgb, var(--pi-accent) 18%, var(--codex-dialog-panel)); color: var(--pi-text-bright); }
    `,
  ];
}

export function workspaceUploadBatchesForScope(batches: Record<string, WorkspaceUploadBatchState>, scope: WorkspaceUploadScope): WorkspaceUploadBatchState[] {
  return Object.values(batches)
    .filter((batch) => batch.projectId === scope.projectId && batch.workspaceId === scope.workspaceId && batch.machineId === scope.machineId)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

export function workspaceUploadReviewError(files: readonly File[], destinationFolder: string): string | undefined {
  if (files.length === 0) return "Choose at least one file to upload.";
  for (const file of files) {
    try {
      workspaceUploadPath(destinationFolder, file.name);
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  return undefined;
}

export function workspaceUploadReviewDefaults(destinationFolder: string): { destinationFolder: string; createDirs: boolean; overwrite: boolean } {
  return { destinationFolder, createDirs: true, overwrite: false };
}

export function startDirectWorkspaceUpload(
  context: Pick<WorkspacePanelContext, "workspaceUploadDefaultFolder" | "onStartWorkspaceUpload">,
  files: readonly File[],
): ReturnType<WorkspacePanelContext["onStartWorkspaceUpload"]> {
  if (files.length === 0) return undefined;
  return context.onStartWorkspaceUpload(files, {
    destinationFolder: context.workspaceUploadDefaultFolder,
    createDirs: true,
    overwrite: false,
    selectUploadedFile: true,
  });
}

function workspaceContextKey(context: WorkspacePanelContext): string {
  return `${context.machine.id}:${context.workspace.projectId}:${context.workspace.id}`;
}

export function workspaceFileAbsolutePath(workspacePath: string, filePath: string): string {
  if (filePath === "") return workspacePath;
  if (isAbsoluteishPath(filePath)) return filePath;
  const separator = workspacePath.includes("\\") && !workspacePath.includes("/") ? "\\" : "/";
  const normalizedWorkspace = workspacePath.replace(/[\\/]+$/u, "");
  const normalizedFilePath = separator === "\\" ? filePath.replace(/\//gu, "\\") : filePath;
  if (normalizedWorkspace === "") return `${separator}${normalizedFilePath}`;
  return `${normalizedWorkspace}${separator}${normalizedFilePath}`;
}

function isAbsoluteishPath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path);
}

function pathForRename(currentPath: string, nextNameOrPath: string): string {
  if (nextNameOrPath.includes("/") || nextNameOrPath.includes("\\") || isAbsoluteishPath(nextNameOrPath)) return nextNameOrPath;
  const slashIndex = Math.max(currentPath.lastIndexOf("/"), currentPath.lastIndexOf("\\"));
  if (slashIndex < 0) return nextNameOrPath;
  return `${currentPath.slice(0, slashIndex + 1)}${nextNameOrPath}`;
}

function isDeletePermanentlyShortcut(event: KeyboardEvent): boolean {
  return event.key === "Backspace" && (event.metaKey || event.ctrlKey);
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function preventMenuEvent(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
}

function stopMenuEvent(event: Event): void {
  event.stopPropagation();
}

function searchIcon(): TemplateResult {
  return html`
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="10.5" cy="10.5" r="6.5"></circle>
      <path d="m16 16 4 4"></path>
    </svg>
  `;
}

function folderIcon(): TemplateResult {
  return html`
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>
    </svg>
  `;
}

function fileIcon(entry: FileTreeEntry): TemplateResult {
  const extension = entry.name.split(".").pop()?.slice(0, 2).toLocaleUpperCase() ?? "";
  return html`<span class="file-glyph">${extension === "" || extension === entry.name.toLocaleUpperCase() ? "•" : extension}</span>`;
}

function fileListToArray(files: FileList | null | undefined): File[] {
  return files === null || files === undefined ? [] : Array.from(files);
}

function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function uploadSummaryLabel(batches: readonly WorkspaceUploadBatchState[]): string {
  const uploading = batches.filter((batch) => batch.status === "uploading").length;
  return uploading === 0 ? `${String(batches.length)} recent` : `${String(uploading)} uploading`;
}

function uploadBatchTitle(batch: WorkspaceUploadBatchState): string {
  const count = batch.files.length;
  const files = count === 1 ? "file" : "files";
  switch (batch.status) {
    case "completed": return `Uploaded ${String(count)} ${files}`;
    case "error": return `Upload failed for ${String(count)} ${files}`;
    case "cancelled": return `Upload cancelled for ${String(count)} ${files}`;
    case "uploading": return `Uploading ${String(count)} ${files}`;
  }
}

export function uploadBatchStatusLabel(batch: WorkspaceUploadBatchState): string {
  switch (batch.status) {
    case "completed": return "Done";
    case "error": return "Failed";
    case "cancelled": return "Cancelled";
    case "uploading": return formatPercent(batch.percent);
  }
}

export function uploadBatchProgressValue(batch: WorkspaceUploadBatchState): number {
  return batch.status === "uploading" ? batch.percent : 1;
}

function uploadFileStatusLabel(file: WorkspaceUploadFileState): string {
  switch (file.status) {
    case "pending": return "Pending";
    case "uploading": return formatPercent(file.percent);
    case "completed": return "Done";
    case "error": return "Error";
    case "cancelled": return "Cancelled";
  }
}

function uploadFileDetail(file: WorkspaceUploadFileState): string {
  if (file.error !== undefined) return file.error;
  if (file.response !== undefined) return `Wrote ${file.response.path}`;
  return `${file.path} · ${formatFileSize(file.loaded)} / ${formatFileSize(file.total)}`;
}

function formatPercent(value: number): string {
  return `${String(Math.round(Math.max(0, Math.min(1, value)) * 100))}%`;
}

function loadCodeViewer(): void {
  void import("./CodeViewer");
}

const TREE_PANEL_STORAGE_KEY = "pi-web:files-tree-panel-width:v1";
const TREE_PANEL_MIN_WIDTH = 180;
const TREE_PANEL_MAX_WIDTH = 1200;
const TREE_PANEL_DEFAULT_WIDTH = 280;
const TREE_PANEL_KEYBOARD_STEP = 24;

interface SplitResizeState {
  pointerId: number;
  startClientX: number;
  startWidth: number;
  handle: HTMLElement;
}

function clampTreePanelWidth(width: number): number {
  if (!Number.isFinite(width)) return TREE_PANEL_DEFAULT_WIDTH;
  return Math.round(Math.min(Math.max(width, TREE_PANEL_MIN_WIDTH), TREE_PANEL_MAX_WIDTH));
}

function readStoredTreePanelWidth(): number {
  try {
    if (typeof localStorage === "undefined") return TREE_PANEL_DEFAULT_WIDTH;
    const raw = localStorage.getItem(TREE_PANEL_STORAGE_KEY);
    if (raw === null || raw === "") return TREE_PANEL_DEFAULT_WIDTH;
    const value = Number(raw);
    return clampTreePanelWidth(value);
  } catch {
    return TREE_PANEL_DEFAULT_WIDTH;
  }
}

function writeStoredTreePanelWidth(width: number): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(TREE_PANEL_STORAGE_KEY, String(clampTreePanelWidth(width)));
  } catch {
    // Ignore localStorage quota/privacy errors; the resized layout still applies in memory for this tab.
  }
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return "0 B";
  if (size < 1024) return `${String(size)} B`;
  const kib = size / 1024;
  if (kib < 1024) return `${formatScaledFileSize(kib)} KB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${formatScaledFileSize(mib)} MB`;
  return `${formatScaledFileSize(mib / 1024)} GB`;
}

function formatScaledFileSize(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}
