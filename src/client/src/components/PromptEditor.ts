import { defaultKeymap, history, historyKeymap, indentWithTab, insertNewlineAndIndent } from "@codemirror/commands";
import { markdown, deleteMarkupBackward, insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { EditorSelection, EditorState, Compartment } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultHighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { LitElement, html, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { api, type FileSuggestion, type PromptAttachment, type SessionStatus, type SlashCommand } from "../api";
import type { PromptAttachmentDelivery } from "../../../shared/apiTypes";
import { capturePromptAttachments, effectivePromptAttachmentDelivery, isInlinePromptAttachment, promptAttachmentsCanUseInlineDelivery, type CapturedAttachment } from "../promptAttachmentCapture";
import { inputModeForDraft } from "../inputModes";
import { machineSessionKey } from "../machineKeys";
import { detectPromptCompletionTrigger, fileCompletionInsertText, matchingSlashCommands, type PromptCompletionTrigger } from "../promptCompletions";
import { clearDraft, loadDraft, saveDraft } from "../promptDraftStorage";
import { WEB_SLASH_COMMANDS } from "../slashCommands";
import { loadAttachmentDelivery, saveAttachmentDelivery } from "../attachmentPreferences";
import { createMobilePromptEnterMedia, readPromptEnterPreference, shouldSendPromptOnEnterShortcut, shouldUsePromptEnterShiftShortcut } from "../promptEnterBehavior";
import { promptEditorStyles, type CompletionItem } from "./shared";
import { renderAttachIcon, renderSendIcon, renderStopIcon, renderThinkingGauge } from "./promptEditorIcons";
import { thinkingGauge, thinkingLevelLabel } from "../../../shared/thinkingLevels";
import "./AutocompleteMenu";
import "./StatusBar";

type PendingAttachment = CapturedAttachment & { id: string };
type ActionState = "idle" | "active" | "generating";

const STEER_LONG_PRESS_MS = 500;
const TOKEN_PULSE_THRESHOLD = 1000;

@customElement("prompt-editor")
export class PromptEditor extends LitElement {
  @property({ type: Boolean }) disabled = false;
  @property() sessionId?: string;
  @property() cwd?: string;
  @property() machineId = "local";
  @property() projectId?: string;
  @property() workspaceId?: string;
  @property({ type: Boolean }) workspaceScopedFileSuggestions = false;
  @property({ type: Boolean }) canSteer = false;
  @property({ type: Boolean }) isCompacting = false;
  @property({ type: Boolean }) canStop = false;
  @property({ attribute: false }) status?: SessionStatus;
  @property({ type: Boolean }) sending = false;
  @property({ attribute: false }) onSend?: (text: string, streamingBehavior?: "steer" | "followUp", attachments?: PromptAttachment[], delivery?: PromptAttachmentDelivery) => void | Promise<void>;
  @property({ attribute: false }) onStop?: () => void;
  @property({ attribute: false }) onSelectModel?: () => void;
  @property({ attribute: false }) onSelectThinking?: () => void;
  @property({ attribute: false }) availableThinkingLevels: readonly string[] = [];
  @query(".markdown-editor") private editorHost?: HTMLDivElement;
  @query(".attachment-input") private attachmentInput?: HTMLInputElement;
  @state() private draft = "";
  @state() private completions: CompletionItem[] = [];
  @state() private selectedIndex = 0;
  @state() private attachments: PendingAttachment[] = [];
  @state() private attachmentDelivery: PromptAttachmentDelivery = loadAttachmentDelivery();
  @state() private attachmentError: string | undefined = undefined;
  @state() private isHovered = false;
  @state() private showSteerPopup = false;
  @state() private completionPos: { left: number; bottom: number } | undefined = undefined;
  private attachmentSeq = 0;
  private requestVersion = 0;
  private editor: EditorView | undefined;
  private readonly editableCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private readonly mobilePromptEnterMedia = createMobilePromptEnterMedia();
  private explicitShiftKeyActive = false;
  private longPressTimer: number | undefined = undefined;
  private longPressFired = false;
  private previousContextTokens?: number | null;
  private tokenPulseTimer: number | undefined = undefined;

  protected override willUpdate(changed: PropertyValues<this>) {
    if (!changed.has("sessionId") && !changed.has("machineId")) return;
    const previousSessionId = changed.has("sessionId") ? changed.get("sessionId") : this.sessionId;
    const previousMachineId = changed.has("machineId") ? changed.get("machineId") : this.machineId;
    const previousKey = draftStorageKey(previousMachineId, previousSessionId);
    if (previousKey !== undefined) saveDraft(previousKey, this.draft);
    const currentKey = draftStorageKey(this.machineId, this.sessionId);
    this.draft = currentKey !== undefined ? loadDraft(currentKey) : "";
    this.completions = [];
    this.selectedIndex = 0;
    this.completionPos = undefined;
  }

  override firstUpdated(): void {
    this.createEditor();
  }

  protected override updated(changed: PropertyValues) {
    if (changed.has("disabled")) this.updateEditorDisabledState();
    if (changed.has("draft") || changed.has("sessionId") || changed.has("machineId")) this.syncEditorDoc();
    if (changed.has("status")) this.checkTokenPulse();
    if (changed.has("completions")) this.updateCompletionPosition();
  }

  override disconnectedCallback(): void {
    window.clearTimeout(this.longPressTimer);
    window.clearTimeout(this.tokenPulseTimer);
    this.editor?.destroy();
    this.editor = undefined;
    super.disconnectedCallback();
  }

  override render() {
    const inputMode = inputModeForDraft(this.draft);
    const shellMode = inputMode.kind === "shell";
    const actionState = this.actionState;
    const busy = this.disabled || this.sending || actionState === "generating";
    return html`
      <div class="composer-shell">
        <footer
          class=${shellMode ? "shell-mode" : ""}
          ?data-generating=${actionState === "generating"}
          @mouseenter=${() => { this.isHovered = true; }}
          @mouseleave=${() => { this.isHovered = false; this.hideSteerPopup(); }}
          @paste=${(event: ClipboardEvent) => { void this.handlePaste(event); }}
          @dragover=${(event: DragEvent) => { this.handleDragOver(event); }}
          @drop=${(event: DragEvent) => { void this.handleDrop(event); }}
        >
        <div class="composer-line">
          <div class="left-cluster">
            ${this.renderModelSelector()}
            ${this.renderThinkingSelector()}
          </div>
          <div class="editor-wrap">
            <div
              class=${`markdown-editor${this.disabled || actionState === "generating" ? " markdown-editor-disabled" : ""}`}
              aria-label="Message pi"
              aria-disabled=${this.disabled || actionState === "generating" ? "true" : "false"}
            ></div>
            <autocomplete-menu
              class=${this.completionPos ? "cursor-positioned" : ""}
              .items=${this.completions}
              .selectedIndex=${this.selectedIndex}
              .onPick=${(item: CompletionItem) => { this.pick(item); }}
              style=${this.completionPosStyle}
            ></autocomplete-menu>
          </div>
          <div class="right-cluster">
            <input class="attachment-input" type="file" multiple hidden @change=${(event: Event) => { void this.handleFileInput(event); }} />
            <button
              class="attach-button"
              ?disabled=${busy}
              title="Attach files"
              aria-label="Attach files"
              @click=${() => { this.attachmentInput?.click(); }}
            >${renderAttachIcon()}</button>
            <button
              class=${`action-button action-${actionState}`}
              ?disabled=${this.disabled}
              title=${this.actionTitle(actionState)}
              aria-label=${this.actionAriaLabel(actionState)}
              @pointerdown=${(event: PointerEvent) => { this.onActionPointerDown(event); }}
              @pointerup=${(event: PointerEvent) => { this.onActionPointerUp(event); }}
              @pointerleave=${() => { this.cancelLongPress(); }}
              @pointercancel=${() => { this.cancelLongPress(); }}
            >
              <span class=${`action-icon action-icon-send ${actionState === "generating" ? "hidden" : ""}`}>${renderSendIcon()}</span>
              <span class=${`action-icon action-icon-stop ${actionState === "generating" ? "" : "hidden"}`}>${renderStopIcon()}</span>
            </button>
          </div>
        </div>
        ${shellMode ? html`<div class="mode-hint">Shell command${inputMode.excludeFromContext ? " · excluded from context" : ""}</div>` : null}
        ${this.isCompacting && !shellMode ? html`<div class="mode-hint">Compacting history · message will be queued</div>` : null}
        ${this.renderAttachments()}
        ${this.renderSteerPopup()}
        </footer>
        <status-bar .status=${this.status} .isComposerHovered=${this.isHovered} .pulseVisible=${this.pulseVisible}></status-bar>
      </div>
    `;
  }

  focusInput() {
    this.editor?.focus();
  }

  /** Get the underlying CM6 EditorView, or undefined if not yet mounted. */
  get view(): EditorView | undefined {
    return this.editor;
  }

  private get hasInput(): boolean {
    return this.draft.trim().length > 0 || this.attachments.length > 0;
  }

  private get isGenerating(): boolean {
    return this.canStop && !this.hasInput;
  }

  private get actionState(): ActionState {
    if (this.isGenerating) return "generating";
    if (this.hasInput) return "active";
    return "idle";
  }

  private get pulseVisible(): boolean {
    return this.tokenPulseTimer !== undefined;
  }

  private get completionPosStyle(): string {
    if (!this.completionPos) return "";
    return `left:${String(this.completionPos.left)}px;bottom:${String(this.completionPos.bottom)}px`;
  }

  private actionTitle(state: ActionState): string {
    if (state === "generating") return "Stop current work";
    if (this.canSteer || this.isCompacting) return "Queue until the current activity finishes";
    return "Send message";
  }

  private actionAriaLabel(state: ActionState): string {
    if (state === "generating") return "Stop current work";
    if (this.canSteer || this.isCompacting) return "Queue message";
    return "Send message";
  }

  private renderModelSelector() {
    const status = this.status;
    if (status === undefined) return null;
    const model = status.model?.id ?? "no model";
    const provider = status.model?.provider !== undefined && status.model.provider !== "" ? `${status.model.provider}/` : "";
    return html`
      <button class="model-selector" title="Select model" aria-label="Select model" @click=${() => this.onSelectModel?.()}>
        <span class="model-globe" aria-hidden="true">🌐</span>
        <span class="model-name">${provider}${model}</span>
        <span class="model-chevron" aria-hidden="true">▾</span>
      </button>
    `;
  }

  private renderThinkingSelector() {
    const status = this.status;
    if (status === undefined || this.availableThinkingLevels.length === 0) return null;
    const label = thinkingLevelLabel(status.thinkingLevel);
    return html`
      <button
        class="thinking-selector"
        title=${`Thinking level: ${label}`}
        aria-label=${`Thinking level: ${label}`}
        @click=${() => this.onSelectThinking?.()}
      >${renderThinkingGauge(thinkingGauge(status.thinkingLevel, this.availableThinkingLevels))}</button>
    `;
  }

  private renderAttachments() {
    if (this.attachments.length === 0 && this.attachmentError === undefined) return null;
    const canUseInlineDelivery = promptAttachmentsCanUseInlineDelivery(this.attachments);
    const delivery = this.effectiveAttachmentDelivery();
    return html`
      <div class="attachments" aria-label="Pending attachments">
        ${this.attachments.map((attachment) => html`
          <div class=${`attachment-chip ${isInlinePromptAttachment(attachment) ? "attachment-chip-image" : "attachment-chip-file"}`} title=${attachment.name}>
            ${this.renderAttachmentPreview(attachment)}
            <button type="button" class="attachment-remove" title="Remove attachment" aria-label=${`Remove ${attachment.name}`} @click=${() => { this.removeAttachment(attachment.id); }}>×</button>
          </div>
        `)}
        ${this.attachments.length > 0 ? html`
          <label class="attachment-delivery" title=${canUseInlineDelivery ? "How attachments are delivered to the agent" : "General files are saved and mentioned from the workspace"}>
            <select .value=${delivery} @change=${(event: Event) => { this.changeDelivery(event); }}>
              <option value="inline" ?disabled=${!canUseInlineDelivery}>Attach to message${canUseInlineDelivery ? "" : " (images only)"}</option>
              <option value="folder">Save to .pi-web/attachments</option>
            </select>
          </label>
        ` : null}
        ${this.attachmentError !== undefined ? html`<div class="attachment-error">${this.attachmentError}</div>` : null}
      </div>
    `;
  }

  private renderAttachmentPreview(attachment: PendingAttachment) {
    if (isInlinePromptAttachment(attachment)) {
      return html`<img src=${`data:${attachment.mimeType};base64,${attachment.data}`} alt=${attachment.name} />`;
    }
    return html`
      <div class="attachment-file-preview" aria-hidden="true">${fileExtensionLabel(attachment.name)}</div>
      <span class="attachment-file-name">${attachment.name}</span>
    `;
  }

  private renderSteerPopup() {
    if (!this.showSteerPopup || !this.canSteer || this.isCompacting) return null;
    return html`
      <div class="steer-popup" role="menu" aria-label="Steer options">
        <button class="steer-option" role="menuitem" @click=${() => { this.hideSteerPopup(); this.send("steer"); }}>
          <span>Steer current response</span>
          <kbd>⌥↵</kbd>
        </button>
      </div>
    `;
  }

  private changeDelivery(event: Event) {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const requested = event.target.value === "folder" ? "folder" : "inline";
    if (requested === "inline" && !promptAttachmentsCanUseInlineDelivery(this.attachments)) {
      event.target.value = "folder";
      return;
    }
    this.attachmentDelivery = requested;
    saveAttachmentDelivery(this.attachmentDelivery);
  }

  private removeAttachment(id: string) {
    this.attachments = this.attachments.filter((attachment) => attachment.id !== id);
  }

  private async handlePaste(event: ClipboardEvent) {
    const files = filesFromDataTransfer(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    await this.addAttachmentFiles(files);
  }

  private handleDragOver(event: DragEvent) {
    if (event.dataTransfer === null) return;
    if (dataTransferHasFiles(event.dataTransfer)) event.preventDefault();
  }

  private async handleDrop(event: DragEvent) {
    const files = filesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    await this.addAttachmentFiles(files);
  }

  private async handleFileInput(event: Event) {
    if (!(event.target instanceof HTMLInputElement) || event.target.files === null) return;
    const files = Array.from(event.target.files);
    event.target.value = "";
    await this.addAttachmentFiles(files);
  }

  private async addAttachmentFiles(files: File[]) {
    this.attachmentError = undefined;
    const { attachments, error } = await capturePromptAttachments(files, readFileAsBase64);
    if (attachments.length > 0) {
      this.attachments = [...this.attachments, ...attachments.map((attachment) => ({ id: `attachment-${String(++this.attachmentSeq)}`, ...attachment }))];
    }
    if (error !== undefined) this.attachmentError = error;
  }

  private currentAttachments(): PromptAttachment[] {
    return this.attachments.map((attachment) => pendingToPromptAttachment(attachment));
  }

  private effectiveAttachmentDelivery(): PromptAttachmentDelivery {
    return effectivePromptAttachmentDelivery(this.attachmentDelivery, this.attachments);
  }

  private createEditor() {
    if (!this.editorHost || this.editor !== undefined) return;
    this.editor = new EditorView({
      parent: this.editorHost,
      state: EditorState.create({
        doc: this.draft,
        extensions: [
          history(),
          markdown(),
          indentOnInput(),
          indentUnit.of("  "),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of((view) => inputAssistanceContentAttributes(view.state.sliceDoc(0, view.state.selection.main.head))),
          EditorView.domEventHandlers({
            keyup: (event) => this.handleEditorKeyUp(event),
            blur: () => this.resetEditorModifierState(),
          }),
          placeholder("Message... (Type / for commands, @ for files)"),
          this.editableCompartment.of(EditorView.editable.of(!this.disabled)),
          this.readOnlyCompartment.of(EditorState.readOnly.of(this.disabled)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) this.updateDraft(update.state.doc.toString());
            if ((update.selectionSet || update.viewportChanged || update.docChanged) && this.completions.length > 0) {
              this.updateCompletionPosition();
            }
          }),
          keymap.of([
            { any: (view, event) => this.handleEditorKeyDown(event, view) },
            { key: "ArrowDown", run: () => this.moveCompletion(1) },
            { key: "ArrowUp", run: () => this.moveCompletion(-1) },
            { key: "Escape", run: () => this.closeCompletions() },
            { key: "Tab", run: (view) => this.handleEditorTab(view) },
            { key: "Shift-Tab", run: (view) => indentWithTab.shift?.(view) ?? false },
            { key: "Backspace", run: (view) => deleteMarkupBackward(view) },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
        ],
      }),
    });
  }

  private syncEditorDoc() {
    const editor = this.editor;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === this.draft) return;
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: this.draft },
      selection: EditorSelection.cursor(this.draft.length),
    });
  }

  private updateEditorDisabledState() {
    this.editor?.dispatch({
      effects: [
        this.editableCompartment.reconfigure(EditorView.editable.of(!this.disabled)),
        this.readOnlyCompartment.reconfigure(EditorState.readOnly.of(this.disabled)),
      ],
    });
  }

  private updateDraft(value: string) {
    this.draft = value;
    const key = draftStorageKey(this.machineId, this.sessionId);
    if (key !== undefined) saveDraft(key, this.draft);
    void this.refreshCompletions();
  }

  private updateCompletionPosition() {
    const editor = this.editor;
    const host = this.editorHost;
    if (!editor || !host || this.completions.length === 0) {
      this.completionPos = undefined;
      return;
    }
    const head = editor.state.selection.main.head;
    const cursorRect = editor.coordsAtPos(head, -1);
    const hostRect = host.getBoundingClientRect();
    if (cursorRect === null) {
      this.completionPos = undefined;
      return;
    }
    // Position the menu above the cursor, aligned to the cursor's left edge,
    // clamped inside the editor wrap.
    const left = Math.max(8, Math.min(cursorRect.left - hostRect.left, hostRect.width - 160));
    const bottom = hostRect.bottom - cursorRect.top + 4;
    this.completionPos = { left, bottom };
  }

  private async refreshCompletions() {
    const trigger = this.currentTrigger();
    const version = ++this.requestVersion;
    this.selectedIndex = 0;
    if (trigger === undefined) {
      this.completions = [];
      this.completionPos = undefined;
      return;
    }
    if (trigger.kind === "command" && this.sessionId !== undefined && this.sessionId !== "" && this.cwd !== undefined && this.cwd !== "") {
      const runtimeCommands = await api.commands({ id: this.sessionId, cwd: this.cwd }, this.machineId).catch(emptySlashCommands);
      if (version !== this.requestVersion) return;
      this.completions = matchingSlashCommands([...WEB_SLASH_COMMANDS, ...runtimeCommands], trigger.query)
        .map((command) => ({
          kind: "command",
          replaceFrom: trigger.from,
          replaceTo: trigger.to,
          insertText: `/${command.name}`,
          detail: command.source,
          ...(command.description === undefined ? {} : { description: command.description }),
        }));
    } else if (trigger.kind === "file" && this.cwd !== undefined && this.cwd !== "") {
      const files = await api.files(this.cwd, trigger.query, { scope: trigger.fileScope, machineId: this.machineId, projectId: this.projectId, workspaceId: this.workspaceId, workspaceScoped: this.workspaceScopedFileSuggestions }).catch(emptyFileSuggestions);
      if (version !== this.requestVersion) return;
      this.completions = files
        .slice(0, 12)
        .map((file) => {
          const insertText = fileCompletionInsertText(file.path, trigger.quoted === true, file.path.endsWith("/") ? trigger.allPrefix : undefined);
          return {
            kind: "file",
            replaceFrom: trigger.from,
            replaceTo: trigger.to,
            insertText,
            detail: file.kind,
            ...(file.path.endsWith("/") && insertText.endsWith("\"") ? { cursorOffset: insertText.length - 1 } : {}),
          };
        });
    }
    this.updateCompletionPosition();
  }

  private currentTrigger(): PromptCompletionTrigger | undefined {
    return detectPromptCompletionTrigger(this.draft, this.editor?.state.selection.main.head ?? this.draft.length);
  }

  private moveCompletion(delta: number): boolean {
    if (!this.completions.length) return false;
    this.selectedIndex = (this.selectedIndex + delta + this.completions.length) % this.completions.length;
    return true;
  }

  private closeCompletions(): boolean {
    if (!this.completions.length) return false;
    this.completions = [];
    this.completionPos = undefined;
    return true;
  }

  private handleEditorKeyDown(event: KeyboardEvent, view: EditorView): boolean {
    if (event.key === "Shift") {
      this.explicitShiftKeyActive = true;
      return false;
    }

    // Cmd/Ctrl+Enter always sends.
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.send(this.primaryStreamingBehavior());
      return true;
    }

    // Alt/Option+Enter steers when available, otherwise sends.
    if (event.key === "Enter" && event.altKey) {
      event.preventDefault();
      this.send(this.canSteer && !this.isCompacting ? "steer" : this.primaryStreamingBehavior());
      return true;
    }

    if (event.key !== "Enter") {
      this.explicitShiftKeyActive = false;
      return false;
    }
    if (event.defaultPrevented || event.isComposing || view.composing) return false;

    const shiftKey = shouldUsePromptEnterShiftShortcut(event.shiftKey, this.explicitShiftKeyActive, this.mobilePromptEnterMedia);
    this.explicitShiftKeyActive = false;
    return this.handleEditorEnter(view, shiftKey);
  }

  private handleEditorKeyUp(event: KeyboardEvent): boolean {
    if (event.key === "Shift") this.explicitShiftKeyActive = false;
    return false;
  }

  private resetEditorModifierState(): boolean {
    this.explicitShiftKeyActive = false;
    return false;
  }

  private handleEditorEnter(view: EditorView, shiftKey: boolean): boolean {
    if (!shiftKey && this.completions.length) {
      const completion = this.completions[this.selectedIndex];
      if (completion !== undefined) this.pick(completion);
      return true;
    }
    if (!shouldSendPromptOnEnterShortcut(shiftKey, this.mobilePromptEnterMedia, readPromptEnterPreference())) {
      return insertNewlineContinueMarkup(view) || insertNewlineAndIndent(view);
    }
    this.send(this.primaryStreamingBehavior());
    return true;
  }

  private handleEditorTab(view: EditorView): boolean {
    if (this.completions.length) {
      const completion = this.completions[this.selectedIndex];
      if (completion !== undefined) this.pick(completion);
      return true;
    }
    const trigger = this.currentTrigger();
    if (trigger?.kind === "file") {
      void this.refreshCompletions();
      return true;
    }
    return indentWithTab.run?.(view) ?? false;
  }

  private pick(item: CompletionItem) {
    const editor = this.editor;
    if (!editor) return;
    const suffix = item.kind === "file" && (item.insertText.endsWith("/") || item.cursorOffset !== undefined) ? "" : " ";
    const cursor = item.replaceFrom + (item.cursorOffset ?? item.insertText.length) + suffix.length;
    const replaceTo = item.insertText.endsWith("\"") && this.draft.slice(item.replaceTo).startsWith("\"") ? item.replaceTo + 1 : item.replaceTo;
    editor.dispatch({
      changes: { from: item.replaceFrom, to: replaceTo, insert: `${item.insertText}${suffix}` },
      selection: EditorSelection.cursor(cursor),
      scrollIntoView: true,
    });
    this.completions = [];
    this.completionPos = undefined;
  }

  private send(streamingBehavior?: "steer" | "followUp") {
    if (this.disabled || this.sending) return;
    const text = this.draft.trim();
    const pending = this.attachments;
    if (text === "" && pending.length === 0) return;
    const behavior = this.canSteer || this.isCompacting ? streamingBehavior : undefined;
    const attachments = pending.length > 0 ? this.currentAttachments() : undefined;
    const delivery = this.effectiveAttachmentDelivery();
    this.resetComposer();
    this.refocusComposer();
    void this.onSend?.(text, behavior, attachments, attachments === undefined ? undefined : delivery);
  }

  private primaryStreamingBehavior(): "steer" | "followUp" | undefined {
    if (this.canSteer || this.isCompacting) return "followUp";
    return undefined;
  }

  private resetComposer() {
    this.draft = "";
    const key = draftStorageKey(this.machineId, this.sessionId);
    if (key !== undefined) clearDraft(key);
    this.completions = [];
    this.completionPos = undefined;
    this.attachments = [];
    this.attachmentError = undefined;
  }

  private refocusComposer(): void {
    requestAnimationFrame(() => {
      this.syncEditorDoc();
      this.focusInput();
    });
  }

  private onActionPointerDown(event: PointerEvent) {
    if (this.actionState === "generating") return;
    if (!(event.currentTarget instanceof HTMLElement)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    this.longPressFired = false;
    window.clearTimeout(this.longPressTimer);
    this.longPressTimer = window.setTimeout(() => {
      this.longPressFired = true;
      if (this.canSteer && !this.isCompacting) {
        this.showSteerPopup = true;
      }
    }, STEER_LONG_PRESS_MS);
  }

  private onActionPointerUp(event: PointerEvent) {
    window.clearTimeout(this.longPressTimer);
    if (!(event.currentTarget instanceof HTMLElement)) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (this.actionState === "generating") {
      this.onStop?.();
      return;
    }
    if (this.longPressFired) {
      // Long press was handled by the popup; clicking the popup item sends steer.
      return;
    }
    this.send(this.primaryStreamingBehavior());
  }

  private cancelLongPress() {
    window.clearTimeout(this.longPressTimer);
    this.longPressFired = false;
  }

  private hideSteerPopup() {
    this.showSteerPopup = false;
  }

  private checkTokenPulse() {
    const current = this.status?.contextUsage?.tokens ?? null;
    if (current === null) {
      this.previousContextTokens = current;
      return;
    }
    const previous = this.previousContextTokens;
    if (previous !== undefined && previous !== null && Math.abs(current - previous) > TOKEN_PULSE_THRESHOLD) {
      window.clearTimeout(this.tokenPulseTimer);
      this.tokenPulseTimer = window.setTimeout(() => {
        this.tokenPulseTimer = undefined;
        this.requestUpdate();
      }, 3000);
      // Ensure the host re-renders immediately so the status bar pulses.
      this.requestUpdate();
    }
    this.previousContextTokens = current;
  }

  static override styles = promptEditorStyles;
}

