import { LitElement, html, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ChatDisclosureController } from "../chatDisclosure";
import { groupChatMessages, summarizeChatGroup, type ChatGroup } from "../chatGroups";
import { capturePrependScrollAnchor, PREPEND_RESTORE_SETTLE_FRAMES, restorePrependScrollAnchor, type PrependScrollAnchor } from "../chatScrollAnchoring";
import { shouldRequestEarlierMessages } from "../chatHistoryLoading";
import { ChatScrollController, distanceFromScrollBottom, findFirstVisibleArticle, isNearScrollBottom, type ChatAnchorScrollPosition, type ChatScrollRestoreResult } from "../chatScrollPosition";
import type { SessionActivity, SessionStatus } from "../api";
import { buildSessionCompletionCards, type SessionCompletionArtifactCard, type SessionCompletionEditCard, type SessionCompletionFileRow } from "../sessionCompletionCards";
import { buildSessionWorkSummary, type SessionWorkSummary } from "../sessionWorkSummary";
import type { ChatLine, ChatPart } from "./shared";
import { chatStyles } from "./shared";
import { renderRoleIcon, roleIconStyles } from "./roleIcons";
import { buildTimelineNodes, type TimelineNode, type TimelineNodeStatus, type ToolAggregation } from "./timelineAdapter";
import "./ConversationMeter";
import "./FormattedText";
import "./ToolCallCard";
import "./ToolCallGroup";
import "./TaskTimeline";
import "./StepNode";
import "./ThinkingNode";
import "./BashNode";
import "./DiffViewer";
import "./CollapsibleSection";
import "./ErrorPanel";
import "./MessageBubble";
import "./TimelineLayout";
import "./TimelineNodeWrapper";
import "./ToolCallNode";

const shortTimestampFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fullTimestampFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });
const ASSISTANT_FOOTER_REVEAL_DELAY_MS = 500;

const partialStreamNoticeBodies = [
  "You opened this chat while the assistant was already replying. The complete answer will appear shortly.",
  "We joined mid-sentence. Holding the curtain until the full reply is ready.",
  "The assistant started before this tab arrived. We’ll show the full answer when it lands.",
  "Catching the reply in one piece — no spoilers, no half-answers.",
  "The tokens are still assembling themselves. Full answer incoming.",
  "We arrived fashionably late to this response. The complete version will appear soon.",
] as const;

function randomPartialStreamNoticeBody(): string {
  return partialStreamNoticeBodies[Math.floor(Math.random() * partialStreamNoticeBodies.length)] ?? partialStreamNoticeBodies[0];
}