function draftStorageKey(machineId: unknown, sessionId: unknown): string | undefined {
  if (typeof machineId !== "string" || machineId === "") return undefined;
  if (typeof sessionId !== "string" || sessionId === "") return undefined;
  return machineSessionKey(machineId, sessionId);
}

function emptySlashCommands(): SlashCommand[] {
  return [];
}

function emptyFileSuggestions(): FileSuggestion[] {
  return [];
}

function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (data === null) return [];
  return Array.from(data.files);
}

function dataTransferHasFiles(data: DataTransfer): boolean {
  const items = Array.from(data.items);
  if (items.length > 0) return items.some((item) => item.kind === "file");
  return Array.from(data.types).includes("Files");
}

function pendingToPromptAttachment(attachment: PendingAttachment): PromptAttachment {
  if (attachment.kind === "image") {
    return { kind: "image", mimeType: attachment.mimeType, data: attachment.data, name: attachment.name };
  }
  return { kind: "file", mimeType: attachment.mimeType, data: attachment.data, name: attachment.name };
}

function fileExtensionLabel(name: string): string {
  const trimmed = name.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex >= 0 && dotIndex < trimmed.length - 1) return trimmed.slice(dotIndex + 1, dotIndex + 5).toUpperCase();
  return "FILE";
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => { reject(reader.error ?? new Error("Failed to read file")); };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") { reject(new Error("Unexpected file reader result")); return; }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}

const proseInputAssistanceAttributes: Record<string, string> = {
  spellcheck: "true",
  autocorrect: "on",
  autocapitalize: "sentences",
  writingsuggestions: "true",
  dir: "auto",
};

const codeLikeInputAssistanceAttributes: Record<string, string> = {
  spellcheck: "false",
  autocorrect: "off",
  autocapitalize: "off",
  writingsuggestions: "false",
  dir: "auto",
};

function inputAssistanceContentAttributes(draftBeforeCursor: string): Record<string, string> {
  // CodeMirror is optimized for code and disables these by default, but the chat prompt is usually prose.
  return inputModeForDraft(draftBeforeCursor).kind === "normal" ? proseInputAssistanceAttributes : codeLikeInputAssistanceAttributes;
}