function clampPercent(value: number): number {
  return clampNumber(value, 0, 100);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

@customElement("chat-view")
export class ChatView extends LitElement {
  @property({ attribute: false }) messages: ChatLine[] = [];
  @property() sessionId = "";
  @property({ type: Number }) messageStart = 0;
  @property({ type: Number }) messageEnd = 0;
  @property({ type: Number }) messageTotal = 0;
  @property({ type: Boolean }) hasMore = false;
  @property({ type: Boolean }) loadingMore = false;
  @property({ type: Boolean }) isReceivingPartialStream = false;
  @property({ type: Boolean }) isSendingPrompt = false;
  @property({ type: Boolean }) isCompacting = false;
  @property({ type: Number }) pendingMessageCount = 0;
  @property({ attribute: false }) status?: SessionStatus;
  @property({ attribute: false }) activity?: SessionActivity;
  @property({ attribute: false }) onLoadMore?: () => void;
  @property({ attribute: false }) onOpenWorkspaceFile?: (path: string) => void;
  @property({ attribute: false }) onReviewWorkspaceFile?: (path: string) => void;
  @query(".chat") private chat?: HTMLDivElement;
  @state() private pinnedToBottom = true;
  @state() private expandedMetaKey: string | undefined;
  @state() private copiedMessageKey: string | undefined;
  @state() private visibleAssistantFooterKey: string | undefined;
  @state() private currentConversationIndex: number | undefined;
  private readonly disclosures = new ChatDisclosureController();
  private readonly scrollController = new ChatScrollController();
  private suppressScrollSave = false;
  private suppressLoadMoreRequests = false;
  private loadMoreCheckFrame: number | undefined;
  private scrollToBottomFrame: number | undefined;
  private conversationRailFrame: number | undefined;
  private meterScrollResetFrame: number | undefined;
  private draggingConversationMeter = false;
  private assistantFooterRevealTimer: number | undefined;
  private groupedMessagesInput?: ChatLine[];
  private groupedMessagesStart = 0;
  private groupedMessagesCache: ChatGroup[] = [];
  private readonly messageMetaCache = new WeakMap<ChatLine, { short: string; full: string }>();
  private readonly messageCopyTextCache = new WeakMap<ChatLine, string>();
  private partialStreamNoticeBody: string | undefined;
  @state() private activityPhraseIndex = 0;
  @state() private expandedCompletionFileLists: Record<string, true> = {};
  private activityPhraseTimer: number | undefined;
  private lastScrollTop = 0;
  private lastClientHeight = 0;
  private touchStartY: number | undefined;
  private pendingScrollRestoreSessionId: string | undefined;
  private pendingScrollRestorePosition: ChatAnchorScrollPosition | undefined;
  private restoreScrollFrame: number | undefined;
  private prependRestoreToken = 0;
  @state() private loadMoreRequested = false;
  private readonly onViewportResize = () => {
    if (this.pinnedToBottom) this.scrollToBottom();
    else this.lastClientHeight = this.chat?.clientHeight ?? 0;
  };
  private readonly onPageHide = () => {
    this.saveScrollPosition();
  };

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("resize", this.onViewportResize);
    window.addEventListener("pagehide", this.onPageHide);
    window.visualViewport?.addEventListener("resize", this.onViewportResize);
  }

  protected override firstUpdated(): void {
    this.lastClientHeight = this.chat?.clientHeight ?? 0;
  }

  override disconnectedCallback(): void {
    this.saveScrollPosition();
    this.scrollController.dispose();
    this.prependRestoreToken += 1;
    if (this.restoreScrollFrame !== undefined) cancelAnimationFrame(this.restoreScrollFrame);
    if (this.loadMoreCheckFrame !== undefined) cancelAnimationFrame(this.loadMoreCheckFrame);
    if (this.scrollToBottomFrame !== undefined) cancelAnimationFrame(this.scrollToBottomFrame);
    if (this.conversationRailFrame !== undefined) cancelAnimationFrame(this.conversationRailFrame);
    if (this.meterScrollResetFrame !== undefined) cancelAnimationFrame(this.meterScrollResetFrame);
    this.clearAssistantFooterRevealTimer();
    this.stopActivityPhraseCycle();
    window.removeEventListener("resize", this.onViewportResize);
    window.removeEventListener("pagehide", this.onPageHide);
    window.visualViewport?.removeEventListener("resize", this.onViewportResize);
    super.disconnectedCallback();
  }

  private savePreviousSessionScrollPosition(previousSessionId: unknown): void {
    if (typeof previousSessionId !== "string" || previousSessionId === "" || previousSessionId === this.sessionId) return;
    this.saveScrollPosition(previousSessionId);
  }

  private prepareSessionUiState(): void {
    this.disclosures.syncSession(this.sessionId);
    this.scrollController.clearScheduledSave();
    this.suppressScrollSave = false;
    this.suppressLoadMoreRequests = false;
    this.pinnedToBottom = true;
    this.pendingScrollRestoreSessionId = undefined;
    this.pendingScrollRestorePosition = undefined;
    this.expandedCompletionFileLists = {};
    this.prependRestoreToken += 1;
    if (this.restoreScrollFrame !== undefined) {
      cancelAnimationFrame(this.restoreScrollFrame);
      this.restoreScrollFrame = undefined;
    }
  }

  protected override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has("sessionId")) {
      this.savePreviousSessionScrollPosition(changed.get("sessionId"));
      this.prepareSessionUiState();
    }
    if (changed.has("isReceivingPartialStream") || (changed.has("sessionId") && this.isReceivingPartialStream)) this.syncPartialStreamNoticeBody();
    if (this.assistantFooterRevealInputsChanged(changed)) this.prepareAssistantFooterReveal(changed);
    if (changed.has("messages")) this.pinnedToBottom = this.pinnedToBottom && (this.didChatHeightChange() || this.isNearBottom());
  }

  protected override update(changed: Map<string, unknown>): void {
    const prependAnchor = this.isPrependingMessages(changed) ? this.capturePrependScrollAnchor() : undefined;
    super.update(changed);
    if (prependAnchor !== undefined) this.restorePrependScrollAnchor(prependAnchor);
  }

  protected override updated(changed: Map<string, unknown>): void {
    if (changed.has("loadingMore") && !this.loadingMore) this.loadMoreRequested = false;
    if (changed.has("hasMore") && !this.hasMore) this.loadMoreRequested = false;
    if (changed.has("sessionId")) this.restoreScrollPosition();
    if (!changed.has("sessionId") && changed.has("messages") && this.pinnedToBottom) this.scrollToBottom(this.isSessionLive());
    if (changed.has("messages") || changed.has("messageStart") || changed.has("messageTotal") || changed.has("hasMore") || changed.has("loadingMore")) this.scheduleConversationRailUpdate();
    if (changed.has("messages") || changed.has("messageStart") || changed.has("hasMore") || changed.has("loadingMore")) this.continuePendingScrollRestore();
    if (changed.has("messages") || changed.has("hasMore") || changed.has("loadingMore")) this.requestLoadMoreIfNeeded();
    if (this.assistantFooterRevealInputsChanged(changed)) this.scheduleAssistantFooterReveal();
    // Manage activity phrase cycling
    if (changed.has("status") || changed.has("activity") || changed.has("isSendingPrompt")) {
      const state = this.activityState();
      if (state !== undefined && state !== "idle") {
        this.startActivityPhraseCycle(state);
      } else {
        this.stopActivityPhraseCycle();
      }
    }
  }

  override render() {
    const nodes = this.computedTimelineNodes();
    const streamingNodeKey = this.streamingNodeKey(nodes);
    const assistantFooterKeys = this.assistantFooterKeys(nodes, streamingNodeKey);
    const responseSummaries = this.responseSummariesByAssistantKey(nodes, assistantFooterKeys);
    return html`
      <div class="chat-wrap">
        ${this.renderConversationRail()}
        <div class="chat" @scroll=${() => { this.onScroll(); }} @wheel=${(event: WheelEvent) => { this.onWheel(event); }} @touchstart=${(event: TouchEvent) => { this.onTouchStart(event); }} @touchmove=${(event: TouchEvent) => { this.onTouchMove(event); }}>
          ${this.renderHistoryBoundary()}
          <timeline-layout>
            ${nodes.map((node, index) => {
              const isStreamingNode = node.key === streamingNodeKey;
              if (!this.shouldRenderTimelineNode(node, isStreamingNode)) return null;
              return this.renderTimelineNode(node, index, assistantFooterKeys.has(node.key), isStreamingNode, this.stepSummaryReady(nodes, index), responseSummaries.get(node.key));
            })}
          </timeline-layout>
          ${this.renderQueuedMessages()}
          ${this.renderSessionActivity()}
          ${this.renderActivityDock()}
        </div>
      </div>
    `;
  }

  private timelineNodesInput?: ChatLine[];
  private timelineNodesStart = 0;
  private timelineNodesCache: TimelineNode[] = [];

  private computedTimelineNodes(): TimelineNode[] {
    if (this.timelineNodesInput === this.messages && this.timelineNodesStart === this.messageStart) return this.timelineNodesCache;
    this.timelineNodesInput = this.messages;
    this.timelineNodesStart = this.messageStart;
    this.timelineNodesCache = buildTimelineNodes(this.messages, this.messageStart);
    return this.timelineNodesCache;
  }

  private lastAssistantNodeKey(nodes: readonly TimelineNode[]): string | undefined {
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index];
      if (node?.type === "assistant") return node.key;
    }
    return undefined;
  }

  private revealedAssistantFooterKey(nodes: readonly TimelineNode[]): string | undefined {
    if (this.isAssistantFooterRevealBlocked()) return undefined;
    const lastAssistantNodeKey = this.lastAssistantNodeKey(nodes);
    return this.visibleAssistantFooterKey === lastAssistantNodeKey ? lastAssistantNodeKey : undefined;
  }

  private assistantFooterRevealInputsChanged(changed: Map<string, unknown>): boolean {
    return changed.has("messages")
      || changed.has("messageStart")
      || changed.has("sessionId")
      || changed.has("status")
      || changed.has("activity")
      || changed.has("isSendingPrompt")
      || changed.has("isCompacting")
      || changed.has("isReceivingPartialStream");
  }

  private prepareAssistantFooterReveal(changed: Map<string, unknown>): void {
    const lastAssistantNodeKey = this.lastAssistantNodeKey(this.computedTimelineNodes());
    const contentChanged = changed.has("messages") || changed.has("messageStart") || changed.has("sessionId");
    const shouldHideFooter = contentChanged
      || this.isAssistantFooterRevealBlocked()
      || lastAssistantNodeKey === undefined
      || (this.visibleAssistantFooterKey !== undefined && this.visibleAssistantFooterKey !== lastAssistantNodeKey);
    if (!shouldHideFooter) return;
    this.clearAssistantFooterRevealTimer();
    this.visibleAssistantFooterKey = undefined;
  }

  private scheduleAssistantFooterReveal(): void {
    const lastAssistantNodeKey = this.lastAssistantNodeKey(this.computedTimelineNodes());
    if (this.assistantFooterRevealTimer !== undefined || lastAssistantNodeKey === undefined || this.visibleAssistantFooterKey === lastAssistantNodeKey || this.isAssistantFooterRevealBlocked()) return;
    this.assistantFooterRevealTimer = window.setTimeout(() => {
      this.assistantFooterRevealTimer = undefined;
      const currentAssistantNodeKey = this.lastAssistantNodeKey(this.computedTimelineNodes());
      if (currentAssistantNodeKey === lastAssistantNodeKey && !this.isAssistantFooterRevealBlocked()) this.visibleAssistantFooterKey = lastAssistantNodeKey;
    }, ASSISTANT_FOOTER_REVEAL_DELAY_MS);
  }

  private clearAssistantFooterRevealTimer(): void {
    if (this.assistantFooterRevealTimer === undefined) return;
    window.clearTimeout(this.assistantFooterRevealTimer);
    this.assistantFooterRevealTimer = undefined;
  }

  private isAssistantFooterRevealBlocked(): boolean {
    return this.isReceivingPartialStream || this.isCompacting || this.isSessionLive();
  }

  private activityPhraseState(): string | undefined {
    const state = this.activityState();
    if (state === undefined || state === "idle") return undefined;
    if (this.activity !== undefined && (state === "idle" || this.activity.phase !== "idle")) {
      // Use activity label-based phrases when available
      return undefined;
    }
    return state;
  }

  /**
   * Return the key of the single node that should render in streaming mode.
   * Only the last assistant or thinking node gets streaming — all earlier
   * nodes always render full markdown regardless of session state.
   */
  private streamingNodeKey(nodes: readonly TimelineNode[]): string | undefined {
    if (!this.isSessionLive()) return undefined;
    for (let index = nodes.length - 1; index >= 0; index--) {
      const node = nodes[index];
      if (node?.type === "assistant" || node?.type === "thinking" || node?.type === "step") return node.key;
    }
    return undefined;
  }

  private assistantFooterKeys(nodes: readonly TimelineNode[], streamingNodeKey: string | undefined): Set<string> {
    const footerKeys = new Set<string>();
    let latestAssistantKey: string | undefined;
    for (const node of nodes) {
      if (node.type === "user") {
        this.addCompletedAssistantFooterKey(footerKeys, latestAssistantKey, streamingNodeKey);
        latestAssistantKey = undefined;
        continue;
      }
      if (node.type === "assistant") latestAssistantKey = node.key;
    }
    this.addCompletedAssistantFooterKey(footerKeys, latestAssistantKey, streamingNodeKey);
    return footerKeys;
  }

  private addCompletedAssistantFooterKey(footerKeys: Set<string>, assistantKey: string | undefined, streamingNodeKey: string | undefined): void {
    if (assistantKey === undefined) return;
    if (assistantKey === streamingNodeKey && this.isSessionLive()) return;
    footerKeys.add(assistantKey);
  }

  private responseSummariesByAssistantKey(nodes: readonly TimelineNode[], assistantFooterKeys: ReadonlySet<string>): Map<string, SessionWorkSummary> {
    const summaries = new Map<string, SessionWorkSummary>();
    let responseMessages: ChatLine[] = [];
    for (const node of nodes) {
      if (node.type === "user") {
        responseMessages = [];
        continue;
      }
      if (node.type === "assistant") {
        if (assistantFooterKeys.has(node.key)) {
          if (responseMessages.length > 0) summaries.set(node.key, buildSessionWorkSummary({ messages: responseMessages }));
          responseMessages = [];
        }
        continue;
      }
      const message = this.responseMessageFromTimelineNode(node);
      if (message !== undefined) responseMessages.push(message);
    }
    return summaries;
  }

  private responseMessageFromTimelineNode(node: TimelineNode): ChatLine | undefined {
    if (node.parts.length === 0) return undefined;
    if (node.type === "step" || node.type === "tool") return { role: "tool", parts: node.parts };
    if (node.type === "bash") return { role: "bash", parts: node.parts };
    if (node.type === "skill") return { role: "skill", parts: node.parts };
    if (node.type === "error") return { role: "system", parts: node.parts };
    return undefined;
  }

  private shouldRenderTimelineNode(node: TimelineNode, isStreamingNode: boolean): boolean {
    if (node.type !== "step") return true;
    const step = node.step;
    if (step === undefined) return false;

    const isRunning = step.tools.some((agg) => this.stepToolStatus(agg) === "running" || this.stepToolStatus(agg) === "pending");
    const hasThinking = step.thinking !== undefined;
    const isCompleteNoTools = !isRunning && step.tools.length === 0 && hasThinking;
    if (isCompleteNoTools && !isStreamingNode) return false;

    return true;
  }

  private stepToolStatus(agg: ToolAggregation): "idle" | "pending" | "running" | "success" | "error" {
    if (agg.execution !== undefined) return agg.execution.status;
    if (agg.result !== undefined) return agg.result.isError ? "error" : "success";
    if (agg.toolCall !== undefined) return "pending";
    if (agg.skillRead !== undefined) return "success";
    return "idle";
  }

  private stepSummaryReady(nodes: readonly TimelineNode[], index: number): boolean {
    const node = nodes[index];
    if (node?.type !== "step") return true;
    for (let nextIndex = index + 1; nextIndex < nodes.length; nextIndex++) {
      const next = nodes[nextIndex];
      if (next?.type === "assistant" && next.parts.some((part) => part.type === "text" && part.text !== "")) return true;
      if (next?.type === "user") return true;
    }
    return false;
  }

  private renderTimelineNode(node: TimelineNode, displayIndex: number, showAssistantFooter: boolean, isStreamingNode: boolean, stepSummaryReady: boolean, responseSummary: SessionWorkSummary | undefined) {
    const isLive = this.isSessionLive();
    const nodeStatus: TimelineNodeStatus = node.status;
    return html`
      ${this.renderScrollMarker(node.key)}
      <timeline-node-wrapper
        class="tl-node-instance"
        .status=${nodeStatus}
        .isLive=${isLive && node.type !== "user" && node.type !== "meta"}
        data-index=${String(displayIndex)}
        data-scroll-anchor-id=${node.key}
      >
        ${this.renderTimelineNodeContent(node, showAssistantFooter, isStreamingNode, stepSummaryReady, isLive, responseSummary)}
      </timeline-node-wrapper>
    `;
  }

  private renderTimelineNodeContent(node: TimelineNode, showAssistantFooter: boolean, isStreamingNode: boolean, stepSummaryReady: boolean, isLive: boolean, responseSummary: SessionWorkSummary | undefined) {
    switch (node.type) {
      case "user":
        return this.renderUserNode(node);
      case "assistant":
        return this.renderAssistantNode(node, showAssistantFooter, isStreamingNode, responseSummary);
      case "tool":
        return this.renderToolNode(node, isLive);
      case "step":
        return this.renderStepNode(node, isStreamingNode, stepSummaryReady);
      case "error":
        return this.renderErrorNode(node);
      case "bash":
        return this.renderBashNode(node);
      case "thinking":
        return this.renderThinkingNode(node, isStreamingNode);
      case "skill":
        return this.renderSkillNode(node);
      case "meta":
        return this.renderMetaNode(node);
      default:
        return null;
    }
  }

  private renderUserNode(node: TimelineNode) {
    const textPart = node.parts.find((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text");
    const key = node.key;
    return html`
      <div class="tl-user">
        ${this.renderMessageTools(node, key)}
        ${textPart ? html`<formatted-text .text=${textPart.text}></formatted-text>` : null}
        ${this.renderNodeImages(node)}
      </div>
    `;
  }

  private renderAssistantNode(node: TimelineNode, showFooter: boolean, streaming: boolean, responseSummary: SessionWorkSummary | undefined) {
    const textPart = node.parts.find((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text");
    const key = node.key;
    return html`
      <div class="tl-assistant">
        ${this.renderMessageTools(node, key)}
        ${textPart ? html`<formatted-text .text=${textPart.text} .streaming=${streaming}></formatted-text>` : null}
        ${this.renderNodeImages(node)}
        ${this.renderAssistantCompletionCards(node.key, showFooter, responseSummary)}
      </div>
    `;
  }

  private renderAssistantCompletionCards(nodeKey: string, showFooter: boolean, responseSummary: SessionWorkSummary | undefined) {
    if (!showFooter || responseSummary === undefined) return null;
    const expanded = this.expandedCompletionFileLists[nodeKey] === true;
    const cards = buildSessionCompletionCards(responseSummary, expanded ? Number.MAX_SAFE_INTEGER : 3);
    if (cards.artifact === undefined && cards.edits === undefined) return null;
    return html`
      <div class="tl-work-cards" aria-label="Work summary">
        ${cards.artifact === undefined ? null : this.renderArtifactCard(cards.artifact)}
        ${cards.edits === undefined ? null : this.renderEditCard(nodeKey, cards.edits)}
      </div>
    `;
  }

  private renderArtifactCard(card: SessionCompletionArtifactCard) {
    return html`
      <section class="tl-artifact-card" aria-label=${card.title}>
        <span class="tl-work-icon" aria-hidden="true">${this.renderDocumentIcon()}</span>
        <span class="tl-work-card-copy">
          <strong>${card.title}</strong>
          <small>${card.subtitle}</small>
        </span>
        <button class="tl-work-action" type="button" ?disabled=${this.onOpenWorkspaceFile === undefined} @click=${() => { this.onOpenWorkspaceFile?.(card.path); }}>
          <span>Open in</span>
          ${this.renderChevronDownIcon()}
        </button>
      </section>
    `;
  }

  private renderEditCard(nodeKey: string, card: SessionCompletionEditCard) {
    const reviewPath = card.visibleFiles[0]?.path;
    const expanded = this.expandedCompletionFileLists[nodeKey] === true;
    return html`
      <section class="tl-edit-card" aria-label=${card.title}>
        <header class="tl-edit-card-header">
          <span class="tl-work-icon" aria-hidden="true">${this.renderEditedFilesIcon()}</span>
          <span class="tl-work-card-copy">
            <strong>${card.title}</strong>
            ${this.renderStats(card.added, card.removed)}
          </span>
          ${reviewPath === undefined ? null : html`
            <button class="tl-work-action" type="button" ?disabled=${this.onReviewWorkspaceFile === undefined} @click=${() => { this.onReviewWorkspaceFile?.(reviewPath); }}>Review</button>
          `}
        </header>
        <ul class="tl-edit-file-list">
          ${card.visibleFiles.map((file) => this.renderChangedFileRow(file))}
        </ul>
        ${card.hiddenFileCount > 0 ? html`
          <button class="tl-show-more-files" type="button" @click=${() => { this.setCompletionFilesExpanded(nodeKey, true); }}>
            <span>Show ${String(card.hiddenFileCount)} more ${card.hiddenFileCount === 1 ? "file" : "files"}</span>
            ${this.renderChevronDownIcon()}
          </button>
        ` : expanded ? html`
          <button class="tl-show-more-files" type="button" @click=${() => { this.setCompletionFilesExpanded(nodeKey, false); }}>
            <span>Show fewer files</span>
            ${this.renderChevronUpIcon()}
          </button>
        ` : null}
      </section>
    `;
  }

  private setCompletionFilesExpanded(nodeKey: string, expanded: boolean): void {
    if (expanded) {
      this.expandedCompletionFileLists = { ...this.expandedCompletionFileLists, [nodeKey]: true };
      return;
    }
    this.expandedCompletionFileLists = Object.fromEntries(
      Object.entries(this.expandedCompletionFileLists).filter(([key]) => key !== nodeKey),
    );
  }

  private renderChangedFileRow(file: SessionCompletionFileRow) {
    const content = html`
      <span class="tl-edit-file-path">${file.path}</span>
      ${this.renderStats(file.added, file.removed)}
    `;
    if (this.onReviewWorkspaceFile === undefined) return html`<li class="tl-edit-file-row">${content}</li>`;
    return html`
      <li>
        <button class="tl-edit-file-row tl-edit-file-button" type="button" @click=${() => { this.onReviewWorkspaceFile?.(file.path); }}>${content}</button>
      </li>
    `;
  }

  private renderStats(added: number | undefined, removed: number | undefined) {
    if (added === undefined && removed === undefined) return null;
    return html`
      <span class="tl-diff-stats" aria-label=${`${String(added ?? 0)} added, ${String(removed ?? 0)} removed`}>
        <span class="tl-added">+${String(added ?? 0)}</span>
        <span class="tl-removed">-${String(removed ?? 0)}</span>
      </span>
    `;
  }

  private renderDocumentIcon() {
    return svg`
      <svg class="tl-work-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path>
        <path d="M14 3v5h5"></path>
        <path d="M8.5 12h7"></path>
        <path d="M8.5 16h5"></path>
      </svg>
    `;
  }

  private renderEditedFilesIcon() {
    return svg`
      <svg class="tl-work-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 3h9l3 3v15H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"></path>
        <path d="M15 3v4h4"></path>
        <path d="M12 10v7"></path>
        <path d="M8.5 13.5h7"></path>
      </svg>
    `;
  }

  private renderChevronDownIcon() {
    return svg`
      <svg class="tl-action-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="m4 6 4 4 4-4"></path>
      </svg>
    `;
  }

  private renderChevronUpIcon() {
    return svg`
      <svg class="tl-action-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="m4 10 4-4 4 4"></path>
      </svg>
    `;
  }

  private renderMessageTools(node: TimelineNode, key: string) {
    const text = this.nodeCopyText(node);
    const meta = this.nodeMetaLabel(node);
    if (text === "" && meta === undefined) return null;
    return html`
      <div class="tl-message-tools" aria-label="Message actions">
        ${text === "" ? null : this.renderCopyAction(text, key)}
        ${meta === undefined ? null : this.renderMetaInfo(meta)}
      </div>
    `;
  }

  private nodeCopyText(node: TimelineNode): string {
    return node.parts
      .filter((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text")
      .map((p) => p.text.trim())
      .filter((t) => t !== "")
      .join("\n\n");
  }

  private renderCopyAction(text: string, key: string) {
    if (text === "") return null;
    const copied = this.copiedMessageKey === key;
    return html`
      <button type="button" class="tl-tool-btn" title=${copied ? "Copied" : "Copy message"} aria-label=${copied ? "Copied" : "Copy message"} @click=${(event: MouseEvent) => { void this.copyNodeText(text, key, event); }}>
        ${copied ? this.renderCheckIcon() : this.renderCopyIcon()}
      </button>
    `;
  }

  private renderMetaInfo(meta: string) {
    return html`
      <span class="tl-meta-info" tabindex="0" title=${meta} aria-label=${`Message details: ${meta}`}>
        ${this.renderInfoIcon()}
      </span>
    `;
  }

  private renderCopyIcon() {
    return svg`
      <svg class="tl-tool-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <rect x="6" y="5" width="7" height="8" rx="1.4"></rect>
        <path d="M4 10H3.4A1.4 1.4 0 0 1 2 8.6V3.4A1.4 1.4 0 0 1 3.4 2h5.2A1.4 1.4 0 0 1 10 3.4V4"></path>
      </svg>
    `;
  }

  private renderCheckIcon() {
    return svg`
      <svg class="tl-tool-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="m3.5 8.5 3 3 6-7"></path>
      </svg>
    `;
  }

  private renderInfoIcon() {
    return svg`
      <svg class="tl-tool-svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="5.5"></circle>
        <path d="M8 7.2v3.6"></path>
        <path d="M8 5.1h.01"></path>
      </svg>
    `;
  }

  private async copyNodeText(text: string, key: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const ok = await this.writeClipboard(text);
    if (!ok) return;
    this.copiedMessageKey = key;
    window.setTimeout(() => {
      if (this.copiedMessageKey === key) this.copiedMessageKey = undefined;
    }, 1200);
  }

  private renderToolNode(node: TimelineNode, agentActive: boolean) {
    const agg = node.tool;
    if (agg) {
      return html`<tool-call-node .aggregation=${agg} .agentActive=${agentActive}></tool-call-node>`;
    }
    return null;
  }

  private renderErrorNode(node: TimelineNode) {
    const textPart = node.parts.find((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text");
    return html`
      <error-panel .message=${textPart?.text ?? ""}></error-panel>
    `;
  }

  private renderBashNode(node: TimelineNode) {
    const textPart = node.parts.find((p): p is Extract<ChatPart, { type: "text" }> => p.type === "text");
    if (!textPart) return null;
    return html`<bash-node .stdout=${textPart.text}></bash-node>`;
  }

  private renderThinkingNode(node: TimelineNode, streaming: boolean) {
    const part = node.parts.find((p): p is Extract<ChatPart, { type: "thinking" }> => p.type === "thinking");
    if (!part) return null;
    return html`<thinking-node .text=${part.text} .streaming=${streaming}></thinking-node>`;
  }

  private renderStepNode(node: TimelineNode, streaming: boolean, summaryReady: boolean) {
    const step = node.step;
    if (!step) return null;
    return html`<step-node .step=${step} .streaming=${streaming} .summaryReady=${summaryReady}></step-node>`;
  }

  private renderSkillNode(node: TimelineNode) {
    const part = node.parts[0];
    if (!part) return null;
    if (part.type === "skillInvocation") {
      return html`
        <collapsible-section summary=${`[skill] ${part.name}`}>
          <small>${part.location}</small>
          <formatted-text .text=${part.content}></formatted-text>
        </collapsible-section>
      `;
    }
    if (part.type === "skillRead") {
      return html`<tool-call-node .aggregation=${{ skillRead: part }} .agentActive=${this.isSessionLive()}></tool-call-node>`;
    }
    return null;
  }

  private renderMetaNode(node: TimelineNode) {
    const source = node.source;
    const label = source === "compaction"
      ? "History compaction"
      : source === "branch_summary"
        ? "Branch summary"
        : "Events";
    return html`
      <div class="tl-meta-line">${label}</div>
    `;
  }

  private renderNodeImages(node: TimelineNode) {
    const images = node.parts.filter((p): p is Extract<ChatPart, { type: "image" }> => p.type === "image");
    if (images.length === 0) return null;
    return images.map((part) => html`<img class="chat-image" src=${`data:${part.mimeType};base64,${part.data}`} alt="attached image" loading="lazy" />`);
  }

  private nodeMetaLabel(node: TimelineNode): string | undefined {
    const meta = node.meta;
    if (meta === undefined) return undefined;
    const parts: string[] = [];
    if (meta.timestamp !== undefined && meta.timestamp !== "") {
      const date = new Date(meta.timestamp);
      if (Number.isFinite(date.getTime())) parts.push(fullTimestampFormatter.format(date));
    }
    if (meta.model !== undefined) {
      const id = meta.model.responseId ?? meta.model.id;
      if (id !== undefined && id !== "") {
        parts.push(meta.model.provider !== undefined && meta.model.provider !== "" ? `Model: ${meta.model.provider}/${id}` : `Model: ${id}`);
      } else if (meta.model.provider !== undefined && meta.model.provider !== "") {
        parts.push(`Model: ${meta.model.provider}`);
      }
    }
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }

  private groupedMessages(): ChatGroup[] {
    if (this.groupedMessagesInput === this.messages && this.groupedMessagesStart === this.messageStart) return this.groupedMessagesCache;
    this.groupedMessagesInput = this.messages;
    this.groupedMessagesStart = this.messageStart;
    this.groupedMessagesCache = groupChatMessages(this.messages, this.messageStart);
    return this.groupedMessagesCache;
  }

  private isLiveTailGroup(groups: ChatGroup[], index: number): boolean {
    return index === groups.length - 1 && this.isSessionLive();
  }

  private isSessionLive(): boolean {
    return this.isSendingPrompt
      || this.status?.isStreaming === true
      || this.status?.isCompacting === true
      || this.status?.isBashRunning === true
      || this.activity?.phase === "active";
  }

  private renderActivityDock() {
    return null;
  }

  private renderQueuedMessages() {
    const queued = this.status?.queuedMessages ?? [];
    if (queued.length === 0) return null;
    return html`
      <aside class="queued-messages" aria-live="polite">
        <div class="queued-header">
          <strong>Queued messages</strong>
          <small>${queued.length} pending · Stop clears the queue</small>
        </div>
        ${queued.map((message, index) => html`
          <div class="queued-message">
            <span class="queued-kind">${message.kind === "steer" ? "Steer" : "Follow-up"} ${String(index + 1)}</span>
            <formatted-text .text=${message.text}></formatted-text>
          </div>
        `)}
      </aside>
    `;
  }

  private renderSessionActivity() {
    return null;
  }

  private syncPartialStreamNoticeBody(): void {
    this.partialStreamNoticeBody = this.isReceivingPartialStream ? randomPartialStreamNoticeBody() : undefined;
  }

  private currentPartialStreamNoticeBody(): string {
    this.partialStreamNoticeBody ??= randomPartialStreamNoticeBody();
    return this.partialStreamNoticeBody;
  }

  private activityState(): string | undefined {
    const status = this.status;
    if (status === undefined) return this.activity?.label;
    if (status.isCompacting) return "compacting";
    if (status.isBashRunning) return "bash";
    if (status.isStreaming) return "running";
    if (status.pendingMessageCount > 0) return "queued";
    return "idle";
  }

  private readonly activityPhrases: Record<string, string[]> = {
    running: ["Thinking…", "Analyzing request…", "Inspecting project…", "Reasoning…", "Planning…"],
    bash: ["Running command…", "Executing…", "Waiting for output…"],
    compacting: ["Compacting history…", "Summarizing…", "Organizing context…"],
    queued: ["Queued…", "Waiting…", "Pending…"],
  };

  private startActivityPhraseCycle(state: string): void {
    this.stopActivityPhraseCycle();
    const phrases = this.activityPhrases[state];
    if (phrases === undefined || phrases.length < 2) return;
    this.activityPhraseTimer = window.setInterval(() => {
      this.activityPhraseIndex = (this.activityPhraseIndex + 1) % phrases.length;
    }, 3500);
  }

  private stopActivityPhraseCycle(): void {
    if (this.activityPhraseTimer !== undefined) {
      window.clearInterval(this.activityPhraseTimer);
      this.activityPhraseTimer = undefined;
    }
    this.activityPhraseIndex = 0;
  }

  private activityText(state: string): string {
    const activity = this.activity;
    if (activity === undefined) {
      const phrases = this.activityPhrases[state];
      if (phrases !== undefined) {
        return phrases[this.activityPhraseIndex % phrases.length] ?? phrases[0] ?? state;
      }
      return state;
    }
    if (state !== "idle" && activity.phase === "idle") {
      const phrases = this.activityPhrases[state];
      if (phrases !== undefined) {
        return phrases[this.activityPhraseIndex % phrases.length] ?? phrases[0] ?? state;
      }
      return state;
    }
    return activity.detail !== undefined && activity.detail !== "" ? `${activity.label}: ${activity.detail}` : activity.label;
  }

  private renderConversationRail() {
    if (!this.messages.length || this.messageTotal <= 0) return null;
    const total = this.conversationDisplayTotal();
    const position = this.conversationPositionPercent(total);
    const loadedPercent = this.hasMore ? clampPercent((this.messages.length / total) * 100) : 100;
    return html`<conversation-meter .positionPercent=${position} .loadedPercent=${loadedPercent} @conversation-meter-seek=${this.onConversationMeterSeek}></conversation-meter>`;
  }

  private conversationDisplayTotal(): number {
    if (!this.hasMore && this.messageStart === 0) return Math.max(1, this.messages.length);
    return Math.max(1, this.messageTotal, this.messageStart + this.messages.length);
  }

  private conversationPositionPercent(total = this.conversationDisplayTotal()): number {
    if (total <= 1) return 100;
    const fallbackIndex = this.pinnedToBottom ? this.messageStart + this.messages.length - 1 : this.messageStart;
    const index = clampNumber(this.currentConversationIndex ?? fallbackIndex, 0, total - 1);
    return clampPercent((index / (total - 1)) * 100);
  }

  private renderHistoryBoundary() {
    const range = this.historyRangeLabel();
    if (this.loadingMore) return html`<div class="history-boundary"><span>Loading earlier messages…</span>${range}</div>`;
    if (this.hasMore) return html`
      <div class="history-boundary">
        <button type="button" class="history-load-button" ?disabled=${this.loadMoreRequested} @click=${() => { this.requestLoadMore(); }}>Load earlier messages</button>
        <span>Scroll up to load earlier messages</span>
        ${range}
      </div>
    `;
    if (this.messages.length) return html`<div class="history-boundary"><span>Beginning of session</span>${range}</div>`;
    return null;
  }

  private historyRangeLabel() {
    if (!this.messages.length || this.messageTotal <= 0) return null;
    const from = this.messageStart + 1;
    const to = this.loadedRawMessageEnd();
    const total = Math.max(this.messageTotal, to);
    return html`<small>Showing messages ${from}–${to} of ${total}</small>`;
  }

  private loadedRawMessageEnd(): number {
    return Math.max(this.messageEnd, this.messageStart + this.messages.length);
  }

  private renderMessage(message: ChatLine, index: number) {
    const toolOnly = this.isToolExecutionOnlyMessage(message);
    return html`
      ${this.renderScrollMarker(this.messageScrollMarkerId(index))}
      <article class=${toolOnly ? "msg tool-execution-shell" : `msg ${message.role}`} data-index=${index} data-scroll-anchor-id=${this.messageAnchorKey(index)}>
        ${toolOnly ? null : this.renderMessageHeader(message, String(index))}
        ${message.parts.map((part) => this.renderPart(part, message))}
      </article>
    `;
  }

  private isToolExecutionOnlyMessage(message: ChatLine): boolean {
    return message.role === "tool" && message.parts.length > 0 && message.parts.every((part) => part.type === "toolExecution");
  }

  private renderMessageGroup(messages: ChatLine[], startIndex: number, endIndex: number, defaultOpen: boolean) {
    const disclosureKey = this.groupDisclosureKey(startIndex, endIndex, defaultOpen);
    const open = this.disclosures.isOpen(disclosureKey, defaultOpen);
    
    // Collect all tool parts for the timeline
    const allParts = messages.flatMap(m => m.parts);
    const toolParts = allParts.filter(p => p.type === "toolExecution" || p.type === "toolCall" || p.type === "toolResult");
    const hasTimeline = toolParts.length >= 3 && defaultOpen;
    
    return html`
      ${this.renderScrollMarker(this.groupScrollMarkerId(endIndex))}
      <details class=${defaultOpen ? "msg event-group live" : "msg event-group"} data-index=${startIndex} data-scroll-anchor-id=${this.groupAnchorKey(startIndex)} ?open=${open} @toggle=${(event: Event) => { this.onGroupToggle(disclosureKey, event, defaultOpen); }}>
        <summary>
          <b class="label">${defaultOpen ? "live events" : "events"}</b>
          <span>${summarizeChatGroup(messages)}</span>
        </summary>
        <div class="group-body">
          ${hasTimeline ? html`<task-timeline class="group-timeline" .parts=${toolParts}></task-timeline>` : null}
          ${messages.map((message, offset) => {
            const toolOnly = this.isToolExecutionOnlyMessage(message);
            return html`
              <section class=${toolOnly ? "group-msg tool-execution-shell" : `group-msg ${message.role}`} data-index=${startIndex + offset} data-scroll-anchor-id=${this.eventAnchorKey(startIndex + offset)}>
                ${toolOnly ? null : this.renderMessageHeader(message, `${String(startIndex)}:${String(offset)}`)}
                ${message.parts.map((part) => this.renderPart(part, message))}
              </section>
            `;
          })}
        </div>
      </details>
    `;
  }

  private renderScrollMarker(markerId: string) {
    return html`<span class="scroll-marker" data-marker-id=${markerId} aria-hidden="true"></span>`;
  }

  private renderMessageHeader(message: ChatLine, key: string) {
    const meta = this.messageMetaLabel(message);
    const expanded = this.expandedMetaKey === key;
    const role = message.role;
    const showIcon = role !== "user" && role !== "assistant";
    return html`
      <div class="msg-header">
        <div class="msg-role">
          ${showIcon ? html`<span class="role-icon" aria-hidden="true">${renderRoleIcon(role)}</span>` : null}
          <span class="sr-only">${role}</span>
        </div>
        <div class="msg-header-trailing">
          ${this.renderMessageActions(message, key)}
          <span class=${expanded ? "msg-meta expanded" : "msg-meta"} role="button" tabindex="0" title=${meta.full} aria-label=${meta.full} aria-expanded=${String(expanded)} @click=${() => { this.expandedMetaKey = expanded ? undefined : key; }} @keydown=${(event: KeyboardEvent) => { this.onMetaKeydown(event, key, expanded); }}>${meta.short}</span>
        </div>
      </div>
    `;
  }

  private renderMessageActions(message: ChatLine, key: string) {
    if (!this.isCopyableMessage(message)) return null;
    const copied = this.copiedMessageKey === key;
    return html`
      <div class="msg-actions" aria-label="Message actions">
        <button type="button" class="msg-action" title=${copied ? "Copied" : "Copy message"} aria-label=${`${copied ? "Copied" : "Copy"} ${message.role} message`} @click=${(event: MouseEvent) => { void this.copyMessage(message, key, event); }}>
          <span aria-hidden="true">${copied ? "✓" : "⧉"}</span>
        </button>
      </div>
    `;
  }

  private onMetaKeydown(event: KeyboardEvent, key: string, expanded: boolean) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    this.expandedMetaKey = expanded ? undefined : key;
  }


  private isCopyableMessage(message: ChatLine): boolean {
    return (message.role === "user" || message.role === "assistant") && this.messageCopyText(message) !== "";
  }

  private messageCopyText(message: ChatLine): string {
    const cached = this.messageCopyTextCache.get(message);
    if (cached !== undefined) return cached;
    const text = message.parts
      .filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text")
      .map((part) => part.text.trim())
      .filter((partText) => partText !== "")
      .join("\n\n");
    this.messageCopyTextCache.set(message, text);
    return text;
  }

  private async copyMessage(message: ChatLine, key: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const ok = await this.writeClipboard(this.messageCopyText(message));
    if (!ok) return;
    this.copiedMessageKey = key;
    window.setTimeout(() => {
      if (this.copiedMessageKey === key) this.copiedMessageKey = undefined;
    }, 1200);
  }

  private async writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  private messageMetaLabel(message: ChatLine): { short: string; full: string } {
    const cached = this.messageMetaCache.get(message);
    if (cached !== undefined) return cached;
    const timestamp = message.meta?.timestamp;
    const model = this.modelLabel(message);
    if (timestamp === undefined && model === undefined) {
      const empty = { short: "no info", full: "No Pi message metadata available" };
      this.messageMetaCache.set(message, empty);
      return empty;
    }
    const time = timestamp === undefined ? undefined : this.formatTimestamp(timestamp);
    const parts = [time?.short, model].filter((part): part is string => part !== undefined && part !== "");
    const fullParts = [time?.full, model === undefined ? undefined : `Model: ${model}`].filter((part): part is string => part !== undefined && part !== "");
    const label = { short: parts.join(" · "), full: fullParts.join(" · ") };
    this.messageMetaCache.set(message, label);
    return label;
  }

  private formatTimestamp(timestamp: string): { short: string; full: string } | undefined {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return undefined;
    return { short: shortTimestampFormatter.format(date), full: fullTimestampFormatter.format(date) };
  }

  private modelLabel(message: ChatLine): string | undefined {
    const model = message.meta?.model;
    if (model === undefined) return undefined;
    const id = model.responseId ?? model.id;
    if (id === undefined || id === "") return model.provider;
    return model.provider !== undefined && model.provider !== "" ? `${model.provider}/${id}` : id;
  }

  private renderPart(part: ChatPart, message?: ChatLine) {
    if (part.type === "text" && message?.role === "bash") return html`<execution-log class="part" .stdout=${part.text}></execution-log>`;
    if (part.type === "text") return html`<formatted-text class="part" .text=${part.text}></formatted-text>`;
    // Thinking content is NEVER shown — use compact shimmer node instead
    if (part.type === "thinking") return html`<thinking-node class="part" .text=${part.text} .streaming=${this.isSessionLive()}></thinking-node>`;
    if (part.type === "skillInvocation") return html`
      <collapsible-section class="part" summary=${`[skill] ${part.name}`}>
        <small>${part.location}</small>
        <formatted-text .text=${part.content}></formatted-text>
      </collapsible-section>
    `;
    if (part.type === "skillRead") return html`<tool-call-node class="part" .aggregation=${{ skillRead: part }} .agentActive=${this.isSessionLive()}></tool-call-node>`;
    if (part.type === "image") return html`<img class="part chat-image" src=${`data:${part.mimeType};base64,${part.data}`} alt="attached image" loading="lazy" />`;
    // Compact tool call — single line, expandable
    if (part.type === "toolCall") return html`<tool-call-node class="part" .aggregation=${{ toolCall: part }} .agentActive=${this.isSessionLive()}></tool-call-node>`;
    if (part.type === "toolExecution") return html`<tool-call-node class="part" .aggregation=${{ execution: part }} .agentActive=${this.isSessionLive()}></tool-call-node>`;
    // Compact tool result — single status line
    if (part.type === "toolResult") return html`
      <div class="part tool-result-line ${part.isError ? "error" : "success"}">
        <span class="tool-result-status">${part.isError ? "✖" : "✓"}</span>
        <span class="tool-result-name">${part.toolName}</span>
        <span class="tool-result-summary">${part.isError ? "failed" : "done"}</span>
      </div>
    `;
    return null;
  }

  private onGroupToggle(key: string, event: Event, defaultOpen: boolean) {
    const details = event.currentTarget;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (this.disclosures.applyToggle(key, details.open, defaultOpen)) this.requestUpdate();
  }

  private onScroll() {
    this.requestLoadMoreIfNeeded();
    this.updatePinnedToBottomFromScroll();
    this.scheduleConversationRailUpdate();
    if (!this.suppressScrollSave) this.scheduleScrollPositionSave();
  }

  private onWheel(event: WheelEvent) {
    if (event.deltaY < 0 && this.canScrollUp()) this.pinnedToBottom = false;
  }

  private onTouchStart(event: TouchEvent) {
    this.touchStartY = event.touches[0]?.clientY;
  }

  private onTouchMove(event: TouchEvent) {
    const y = event.touches[0]?.clientY;
    if (this.touchStartY !== undefined && y !== undefined && y > this.touchStartY && this.canScrollUp()) this.pinnedToBottom = false;
  }

  private updatePinnedToBottomFromScroll() {
    const chat = this.chat;
    if (!chat) return;
    const heightChanged = this.didChatHeightChange();
    const wasPinnedToBottom = this.pinnedToBottom;
    const scrollingUp = chat.scrollTop < this.lastScrollTop;
    if (heightChanged && wasPinnedToBottom) {
      this.lastClientHeight = chat.clientHeight;
      this.scrollToBottom();
      return;
    }
    if (this.isAtBottom()) this.pinnedToBottom = true;
    else if (scrollingUp) this.pinnedToBottom = false;
    else this.pinnedToBottom = this.isNearBottom();
    this.lastScrollTop = chat.scrollTop;
    this.lastClientHeight = chat.clientHeight;
  }

  private didChatHeightChange(): boolean {
    const chat = this.chat;
    return chat !== undefined && this.lastClientHeight !== 0 && chat.clientHeight !== this.lastClientHeight;
  }

  private isPrependingMessages(changed: Map<string, unknown>): boolean {
    const oldMessageStart = changed.get("messageStart");
    return typeof oldMessageStart === "number" && this.messageStart < oldMessageStart;
  }

  private requestLoadMoreIfNeeded(): void {
    if (this.loadMoreCheckFrame !== undefined) return;
    this.loadMoreCheckFrame = requestAnimationFrame(() => {
      this.loadMoreCheckFrame = undefined;
      if (this.suppressLoadMoreRequests) return;
      const chat = this.chat;
      if (!chat) return;
      if (shouldRequestEarlierMessages({
        hasMore: this.hasMore,
        loadingMore: this.loadingMore || this.loadMoreRequested,
        canRequest: this.onLoadMore !== undefined,
        scrollTop: chat.scrollTop,
        scrollHeight: chat.scrollHeight,
        clientHeight: chat.clientHeight,
      })) this.requestLoadMore();
    });
  }

  private requestLoadMore(): void {
    if (this.loadMoreRequested) return;
    if (!this.hasMore || this.loadingMore || this.onLoadMore === undefined) return;
    this.loadMoreRequested = true;
    this.onLoadMore();
  }

  private isNearBottom(): boolean {
    const chat = this.chat;
    if (!chat) return true;
    return isNearScrollBottom(chat);
  }

  private isAtBottom(): boolean {
    const chat = this.chat;
    if (!chat) return true;
    return distanceFromScrollBottom(chat) < 2;
  }

  private canScrollUp(): boolean {
    const chat = this.chat;
    return chat !== undefined && chat.scrollTop > 0;
  }

  private scrollToBottom(smooth = false, forceSmooth = false) {
    if (this.scrollToBottomFrame !== undefined) return;
    this.scrollToBottomFrame = requestAnimationFrame(() => {
      this.scrollToBottomFrame = undefined;
      const chat = this.chat;
      if (!chat) return;
      this.withSuppressedScrollSave(() => {
        const distance = chat.scrollHeight - chat.scrollTop - chat.clientHeight;
        if (smooth && (forceSmooth || distance < 800)) chat.scrollTo({ top: chat.scrollHeight, behavior: "smooth" });
        else chat.scrollTop = chat.scrollHeight;
        this.lastScrollTop = chat.scrollTop;
        this.lastClientHeight = chat.clientHeight;
      });
    });
  }

  restoreScrollPosition() {
    const sessionId = this.sessionId;
    if (this.restoreScrollFrame !== undefined) cancelAnimationFrame(this.restoreScrollFrame);
    this.restoreScrollFrame = requestAnimationFrame(() => {
      this.restoreScrollFrame = undefined;
      if (this.sessionId !== sessionId) return;
      this.withSuppressedScrollSave(() => {
        const result = this.scrollController.restorePosition(sessionId, this.chat, this.scrollAnchorElements(), { fallbackToBottom: this.shouldFallbackToBottomForMissingAnchor() });
        this.handleScrollRestoreResult(sessionId, result);
      });
    });
  }

  scrollToLatest(smooth = true): void {
    this.pinnedToBottom = true;
    this.scrollToBottom(smooth, true);
  }

  private continuePendingScrollRestore(): void {
    const sessionId = this.pendingScrollRestoreSessionId;
    const position = this.pendingScrollRestorePosition;
    if (sessionId === undefined || position === undefined || sessionId !== this.sessionId || this.restoreScrollFrame !== undefined) return;
    this.restoreScrollFrame = requestAnimationFrame(() => {
      this.restoreScrollFrame = undefined;
      if (this.sessionId !== sessionId) return;
      this.withSuppressedScrollSave(() => {
        const result = this.scrollController.restoreExplicitPosition(position, this.chat, this.scrollAnchorElements(), { fallbackToBottom: this.shouldFallbackToBottomForMissingAnchor() });
        this.handleScrollRestoreResult(sessionId, result);
      });
    });
  }

  private handleScrollRestoreResult(sessionId: string, result: ChatScrollRestoreResult): void {
    this.syncScrollMetrics();
    if (result.status !== "missing") {
      this.updatePinnedToBottomAfterRestore(result.status);
      if (result.status === "restored" || result.status === "bottom") this.cancelPrependRestore();
      this.pendingScrollRestoreSessionId = undefined;
      this.pendingScrollRestorePosition = undefined;
      return;
    }

    this.pinnedToBottom = false;
    this.pendingScrollRestoreSessionId = sessionId;
    this.pendingScrollRestorePosition = result.position;
    const chat = this.chat;
    if (chat === undefined || !this.hasMore || this.loadingMore) return;
    chat.scrollTop = 0;
    this.syncScrollMetrics();
    this.requestLoadMore();
  }

  private shouldFallbackToBottomForMissingAnchor(): boolean {
    // While catching up to a stream, history can temporarily omit the in-flight
    // assistant message that a previous scroll save anchored to. Keep retrying
    // until the final refreshed transcript has a chance to render that anchor.
    return !this.hasMore && !this.isReceivingPartialStream;
  }

  private updatePinnedToBottomAfterRestore(status: Exclude<ChatScrollRestoreResult["status"], "missing">): void {
    if (status === "bottom") this.pinnedToBottom = true;
    else if (status === "restored") this.pinnedToBottom = this.isNearBottom();
  }

  private syncScrollMetrics(): void {
    const chat = this.chat;
    if (chat === undefined) return;
    this.lastScrollTop = chat.scrollTop;
    this.lastClientHeight = chat.clientHeight;
  }

  private cancelPrependRestore(): void {
    this.prependRestoreToken += 1;
    this.suppressLoadMoreRequests = false;
  }

  capturePrependScrollAnchor(): PrependScrollAnchor | undefined {
    const chat = this.chat;
    if (!chat) return undefined;
    return capturePrependScrollAnchor(chat, this.scrollMarkers());
  }

  restorePrependScrollAnchor(anchor: PrependScrollAnchor | undefined): void {
    if (!this.chat || !anchor) return;
    this.suppressLoadMoreRequests = true;
    this.suppressScrollSave = true;
    const token = this.prependRestoreToken + 1;
    this.prependRestoreToken = token;
    let frames = 0;
    const settle = () => {
      const chat = this.chat;
      if (!chat || token !== this.prependRestoreToken) return;
      restorePrependScrollAnchor(chat, anchor, anchor.markerId === undefined ? undefined : this.scrollMarkerAt(anchor.markerId));
      this.lastScrollTop = chat.scrollTop;
      frames += 1;
      // Formatted markdown/code layout can settle after Lit's first render. Re-apply
      // the marker anchor briefly so late height changes above the viewport do not
      // move the user's reading position.
      if (frames < PREPEND_RESTORE_SETTLE_FRAMES) {
        requestAnimationFrame(settle);
        return;
      }
      requestAnimationFrame(() => {
        if (token !== this.prependRestoreToken) return;
        this.suppressScrollSave = false;
        this.suppressLoadMoreRequests = false;
      });
    };
    settle();
  }

  saveScrollPosition(sessionId = this.sessionId) {
    if (!sessionId) return;
    this.scrollController.savePosition(sessionId, this.chat, this.scrollAnchorElements());
  }

  private scheduleScrollPositionSave() {
    const sessionId = this.sessionId;
    this.scrollController.scheduleSave(sessionId, (scheduledSessionId) => {
      if (this.sessionId === scheduledSessionId) this.saveScrollPosition(scheduledSessionId);
    });
  }

  private scheduleConversationRailUpdate(): void {
    if (this.draggingConversationMeter) return;
    if (this.conversationRailFrame !== undefined) return;
    this.conversationRailFrame = requestAnimationFrame(() => {
      this.conversationRailFrame = undefined;
      this.updateConversationRailPosition();
    });
  }

  private updateConversationRailPosition(): void {
    if (this.draggingConversationMeter) return;
    if (!this.messages.length || this.messageTotal <= 0) {
      this.currentConversationIndex = undefined;
      return;
    }
    const total = this.conversationDisplayTotal();
    const article = this.firstVisibleArticle();
    const index = Number(article?.dataset["index"]);
    if (Number.isFinite(index)) {
      this.currentConversationIndex = clampNumber(index, 0, Math.max(0, total - 1));
      return;
    }
    this.currentConversationIndex = clampNumber(this.pinnedToBottom ? this.messageStart + this.messages.length - 1 : this.messageStart, 0, Math.max(0, total - 1));
  }

  private readonly onConversationMeterSeek = (event: CustomEvent<{ percent: number; dragging?: boolean }>): void => {
    const dragging = event.detail.dragging === true;
    this.draggingConversationMeter = dragging;
    this.scrollToConversationPercent(event.detail.percent, dragging);
  };

  private scrollToConversationPercent(percent: number, dragging = false): void {
    const chat = this.chat;
    if (chat === undefined) return;
    const nextPercent = clampPercent(percent);
    const maxScroll = Math.max(0, chat.scrollHeight - chat.clientHeight);
    this.withInstantMeterScroll(chat, () => {
      chat.scrollTop = (nextPercent / 100) * maxScroll;
    }, dragging);
    this.pinnedToBottom = nextPercent >= 99 || this.isAtBottom();
    this.lastScrollTop = chat.scrollTop;
    this.lastClientHeight = chat.clientHeight;
    const total = this.conversationDisplayTotal();
    this.currentConversationIndex = total <= 1 ? 0 : clampNumber((nextPercent / 100) * (total - 1), 0, total - 1);
    if (nextPercent <= 2 && this.hasMore && !this.loadingMore) this.requestLoadMore();
  }

  private withInstantMeterScroll(chat: HTMLDivElement, callback: () => void, keepInstant: boolean): void {
    chat.style.scrollBehavior = "auto";
    callback();
    if (this.meterScrollResetFrame !== undefined) cancelAnimationFrame(this.meterScrollResetFrame);
    if (keepInstant) return;
    this.meterScrollResetFrame = requestAnimationFrame(() => {
      this.meterScrollResetFrame = undefined;
      chat.style.scrollBehavior = "";
    });
  }

  private scrollMarkers(): HTMLElement[] {
    return Array.from(this.renderRoot.querySelectorAll<HTMLElement>(".scroll-marker"));
  }

  private scrollMarkerAt(markerId: string): HTMLElement | undefined {
    return this.scrollMarkers().find((marker) => marker.dataset["markerId"] === markerId);
  }

  private firstVisibleArticle(): HTMLElement | undefined {
    const chat = this.chat;
    if (chat === undefined) return undefined;
    const primaryArticles = Array.from(this.renderRoot.querySelectorAll<HTMLElement>("article.msg, timeline-node-wrapper"));
    return findFirstVisibleArticle(chat, primaryArticles) ?? findFirstVisibleArticle(chat, this.articles());
  }

  private articles(): HTMLElement[] {
    return Array.from(this.renderRoot.querySelectorAll<HTMLElement>("article.msg, details.msg, timeline-node-wrapper"));
  }

  private scrollAnchorElements(): HTMLElement[] {
    return Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-scroll-anchor-id]"));
  }

  private withSuppressedScrollSave(callback: () => void) {
    this.suppressScrollSave = true;
    callback();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.suppressScrollSave = false;
      });
    });
  }

  private groupDisclosureKey(startIndex: number, endIndex: number, defaultOpen: boolean): string {
    return defaultOpen ? `${this.sessionId}:live:${String(startIndex)}` : `${this.sessionId}:${String(endIndex)}`;
  }

  private messageAnchorKey(index: number): string {
    return `m:${String(index)}`;
  }

  private groupRenderKey(startIndex: number): string {
    return `g:${String(startIndex)}`;
  }

  private groupAnchorKey(startIndex: number): string {
    return `g:${String(startIndex)}`;
  }

  private eventAnchorKey(index: number): string {
    return `e:${String(index)}`;
  }

  private messageScrollMarkerId(index: number): string {
    return `m:${String(index)}`;
  }

  private groupScrollMarkerId(endIndex: number): string {
    return `g:${String(endIndex)}`;
  }

  static override styles = [roleIconStyles, chatStyles];
}
