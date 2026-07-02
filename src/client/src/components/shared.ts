import { css } from "lit";

export interface ToolPreview {
  diff?: string;
  firstChangedLine?: number;
  error?: string;
}

export interface ToolExecutionPart {
  type: "toolExecution";
  toolCallId?: string;
  toolName: string;
  summary: string;
  args?: unknown;
  status: "pending" | "running" | "success" | "error";
  resultText?: string;
  content?: unknown;
  details?: unknown;
  preview?: ToolPreview;
}

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data: string }
  | { type: "thinking"; text: string }
  | { type: "skillInvocation"; name: string; location: string; content: string }
  | { type: "skillRead"; name: string; path: string; toolCallId?: string }
  | { type: "toolCall"; toolCallId?: string; toolName: string; summary: string; args?: unknown }
  | ToolExecutionPart
  | { type: "toolResult"; toolCallId?: string; toolName: string; text: string; isError: boolean; content?: unknown; details?: unknown }
  | { type: "empty" };

export interface ChatLine {
  role: "user" | "assistant" | "tool" | "system" | "bash" | "skill";
  parts: ChatPart[];
  source?: "compaction" | "branch_summary";
  meta?: {
    timestamp?: string;
    model?: { provider?: string; id?: string; responseId?: string };
  };
}

export interface CompletionItem {
  kind: "command" | "file";
  replaceFrom: number;
  replaceTo: number;
  insertText: string;
  detail: string;
  description?: string;
  cursorOffset?: number;
}

export const appStyles = css`
  /* Mobile browsers already subtract browser controls from 100dvh; reserve bottom safe area only in standalone PWA modes. */
  :host { --pi-app-safe-area-top: env(safe-area-inset-top); --pi-app-safe-area-bottom: 0px; position: fixed; top: 0; right: 0; left: 0; display: block; height: 100dvh; box-sizing: border-box; overflow: hidden; padding: var(--pi-app-safe-area-top) env(safe-area-inset-right) var(--pi-app-safe-area-bottom) env(safe-area-inset-left); color: var(--pi-text); background: transparent; font: 14px system-ui, sans-serif; }
  :host([data-color-scheme="dark"]) {
    background: transparent;
  }
  :host([data-color-scheme="dark"])::before,
  :host([data-color-scheme="dark"])::after { display: none; }
  :host([data-color-scheme="light"])::before,
  :host([data-color-scheme="light"])::after { display: none; }
  :host([data-color-scheme="light"]) {
    background: transparent;
  }
  :host([pwa-display-mode]) { --pi-app-safe-area-bottom: env(safe-area-inset-bottom); }
  @media (display-mode: window-controls-overlay) {
    :host {
      --pi-app-safe-area-top: max(env(safe-area-inset-top), env(titlebar-area-height, 0px));
      --pi-app-safe-area-bottom: env(safe-area-inset-bottom);
      background: var(--pi-main-bg);
    }
  }
  @media (display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui) {
    :host { --pi-app-safe-area-bottom: env(safe-area-inset-bottom); }
  }
  .shell { --navigation-panel-size: 340px; --workspace-panel-size: minmax(360px, 42vw); --navigation-panel-width: var(--navigation-panel-size); --workspace-panel-width: var(--workspace-panel-size); position: relative; z-index: 1; display: grid; grid-template-columns: var(--navigation-panel-width) 1px minmax(320px, 1fr) 1px var(--workspace-panel-width); grid-template-rows: minmax(0, 1fr); height: 100%; min-height: 0; overflow: hidden; }
  aside { grid-column: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; background: var(--pi-panel-bg); backdrop-filter: blur(34px) saturate(190%) contrast(105%) brightness(1.05); -webkit-backdrop-filter: blur(34px) saturate(190%) contrast(105%) brightness(1.05); border-right: 1px solid var(--pi-panel-border); box-shadow: inset 1px 0 0 0 var(--pi-inset-highlight); }
  aside app-navigation-panel { flex: 1 1 auto; min-height: 0; background: transparent; }
  header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px; border-bottom: 1px solid var(--pi-border); }
  .header-actions { display: flex; align-items: center; gap: 8px; }
  project-list, workspace-list { flex: 0 0 auto; max-height: 26%; min-height: 0; overflow: hidden; border-bottom: 1px solid var(--pi-glass-border); }
  session-list { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  main { grid-column: 3; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--pi-main-bg); }
  .context-bar { position: relative; flex: 0 0 auto; min-width: 0; display: none; align-items: center; gap: 0; padding: 6px 0; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
  .context-bar::before, .context-bar::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 20px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .context-bar::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .context-bar::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .context-bar.can-scroll-left::before, .context-bar.can-scroll-right::after { opacity: 1; }
  .context-bar-label { display: none; }
  .context-items { flex: 1 1 auto; min-width: 0; display: flex; align-items: stretch; gap: 5px; margin: 0; padding: 0 8px; list-style: none; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-padding-inline: 8px; scrollbar-width: thin; }
  .context-bar.has-context-actions .context-items { padding-right: 52px; scroll-padding-inline: 8px 52px; }
  .context-item { flex: 0 0 auto; min-width: 0; display: flex; }
  .context-actions { position: absolute; top: 6px; right: 0; bottom: 6px; z-index: 3; display: flex; align-items: center; padding: 0 8px 0 0; pointer-events: none; }
  .context-actions::after { content: ""; position: absolute; top: 0; right: 0; bottom: 0; z-index: 0; width: 26px; background: var(--pi-bg); pointer-events: none; }
  .context-chip { flex: 0 0 auto; min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; border: 1px solid var(--pi-border-muted); border-radius: 999px; background: var(--pi-surface); color: var(--pi-text); padding: 4px 8px; font: inherit; text-align: left; }
  .context-chip:hover { background: var(--pi-surface-hover); }
  .context-chip:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
  .context-chip.empty { border-style: dashed; color: var(--pi-muted); }
  .context-kind { display: none; }
  .context-value { min-width: 0; overflow: visible; text-overflow: clip; white-space: nowrap; }
  app-mobile-main-tabs { display: none; }
  .mobile-tabs-frame { position: relative; display: none; flex: 0 0 auto; min-width: 0; border-bottom: 1px solid var(--pi-border); background: var(--pi-bg); }
  .mobile-tabs-frame::before, .mobile-tabs-frame::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 20px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .mobile-tabs-frame::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .mobile-tabs-frame::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .mobile-tabs-frame.can-scroll-left::before, .mobile-tabs-frame.can-scroll-right::after { opacity: 1; }
  .mobile-tabs { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; padding: 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: thin; }
  .mobile-tabs button { flex: 0 0 auto; white-space: nowrap; }
  .mobile-navigation-tab, .mobile-navigation-panel { display: none; }
  .mobile-tabs button.selected { border-color: color-mix(in srgb, var(--pi-text) 20%, transparent); background: color-mix(in srgb, var(--pi-text) 10%, transparent); }
  .tab-badge { display: inline-block; min-width: 14px; margin-left: 4px; border: 1px solid var(--pi-success-border); border-radius: 999px; background: var(--pi-success-surface); color: var(--pi-success); padding: 0 5px; font-size: 11px; line-height: 16px; text-align: center; }
  .navigation-panel-edge, .workspace-panel-edge { min-width: 0; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: visible; background: var(--pi-bg); z-index: 2; }
  .navigation-panel-edge { grid-column: 2; }
  .workspace-panel-edge { grid-column: 4; }
  .navigation-panel-edge-button, .workspace-panel-edge-button { position: relative; z-index: 1; box-sizing: border-box; display: grid; place-items: center; width: 18px; height: 48px; padding: 0; border: 1px solid var(--pi-glass-border); border-radius: 999px; background: var(--pi-glass-bg); color: var(--pi-muted); opacity: .75; cursor: pointer; backdrop-filter: var(--pi-glass-blur); -webkit-backdrop-filter: var(--pi-glass-blur); }
  .navigation-panel-edge-button:hover, .navigation-panel-edge-button:focus-visible, .workspace-panel-edge-button:hover, .workspace-panel-edge-button:focus-visible { color: var(--pi-text); background: var(--pi-surface-hover); opacity: 1; }
  .shell.navigation-panel-collapsed .navigation-panel-edge-button { transform: translateX(calc(50% - .5px)); }
  .shell.workspace-panel-collapsed .workspace-panel-edge-button { transform: translateX(calc(-50% + .5px)); }
  .navigation-panel-edge-icon, .workspace-panel-edge-icon { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  workspace-panel { grid-column: 5; min-width: 0; min-height: 0; overflow: hidden; }
  @media (min-width: 1181px) {
    .shell.navigation-panel-collapsed { --navigation-panel-width: 0px; }
    .shell.navigation-panel-collapsed > aside { display: none; }
    .shell.workspace-panel-collapsed { --workspace-panel-width: 0px; }
    .shell.workspace-panel-collapsed > workspace-panel { display: none; }
  }
  @media (max-width: 1180px) {
    .shell { grid-template-columns: var(--navigation-panel-width) 1px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); }
    .shell.navigation-panel-collapsed { --navigation-panel-width: 0px; }
    .shell.navigation-panel-collapsed > aside { display: none; }
    aside { grid-row: 1 / 3; }
    .navigation-panel-edge { grid-row: 1 / 3; }
    main { grid-column: 3; grid-row: 1 / 3; }
    app-mobile-main-tabs { display: block; flex: 0 0 auto; min-width: 0; }
    .mobile-tabs-frame { display: flex; }
    .shell.workspace-view main { grid-row: 1; min-height: auto; }
    .shell.workspace-view > workspace-panel { grid-column: 3; grid-row: 2; display: flex; border-left: 0; }
    .shell:not(.workspace-view) > workspace-panel { display: none; }
    .workspace-panel-edge { display: none; }
    main.workspace-view chat-view, main.workspace-view prompt-editor,
    main.workspace-view .empty { display: none; }
    main.workspace-view { overflow: hidden; }
  }
  @media (max-width: 760px) {
    .shell { grid-template-columns: minmax(0, 1fr); }
    aside, .navigation-panel-edge { display: none; }
    main, .shell.workspace-view > workspace-panel { grid-column: 1; }
    .context-bar { display: flex; }
    .mobile-navigation-tab { display: block; }
    main.navigation-view chat-view, main.navigation-view prompt-editor,
    main.navigation-view .empty, main.navigation-view token-usage-dashboard { display: none; }
    main.navigation-view .mobile-navigation-panel { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
    main.navigation-view .mobile-navigation-panel app-navigation-panel { flex: 1 1 auto; min-height: 0; }
    main.navigation-view .mobile-navigation-panel project-list,
    main.navigation-view .mobile-navigation-panel workspace-list,
    main.navigation-view .mobile-navigation-panel session-list { flex: 1 1 auto; max-height: none; min-height: 0; overflow: hidden; }
    main.navigation-view .mobile-navigation-panel project-list[collapsed],
    main.navigation-view .mobile-navigation-panel workspace-list[collapsed],
    main.navigation-view .mobile-navigation-panel session-list[collapsed] { flex: 0 0 auto; min-height: auto; overflow: hidden; }
    main.home-view chat-view, main.home-view prompt-editor { display: none; }
  }
  chat-view { flex: 1 1 auto; min-height: 0; overflow: hidden; }
  prompt-editor { flex: 0 0 auto; position: relative; }
  button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  .empty { margin: auto; color: var(--pi-muted); }
  .error { padding: 10px 16px; border-bottom: 1px solid var(--pi-border); color: var(--pi-danger); }
`;

export const workspacePanelStyles = css`
  :host { display: flex; flex-direction: column; min-height: 0; color: var(--pi-text); background: var(--pi-panel-bg); backdrop-filter: blur(34px) saturate(190%) contrast(105%) brightness(1.05); -webkit-backdrop-filter: blur(34px) saturate(190%) contrast(105%) brightness(1.05); border-left: 1px solid var(--pi-panel-border); box-shadow: inset -1px 0 0 0 var(--pi-inset-highlight); font: 13px system-ui, sans-serif; container-type: inline-size; }
  header { flex: 0 0 auto; min-width: 0; border-bottom: 1px solid var(--pi-glass-border); background: transparent; }
  .workspace-header-scroll-frame { position: relative; min-width: 0; background: transparent; }
  .workspace-header-scroll-frame::before, .workspace-header-scroll-frame::after { content: ""; position: absolute; top: 0; bottom: 0; z-index: 2; width: 18px; opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .workspace-header-scroll-frame::before { left: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .workspace-header-scroll-frame::after { right: 0; background: linear-gradient(270deg, color-mix(in srgb, var(--pi-shadow-strong) 55%, transparent) 0%, transparent 100%); }
  .workspace-header-scroll-frame.can-scroll-left::before, .workspace-header-scroll-frame.can-scroll-right::after { opacity: 1; }
  .workspace-header-strip { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-width: 0; padding: 8px; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scrollbar-width: thin; }
  .tabs { flex: 0 0 auto; display: flex; gap: 6px; align-items: center; }
  .tabs button { flex: 0 0 auto; white-space: nowrap; }
  .tabs button.icon-tab { min-width: 34px; }
  button { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--pi-glass-border); border-radius: 7px; background: var(--pi-glass-bg); color: var(--pi-text); padding: 5px 7px; cursor: pointer; }
  button.selected { border-color: color-mix(in srgb, var(--pi-text) 20%, transparent); background: color-mix(in srgb, var(--pi-text) 10%, transparent); }
  .tab-icon { flex: 0 0 auto; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .tab-custom-icon { flex: 0 0 auto; width: 16px; height: 16px; display: inline-grid; place-items: center; color: currentColor; pointer-events: none; }
  .tab-custom-icon svg { width: 16px; height: 16px; pointer-events: none; }
  .tab-label { min-width: 0; }
  .tab-badge { flex: 0 0 auto; display: inline-block; min-width: 14px; border: 1px solid var(--pi-success-border); border-radius: 999px; background: var(--pi-success-surface); color: var(--pi-success); padding: 0 5px; font-size: 11px; line-height: 16px; text-align: center; }
  @container (max-width: 430px) {
    .tabs button.icon-tab { justify-content: center; padding-inline: 7px; }
    .tabs button.icon-tab .tab-label { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }
  }
  .panel-content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
  .empty-state { box-sizing: border-box; width: min(100%, 380px); margin: auto; padding: 24px; display: grid; gap: 8px; color: var(--pi-muted); text-align: center; }
  .empty-state h2 { margin: 0; color: var(--pi-text); font-size: 15px; line-height: 1.3; }
  .empty-state p { margin: 0; line-height: 1.45; }
  small, .muted { color: var(--pi-muted); }
  @media (max-width: 1180px) { header { display: none; } }
  .workspace-label { min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; overflow: hidden; white-space: nowrap; }
  .workspace-label-base, .workspace-label-item, .workspace-label-render { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .workspace-label-item, .workspace-label-render, .workspace-label-separator { color: var(--pi-muted); }
  .workspace-label-link { color: var(--pi-accent); text-decoration: none; }
  .workspace-label-link:hover, .workspace-label-link:focus { text-decoration: underline; }
  .toolbar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--pi-glass-border); }
  .toolbar button { margin-left: auto; }
  .stale { border: 1px solid var(--pi-warning-border); border-radius: 999px; color: var(--pi-warning); padding: 1px 6px; font-size: 12px; }
  .split { flex: 1 1 auto; min-height: 0; display: grid; grid-template-rows: minmax(160px, 34%) minmax(0, 1fr); }
  .list { min-height: 0; overflow: auto; border-bottom: 1px solid var(--pi-border); padding: 6px; }
  .row { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 4px; width: 100%; border: 0; border-radius: 5px; background: transparent; text-align: left; padding: 4px 6px 4px calc(6px + var(--depth, 0) * 14px); }
  .row:hover, .row.selected { background: var(--pi-selection-bg); }
  .row span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .summary { margin: 4px 6px 8px; color: var(--pi-muted); }
  .viewer { min-height: 0; overflow: auto; display: flex; flex-direction: column; }
  .diffs { flex: 1 1 auto; min-height: 0; overflow: auto; display: grid; grid-template-rows: minmax(120px, 1fr) minmax(120px, 1fr); }
  .diffs.single { grid-template-rows: minmax(0, 1fr); }
  .diff-section { min-height: 0; display: flex; flex-direction: column; border-bottom: 1px solid var(--pi-border); }
  .diff-section:last-child { border-bottom: 0; }
  .viewer-header { position: sticky; top: 0; display: flex; justify-content: space-between; gap: 8px; padding: 8px; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-bg); }
  .viewer-header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .diff-status { text-transform: uppercase; font-size: 10px; letter-spacing: .04em; border: 1px solid var(--pi-border-muted); border-radius: 999px; padding: 1px 6px; color: var(--pi-muted); }
  .diff-status.committed { border-color: var(--pi-info-border); color: var(--pi-info); }
  .diff-status.staged { border-color: var(--pi-success-border); color: var(--pi-success); }
  .diff-status.unstaged { border-color: var(--pi-warning-border); color: var(--pi-warning); }
  code-viewer, unified-diff-viewer { flex: 1 1 auto; min-height: 0; }
  .image-preview { flex: 1 1 auto; min-height: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; overflow: auto; padding: 16px; }
  .image-preview img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; border: 1px solid var(--pi-border-muted); border-radius: 8px; background-color: var(--pi-surface); background-image: linear-gradient(45deg, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 25%, transparent 25%), linear-gradient(-45deg, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 75%), linear-gradient(-45deg, transparent 75%, color-mix(in srgb, var(--pi-border-muted) 45%, transparent) 75%); background-position: 0 0, 0 8px, 8px -8px, -8px 0; background-size: 16px 16px; box-shadow: 0 8px 24px var(--pi-shadow-soft); }
  pre { margin: 0; padding: 10px; overflow: auto; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  p { margin: 10px; }
`;

export const listStyles = css`
  :host { display: flex; flex-direction: column; min-height: 0; overflow: hidden; color: var(--pi-text); font: 12.5px system-ui, sans-serif; background: transparent; }
  :host([collapsed]) { flex: 0 0 auto; min-height: auto; overflow: hidden; }
  section { box-sizing: border-box; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 10px; border: 0; background: transparent; }
  h2 { flex: 0 0 auto; display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0 0 8px; color: var(--pi-muted); font-size: 12px; text-transform: uppercase; }
  .list-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
  button { border: 1px solid var(--pi-glass-border); border-radius: 8px; background: var(--pi-glass-bg); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
  section > button { display: block; width: 100%; text-align: left; margin: 6px 0; }
  .subheading { margin-top: 14px; }
  .section-toggle { display: flex; flex: 1 1 auto; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; width: 100%; border: 0; background: transparent; color: inherit; padding: 0; font: inherit; text-align: left; text-transform: inherit; }
  .section-toggle span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .section-title { display: grid; gap: 2px; min-width: 0; }
  .section-toggle .section-selected { display: block; color: var(--pi-text); font-size: 12px; font-weight: 600; line-height: 1.25; text-transform: none; }
  .section-toggle .section-count { flex: 0 0 auto; display: inline; color: var(--pi-muted); font-size: inherit; }
  .section-toggle small { display: inline; color: inherit; font-size: inherit; }
  .action-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; margin: 6px 0; cursor: pointer; }
  .action-row:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; border-radius: 8px; }
  .action-row.selected .action-main, .action-row.selected .action-menu-toggle { background: var(--pi-selection-bg); }
  .action-row.archived .action-main { color: var(--pi-muted); }
  .action-main { position: relative; box-sizing: border-box; min-width: 0; width: 100%; border: 0; border-radius: 6px; background: transparent; color: var(--pi-text); padding: 6px 22px 6px calc(9px + var(--depth, 0) * 16px); text-align: left; }
  .action-name { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
  .action-row:not(.selected):hover .action-main { background: var(--pi-hover-overlay); }
  .workspace-row .action-main { border-radius: 6px; }
  .workspace-primary { min-width: 0; display: flex; align-items: baseline; gap: 6px; }
  .workspace-primary-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .workspace-status { flex: 0 0 auto; color: var(--pi-warning); font-size: 12px; }
  .workspace-secondary { margin-top: 3px; }
  .workspace-menu-panel { width: max-content; min-width: min(120px, calc(100vw - 16px)); padding: 8px; }
  .workspace-menu-actions { margin: 0 0 8px; padding-bottom: 8px; border-bottom: 1px solid var(--pi-border-muted); }
  .workspace-menu-actions button.danger { color: var(--pi-danger); }
  .workspace-menu-actions button.danger:hover, .workspace-menu-actions button.danger:focus { background: color-mix(in srgb, var(--pi-danger) 14%, transparent); }
  .workspace-menu-details { display: grid; gap: 6px; margin: 0; }
  .workspace-detail-row { display: grid; grid-template-columns: minmax(58px, max-content) minmax(0, 1fr); gap: 8px; align-items: baseline; }
  .workspace-detail-row dt { color: var(--pi-muted); font-size: 12px; white-space: normal; }
  .workspace-detail-row dd { min-width: 0; margin: 0; overflow-wrap: anywhere; white-space: normal; }
  .tree-marker { color: var(--pi-dim); margin-right: 5px; }
  .badge { display: inline-block; margin-left: 5px; border: 1px solid var(--pi-border); border-radius: 999px; color: var(--pi-muted); padding: 0 5px; font-size: 11px; font-weight: 400; }
  .action-activity { position: absolute; top: 4px; right: 5px; z-index: 1; display: grid; place-items: center; width: 14px; height: 14px; }
  .action-activity .activity-indicator { margin: 0; vertical-align: 0; }
  .activity-indicator { display: inline-flex; align-items: center; justify-content: center; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: transparent; vertical-align: 1px; position: relative; }
  .activity-indicator::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: var(--pi-success); animation: activity-breathe 2s ease-in-out infinite; }
  .activity-indicator::after { content: ''; position: absolute; inset: -3px; border-radius: inherit; background: var(--pi-success); opacity: 0; animation: activity-glow 2s ease-in-out infinite; filter: blur(3px); }
  .activity-indicator.session::before { background: var(--pi-success); }
  .activity-indicator.session::after { background: var(--pi-success); }
  /* ── Terminal activity: mini terminal window with scanning cursor ── */
  .activity-indicator.terminal {
    border-radius: 2px;
    width: 10px;
    height: 10px;
    border: 1px solid color-mix(in srgb, var(--pi-running) 30%, transparent);
    background: color-mix(in srgb, var(--pi-running) 5%, transparent);
    overflow: hidden;
  }
  .activity-indicator.terminal::before {
    content: '';
    position: absolute;
    inset: 2px;
    border-radius: 1px;
    background: var(--pi-accent);
    animation: terminal-cursor-blink 1.2s steps(1, end) infinite;
  }
  .activity-indicator.terminal::after {
    content: '';
    position: absolute;
    left: 2px;
    right: 2px;
    top: 0;
    height: 1px;
    background: color-mix(in srgb, var(--pi-running) 60%, transparent);
    animation: terminal-scan-line 1.5s ease-in-out infinite;
    filter: none;
    opacity: 1;
    border-radius: 0;
    inset: auto;
  }
  /* Client-side sending (upload in flight); distinct from server activity, which propagates to workspace/machine rows. */
  .activity-indicator.sending::before { background: var(--pi-warning); animation: activity-sending-spin 1.5s linear infinite; }
  .activity-indicator.sending::after { background: var(--pi-warning); animation: activity-sending-glow 1.5s linear infinite; }
  .action-menu { position: relative; align-self: stretch; }
  .action-menu-toggle { display: grid; place-items: center; height: 100%; min-width: 32px; padding: 0; color: var(--pi-muted); border: 0; border-radius: 6px; background: transparent; }
  .action-menu-toggle:hover { color: var(--pi-text); background: var(--pi-hover-overlay); }
  .action-menu-panel { position: fixed; z-index: 50; box-sizing: border-box; min-width: min(120px, calc(100vw - 16px)); overflow: auto; padding: 4px; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); box-shadow: 0 8px 24px var(--pi-shadow); overflow-wrap: anywhere; }
  .action-menu-panel button { display: block; width: 100%; text-align: left; white-space: normal; overflow-wrap: anywhere; border: 0; background: transparent; color: var(--pi-text); }
  .action-menu-panel button:hover { background: var(--pi-selection-bg); }
  button.selected { border-color: color-mix(in srgb, var(--pi-text) 20%, transparent); background: color-mix(in srgb, var(--pi-text) 10%, transparent); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  small { display: block; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
  .workspace-label { min-width: 0; display: inline-flex; align-items: baseline; gap: 5px; max-width: 100%; overflow: hidden; white-space: nowrap; }
  .workspace-label-base, .workspace-label-item, .workspace-label-render { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .workspace-label-item, .workspace-label-render, .workspace-label-separator { color: var(--pi-muted); }
  .workspace-label-link { color: var(--pi-accent); text-decoration: none; }
  .workspace-label-link:hover, .workspace-label-link:focus { text-decoration: underline; }
  .workspace-detail-row .workspace-label { overflow: visible; white-space: normal; flex-wrap: wrap; }
  .workspace-detail-row .workspace-label-base, .workspace-detail-row .workspace-label-item, .workspace-detail-row .workspace-label-render { overflow: visible; text-overflow: clip; overflow-wrap: anywhere; white-space: normal; }
  @keyframes activity-breathe { 0%, 100% { transform: scale(.7); opacity: .4; } 50% { transform: scale(1); opacity: 1; } }
  @keyframes activity-glow { 0%, 100% { transform: scale(.8); opacity: 0; } 50% { transform: scale(1.6); opacity: .35; } }
  @keyframes terminal-cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
  @keyframes terminal-scan-line { 0%, 100% { transform: translateY(2px); opacity: 0; } 20% { opacity: .8; } 50% { transform: translateY(8px); opacity: .8; } 80% { opacity: 0; } }
  @keyframes activity-sending-spin { 0% { transform: scale(.8); opacity: .6; clip-path: polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%); } 50% { transform: scale(1); opacity: 1; clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); } 100% { transform: scale(.8); opacity: .6; clip-path: polygon(50% 0%, 100% 0%, 100% 100%, 50% 100%); } }
  @keyframes activity-sending-glow { 0% { transform: scale(.8); opacity: 0; } 50% { transform: scale(1.8); opacity: .3; } 100% { transform: scale(.8); opacity: 0; } }
  @keyframes pulse { 0%, 100% { transform: scale(.75); opacity: .55; } 50% { transform: scale(1.2); opacity: 1; } }
`;

export const chatStyles = css`
  /* ════════════════════════════════════════════════════════════════
     Codex-style Document-First Chat Layout
     ════════════════════════════════════════════════════════════════ */
  :host { position: relative; z-index: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  .chat-wrap { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden; }
  .chat { height: 100%; min-height: 0; overflow: auto; overflow-anchor: none; scroll-behavior: smooth; padding: 16px 16px 20px; box-sizing: border-box; }
  .scroll-marker { display: block; height: 0; overflow: hidden; pointer-events: none; }

  /* ── Activity dock ── */
  .activity-dock { display: flex; align-items: center; gap: 6px; width: fit-content; max-width: min(520px, 100%); min-width: 0; box-sizing: border-box; margin: 8px auto 0; border: 1px solid var(--pi-border-muted); border-radius: 999px; background: transparent; color: var(--pi-muted); padding: 4px 9px; font-size: 12px; pointer-events: none; }
  .activity-dock.active { border-color: color-mix(in srgb, var(--pi-success) 25%, transparent); color: var(--pi-success); }
  .activity-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .45; flex: 0 0 auto; position: relative; }
  .dot::after { content: ''; position: absolute; inset: -2px; border-radius: 50%; background: currentColor; opacity: 0; filter: blur(2px); }
  .activity-dock.active .dot { animation: activity-breathe 2s ease-in-out infinite; opacity: 1; }
  .activity-dock.active .dot::after { animation: activity-glow 2s ease-in-out infinite; }

  /* ── Document-flow messages (no bubble left/right) ── */
  .msg {
    max-width: 100%; min-width: 0; box-sizing: border-box;
    margin: 0 0 0; padding: 12px 0 12px 0;
    border: 0; border-radius: 0;
    background: transparent;
    overflow: visible;
    position: relative;
  }
  /* Separator between messages */
  .msg + .msg::before {
    content: "";
    position: absolute; top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, var(--pi-hover-overlay), var(--pi-hover-overlay) 60%, transparent);
  }

  /* ── User message ── */
  .msg.user {
    color: var(--pi-text);
  }
  .msg.user > .msg-header .label { color: var(--pi-text-secondary); }

  /* ── Assistant message: no background, perfect document typesetting ── */
  .msg.assistant {
    background: transparent;
  }
  .msg.assistant > .msg-header .label { color: var(--pi-muted); }

  /* ── Tool message ── */
  .msg.tool { color: var(--pi-warning); }

  /* ── Tool-execution shell (no visual wrapper) ── */
  .msg.tool-execution-shell { padding: 0; border: 0; background: transparent; color: var(--pi-text); }
  .msg.tool-execution-shell + .msg::before { display: none; }

  /* ── System message ── */
  .msg.system { color: var(--pi-danger); background: var(--pi-danger-bg); }

  /* ── Bash message ── */
  .msg.bash { background: var(--pi-success-bg); }

  /* ── Skill message ── */
  .msg.skill { background: var(--pi-purple-surface); }

  /* ── Event group ── */
  .msg.event-group { padding: 0; border: 1px solid var(--pi-border-muted); border-radius: 12px; background: var(--pi-surface); color: var(--pi-muted); box-shadow: 0 12px 40px -4px var(--pi-shadow-strong); }
  .msg.event-group.live { border-color: color-mix(in srgb, var(--pi-success) 25%, transparent); }
  .msg.event-group > summary { position: sticky; top: -16px; z-index: 5; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 11px 11px 0 0; border-bottom: 1px solid var(--pi-border-muted); background: var(--pi-hover-overlay); color: var(--pi-muted); }
  .msg.event-group.live > summary { border-bottom-color: color-mix(in srgb, var(--pi-success) 2%, transparent); color: var(--pi-success); }
  .msg.event-group > summary .label { margin: 0; }
  .group-body { padding: 0 12px 12px; }

  /* ── Chat images ── */
  .chat-image { display: block; max-width: 100%; max-height: 320px; margin: 8px 0 0; border: 1px solid var(--pi-border-muted); border-radius: 8px; object-fit: contain; }

  /* ── Group messages ── */
  .group-msg { max-width: 100%; min-width: 0; box-sizing: border-box; padding: 10px 0; border-top: 1px solid var(--pi-hover-overlay); color: var(--pi-text); overflow: visible; }
  .group-msg.tool { color: var(--pi-warning); }
  .group-msg.tool-execution-shell { color: var(--pi-text); }
  .group-msg.system { color: var(--pi-danger); }
  .group-msg.bash { color: var(--pi-success); }

  /* ── History boundary ── */
  .history-boundary { position: relative; z-index: 5; display: grid; gap: 3px; justify-items: center; margin: 0 0 14px; color: var(--pi-muted); font-size: 12px; text-align: center; }
  .history-load-button { border: 1px solid var(--pi-border-muted); border-radius: 999px; background: var(--pi-surface); color: var(--pi-text-secondary); padding: 5px 12px; font: 12px system-ui, sans-serif; cursor: pointer; transition: all .2s cubic-bezier(.4,0,.2,1); }
  .history-load-button:hover, .history-load-button:focus { background: var(--pi-hover-overlay-strong); border-color: var(--pi-hover-overlay-strong); color: var(--pi-text-bright); }
  .history-load-button:disabled { cursor: default; opacity: .55; }

  /* ── Queued messages ── */
  .queued-messages { max-width: 100%; min-width: 0; box-sizing: border-box; display: grid; gap: 8px; margin: 0 0 14px; padding: 12px; border: 1px solid color-mix(in srgb, var(--pi-warning) 25%, transparent); border-radius: 12px; background: var(--pi-warning-surface); color: var(--pi-text); overflow: hidden; }
  .queued-header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .queued-header strong { color: var(--pi-warning); }
  .queued-header small { color: var(--pi-muted); }
  .queued-message { display: grid; gap: 4px; padding-top: 8px; border-top: 1px solid var(--pi-hover-overlay); }
  .queued-message:first-of-type { padding-top: 0; border-top: 0; }
  .queued-kind { color: var(--pi-muted); font-size: 12px; text-transform: uppercase; }

  /* ── Session activity ── */
  .session-activity { width: fit-content; max-width: min(560px, 100%); min-width: 0; box-sizing: border-box; display: flex; align-items: baseline; gap: 7px; margin: 8px auto 14px; padding: 4px 9px; border: 1px solid var(--pi-border-muted); border-radius: 999px; background: transparent; color: var(--pi-muted); overflow: hidden; font-size: 12px; }
  .session-activity.compacting { border-color: color-mix(in srgb, var(--pi-purple) 2%, transparent); }
  .compacting-spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid color-mix(in srgb, var(--pi-purple) 3%, transparent); border-top-color: var(--pi-purple); border-radius: 50%; animation: compacting-spin .8s linear infinite; vertical-align: middle; margin-right: 4px; }
  @keyframes compacting-spin { to { transform: rotate(360deg); } }
  .session-activity.receiving { border-color: color-mix(in srgb, var(--pi-success) 2%, transparent); }
  .session-activity strong { flex: 0 0 auto; color: var(--pi-purple); font-size: 12px; font-weight: 600; }
  .session-activity.receiving strong { color: var(--pi-success); }
  .session-activity span, .session-activity small { min-width: 0; overflow: hidden; color: var(--pi-muted); text-overflow: ellipsis; white-space: nowrap; }
  .history-boundary small { color: var(--pi-dim); }

  /* ── Message header ── */
  .msg-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 22px; margin-bottom: 8px; }
  .msg > .msg-header { position: sticky; top: -16px; z-index: 4; margin: -12px -0px 8px -16px; padding: 7px 10px 6px 16px; border-radius: 0; border-bottom: 1px solid var(--pi-hover-overlay); background: var(--pi-bg); box-shadow: 0 8px 18px var(--pi-shadow-soft); }
  .msg.user > .msg-header { border-bottom-color: color-mix(in srgb, var(--pi-text) 10%, transparent); }
  .msg.assistant > .msg-header { border-bottom-color: var(--pi-hover-overlay); background: var(--pi-bg); }
  .msg.tool > .msg-header { border-bottom-color: color-mix(in srgb, var(--pi-warning) 15%, transparent); }
  .msg.bash > .msg-header { border-bottom-color: color-mix(in srgb, var(--pi-success) 15%, transparent); }
  .msg.skill > .msg-header { border-bottom-color: color-mix(in srgb, var(--pi-purple) 15%, transparent); }
  .group-msg > .msg-header { position: sticky; top: -16px; z-index: 4; margin: -10px 0 8px; padding: 7px 0 6px; border-bottom: 1px solid var(--pi-hover-overlay); background: var(--pi-bg); }
  .msg-header-trailing { min-width: 0; display: inline-flex; align-items: baseline; justify-content: flex-end; gap: 8px; }
  .msg-actions { display: inline-flex; gap: 6px; opacity: 0; transition: opacity .12s ease; }
  .msg-action { display: inline-grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--pi-border-muted); border-radius: 6px; background: var(--pi-surface); color: var(--pi-muted); padding: 0; font: 14px system-ui, sans-serif; line-height: 1; cursor: pointer; transition: all .2s cubic-bezier(.4,0,.2,1); }
  .msg-action:hover, .msg-action:focus { color: var(--pi-text); background: var(--pi-hover-overlay-strong); border-color: var(--pi-hover-overlay-strong); }
  .msg:hover > .msg-header .msg-actions, .msg:focus-within > .msg-header .msg-actions, .group-msg:hover > .msg-header .msg-actions, .group-msg:focus-within > .msg-header .msg-actions { opacity: 1; }
  .label { display: block; color: var(--pi-muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .msg-header .label { margin: 0; }
  .msg-meta { min-width: 0; opacity: .28; border: 0; background: transparent; color: var(--pi-dim); padding: 0; font: 11px system-ui, sans-serif; text-align: right; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: opacity .12s ease, max-width .12s ease; cursor: pointer; user-select: text; -webkit-user-select: text; }
  .msg:hover > .msg-header .msg-meta, .msg:focus-within > .msg-header .msg-meta, .group-msg:hover > .msg-header .msg-meta, .group-msg:focus-within > .msg-header .msg-meta, .msg-meta:focus, .msg-meta.expanded { opacity: 1; }
  .msg-meta:focus { outline: 1px solid var(--pi-border-muted); outline-offset: 3px; border-radius: 4px; }
  @media (hover: none) {
    .msg-actions { opacity: 1; }
    .msg-meta { opacity: .75; max-width: 26px; }
    .msg-meta::before { content: "ⓘ"; font-size: 13px; }
    .msg-meta:focus, .msg-meta.expanded { opacity: 1; max-width: 75%; }
    .msg-meta:focus::before, .msg-meta.expanded::before { content: ""; }
  }

  /* ── Parts ── */
  formatted-text.part { display: block; }
  formatted-text.part, .queued-message formatted-text { text-align: start; unicode-bidi: plaintext; line-height: 1.65; }
  .part { max-width: 100%; min-width: 0; box-sizing: border-box; overflow: visible; }
  .part + .part { margin-top: 10px; }
  .tool-line { color: var(--pi-warning); }
  .summary { color: var(--pi-muted); margin-left: 6px; }
  .part:is(details) { border-top: 1px solid var(--pi-hover-overlay); padding-top: 8px; }
  .part > formatted-text { display: block; max-width: 100%; min-width: 0; overflow: visible; }

  /* ── Skill sections ── */
  .skill-invocation { border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-surface); padding: 8px 10px; }
  .skill-invocation > summary { color: var(--pi-purple); }
  .skill-invocation > small { display: block; margin: 6px 0 0; color: var(--pi-muted); }
  /* ── Document-flow role icon ── */
  .msg-role { display: inline-flex; align-items: center; gap: 6px; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; border: 0; }

  /* ── Tool call inline ── */
  .tool-arrow { color: var(--pi-running); font-size: 12px; }
  .tool-call-name { color: var(--pi-accent-ref); font-weight: 600; }
  .tool-call-name:hover { background: var(--pi-accent-ref-bg); border-radius: 2px; }

  /* ── Compact tool result line ── */
  .tool-result-line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    padding: 1px 0;
    font-size: 13px;
  }
  .tool-result-line.success .tool-result-status { color: color-mix(in srgb, var(--pi-success) 50%, var(--pi-muted)); }
  .tool-result-line.error .tool-result-status { color: var(--pi-muted); }
  .tool-result-name {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-weight: 600;
    color: var(--pi-dim);
  }
  .tool-result-summary {
    margin-left: auto;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }
  .tool-result-line.success .tool-result-summary { color: color-mix(in srgb, var(--pi-success) 45%, var(--pi-muted)); }
  .tool-result-line.error .tool-result-summary { color: var(--pi-muted); }

  /* ── Misc ── */
  summary { cursor: pointer; color: var(--pi-muted); }
  pre { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; direction: ltr; text-align: left; unicode-bidi: isolate; }
  .shell-output { color: var(--pi-text); font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; direction: ltr; text-align: left; unicode-bidi: isolate; }
  .thinking-section > summary { color: var(--pi-muted); font-size: 12px; }
  .group-timeline { margin-bottom: 10px; }

  /* ════════════════════════════════════════════════════════════════
     Timeline Execution Stream — Node Styles
     ════════════════════════════════════════════════════════════════ */

  /* ── Node wrapper instance ── */
  .tl-node-instance { display: block; width: 100%; min-width: 0; margin-bottom: 0; }

  /* ── User node: right-aligned message bubble ── */
  .tl-user { position: relative; min-width: 0; display: grid; justify-items: end; }
  .tl-user formatted-text {
    box-sizing: border-box;
    justify-self: end;
    width: fit-content;
    max-width: min(76%, 760px);
    border: 1px solid color-mix(in srgb, var(--pi-text) 15%, transparent);
    border-radius: 18px 18px 6px 18px;
    background: color-mix(in srgb, var(--pi-text) 6%, transparent);
    color: var(--pi-text);
    line-height: 1.65;
    font-size: 14.5px;
    padding: 10px 14px;
    overflow-wrap: anywhere;
  }
  .tl-user .chat-image { justify-self: end; max-width: min(76%, 760px); }

  /* ── Assistant node: no bubble, no background, document typesetting ── */
  .tl-assistant { position: relative; min-width: 0; }
  .tl-assistant formatted-text { color: var(--pi-text); line-height: 1.65; font-size: 14px; }

  /* ── Final work cards ── */
  .tl-work-cards { display: grid; gap: 10px; margin: 16px 0 10px; }
  .tl-artifact-card,
  .tl-edit-card {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--pi-border-muted);
    border-radius: 8px;
    background: var(--pi-surface);
    color: var(--pi-text);
    box-shadow: 0 6px 18px var(--pi-shadow-soft);
    overflow: hidden;
  }
  .tl-artifact-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 16px 22px;
  }
  .tl-edit-card-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    padding: 16px 22px;
    border-bottom: 1px solid var(--pi-border-muted);
  }
  .tl-work-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--pi-text) 4%, transparent);
    color: var(--pi-muted);
  }
  .tl-work-svg {
    display: block;
    width: 26px;
    height: 26px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tl-work-card-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .tl-work-card-copy strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--pi-text);
    font-size: 15px;
    font-weight: 650;
    line-height: 1.2;
  }
  .tl-work-card-copy small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--pi-muted);
    font-size: 13px;
    line-height: 1.25;
  }
  .tl-work-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 0;
    border: 1px solid var(--pi-border-muted);
    border-radius: 8px;
    background: color-mix(in srgb, var(--pi-text) 3%, transparent);
    color: var(--pi-text);
    padding: 8px 14px;
    font: 14px system-ui, sans-serif;
    line-height: 1;
    cursor: pointer;
  }
  .tl-work-action:hover,
  .tl-work-action:focus { background: var(--pi-surface-hover); border-color: var(--pi-border); }
  .tl-work-action:focus-visible,
  .tl-show-more-files:focus-visible,
  .tl-edit-file-button:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: 2px; }
  .tl-work-action:disabled { cursor: default; opacity: .55; }
  .tl-action-svg {
    flex: 0 0 auto;
    display: block;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tl-diff-stats {
    display: inline-flex;
    align-items: baseline;
    gap: 5px;
    min-width: 0;
    font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    line-height: 1.2;
  }
  .tl-added { color: var(--pi-success); }
  .tl-removed { color: var(--pi-danger); }
  .tl-edit-file-list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 10px 22px;
    list-style: none;
  }
  .tl-edit-file-row {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 12px;
    padding: 9px 0;
    color: var(--pi-text-secondary);
    font-size: 14px;
    line-height: 1.3;
  }
  .tl-edit-file-button {
    width: 100%;
    border: 0;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .tl-edit-file-button:hover { background: color-mix(in srgb, var(--pi-text) 4%, transparent); }
  .tl-edit-file-path {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tl-show-more-files {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: fit-content;
    max-width: calc(100% - 44px);
    margin: 0 22px 14px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--pi-text-secondary);
    padding: 7px 0;
    font: 14px system-ui, sans-serif;
    cursor: pointer;
  }
  .tl-show-more-files:hover { color: var(--pi-text); }
  @media (max-width: 640px) {
    .tl-artifact-card,
    .tl-edit-card-header {
      grid-template-columns: auto minmax(0, 1fr);
      padding: 14px;
    }
    .tl-artifact-card .tl-work-action,
    .tl-edit-card-header .tl-work-action {
      grid-column: 2;
      justify-self: start;
    }
    .tl-edit-file-list { padding: 8px 14px; }
    .tl-show-more-files { margin: 0 14px 12px; }
  }

  /* ── Role labels ── */


  /* ── Message tools: hover-only copy + metadata, out of the reading flow ── */
  .tl-message-tools {
    position: absolute;
    top: -10px;
    right: 0;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-2px);
    transition: opacity .12s ease, transform .12s ease;
  }
  .tl-user .tl-message-tools { right: 0; }
  .tl-user:hover .tl-message-tools,
  .tl-user:focus-within .tl-message-tools,
  .tl-assistant:hover .tl-message-tools,
  .tl-assistant:focus-within .tl-message-tools {
    opacity: 1;
    pointer-events: auto;
    transform: translateY(0);
  }
  .tl-tool-btn,
  .tl-meta-info {
    box-sizing: border-box;
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid var(--pi-border-muted);
    border-radius: 6px;
    background: var(--pi-bg);
    color: var(--pi-muted);
    padding: 0;
    line-height: 1;
    box-shadow: 0 4px 14px var(--pi-shadow-soft);
  }
  .tl-tool-btn {
    font: 14px system-ui, sans-serif;
    cursor: pointer;
    transition: color .15s ease, background .15s ease, border-color .15s ease;
  }
  .tl-meta-info {
    cursor: help;
  }
  .tl-tool-btn:hover,
  .tl-tool-btn:focus,
  .tl-meta-info:hover,
  .tl-meta-info:focus {
    color: var(--pi-text);
    background: var(--pi-surface-hover);
    border-color: var(--pi-border);
  }
  .tl-tool-btn:focus-visible,
  .tl-meta-info:focus-visible {
    outline: 2px solid var(--pi-accent);
    outline-offset: 2px;
  }
  .tl-tool-svg {
    display: block;
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (hover: none) {
    .tl-message-tools {
      opacity: .82;
      pointer-events: auto;
      transform: none;
    }
  }

  /* ── Meta line (compaction / events summary) ── */
  .tl-meta-line {
    font-size: 12px;
    font-family: monospace;
    color: var(--pi-dim);
    line-height: 1.4;
  }
`;

export const formattedTextStyles = css`
  :host { display: block; }
  .formatted { white-space: normal; overflow-wrap: anywhere; line-height: 1.65; text-align: start; unicode-bidi: plaintext; font-size: 14px; color: var(--pi-text); }

  /* ── Smooth scroll behavior ── */
  .chat { scroll-behavior: smooth; }
  
  /* ── Streaming content containers ── */
  .streaming-blocks, .streaming-tail { display: block; }
  .streaming-tail:empty { display: none; }
  .streaming-content {
    white-space: pre-wrap;
    word-break: break-word;
  }
  p, ul, ol, pre, blockquote, table, .code-block-wrapper { margin: 0 0 10px; }
  :is(p, ul, ol, pre, blockquote, table, .code-block-wrapper):last-child { margin-bottom: 0; }
  ul, ol { padding-left: 22px; }
  li + li { margin-top: 3px; }

  /* ── Inline code: neutral capsule ── */
  code {
    border: 0;
    border-radius: 6px;
    background: color-mix(in srgb, var(--pi-text) 10%, transparent);
    padding: 2px 6px;
    font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    direction: ltr; text-align: left; unicode-bidi: isolate;
    color: var(--pi-text);
  }

  /* ── Code block wrapper: glass toolbar, solid core body ── */
  .code-block-wrapper {
    position: relative;
    border: 1px solid var(--pi-glass-border);
    border-radius: 12px;
    overflow: hidden;
  }
  .code-block-wrapper pre {
    margin: 0;
    padding: 10px 40px 10px 10px;
    border: 0;
    border-radius: 0;
    background: color-mix(in srgb, var(--pi-text) 5%, transparent);
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* ── Code block (without wrapper) fallback ── */
  pre {
    border: 1px solid var(--pi-glass-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--pi-text) 5%, transparent);
    padding: 10px;
    overflow-x: auto; overflow-y: hidden;
    direction: ltr; text-align: left; unicode-bidi: isolate;
  }
  pre code { border: 0; padding: 0; background: transparent; border-radius: 0; }

  /* ── Code block buttons ── */
  .code-copy-button {
    position: absolute; top: 6px; right: 6px; z-index: 1;
    display: inline-grid; place-items: center; width: 24px; height: 24px;
    border: 1px solid var(--pi-glass-border); border-radius: 6px;
    background: var(--pi-glass-bg); color: var(--pi-muted);
    padding: 0; font: 14px system-ui, sans-serif; line-height: 1; cursor: pointer;
    transition: all .2s cubic-bezier(.4,0,.2,1);
  }
  .code-copy-button:hover, .code-copy-button:focus { color: var(--pi-text); background: var(--pi-hover-overlay-strong); border-color: var(--pi-hover-overlay-strong); }


  .code-collapse-button {
    position: absolute; bottom: 6px; right: 6px; z-index: 1;
    display: inline-grid; place-items: center; height: 24px;
    border: 1px solid var(--pi-glass-border); border-radius: 6px;
    background: var(--pi-glass-bg); color: var(--pi-muted);
    padding: 0 8px; font: 11px system-ui, sans-serif; cursor: pointer;
    transition: all .2s cubic-bezier(.4,0,.2,1);
  }
  .code-collapse-button:hover, .code-collapse-button:focus { color: var(--pi-text); background: var(--pi-hover-overlay-strong); border-color: var(--pi-hover-overlay-strong); }

  /* ── Blockquote ── */
  blockquote { border-left: 3px solid color-mix(in srgb, var(--pi-text) 12%, transparent); padding: 8px 12px; background: color-mix(in srgb, var(--pi-text) 5%, transparent); color: var(--pi-muted); border-radius: 0 6px 6px 0; }

  /* ── Links / references ── */
  a { color: var(--pi-text); text-decoration: none; }
  a:hover { text-decoration: underline; background: var(--pi-accent-ref-bg); border-radius: 2px; }

  /* ── Headings ── */
  h1, h2, h3, h4 { margin: 14px 0 8px; line-height: 1.2; color: var(--pi-text-bright); }
  h1:first-child, h2:first-child, h3:first-child, h4:first-child { margin-top: 0; }
  h1 { font-size: 20px; }
  h2 { font-size: 17px; }
  h3 { font-size: 15px; }
  h4 { font-size: 14px; }

  /* ── Tables ── */
  table { border-collapse: collapse; display: block; overflow-x: auto; overflow-y: hidden; }
  th, td { border: 1px solid var(--pi-glass-border); padding: 4px 8px; }
  th { background: var(--pi-hover-overlay); }
`;

export const statusBarStyles = css`
  :host { position: absolute; top: 2px; right: 20px; display: block; pointer-events: none; z-index: 4; }
  .bar { display: flex; justify-content: flex-end; gap: 10px; align-items: center; min-width: 0; padding: 3px 0; white-space: nowrap; overflow: hidden; color: var(--pi-muted); font: 11px system-ui, sans-serif; opacity: 0; transition: opacity .2s ease-in-out; }
  .bar.visible { opacity: .4; }
  span { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .muted { color: var(--pi-dim); }
`;

export const autocompleteStyles = css`
  :host { display: block; }
  .menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 6px); z-index: 10; max-height: 260px; overflow: auto; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); box-shadow: 0 10px 30px var(--pi-shadow); }
  button { display: grid; grid-template-columns: minmax(120px, 1fr) auto; gap: 4px 10px; width: 100%; border: 0; border-bottom: 1px solid var(--pi-border); border-radius: 0; background: transparent; color: var(--pi-text); padding: 8px 10px; text-align: left; cursor: pointer; }
  button:last-child { border-bottom: 0; }
  button.selected, button:hover { background: color-mix(in srgb, var(--pi-text) 8%, transparent); }
  span { color: var(--pi-muted); font-size: 12px; }
  small { grid-column: 1 / -1; color: var(--pi-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

export const commandPickerStyles = css`
  :host {
    position: fixed;
    inset: 0;
    z-index: 10;
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
  section { position: relative; width: min(720px, 100%); max-height: min(640px, calc(100dvh - min(12dvh, 92px) - max(20px, env(safe-area-inset-bottom)))); display: flex; flex-direction: column; border: 1px solid var(--codex-dialog-border); border-radius: 18px; background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 80px), var(--codex-dialog-surface); box-shadow: 0 24px 80px var(--pi-backdrop), 0 1px 0 var(--pi-inset-highlight) inset; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 58%, transparent); }
  header strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pi-text-secondary); font-size: 13px; font-weight: 650; letter-spacing: .01em; }
  .options { min-height: 0; overflow: auto; outline: none; padding: 6px; scrollbar-width: thin; }
  button { border: 0; border-radius: 12px; background: transparent; color: var(--pi-text); font: inherit; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
  header button { display: grid; place-items: center; flex: 0 0 auto; width: 30px; height: 30px; color: var(--pi-muted); font-size: 20px; line-height: 1; padding: 0; }
  header button:hover, header button:focus { color: var(--pi-text-bright); background: var(--codex-dialog-panel-hover); }
  input { box-sizing: border-box; margin: 12px 14px; border: 1px solid var(--codex-dialog-border); border-radius: 13px; background: var(--codex-dialog-panel); color: var(--pi-text); font: 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 10px 12px; outline: none; box-shadow: 0 1px 0 var(--pi-inset-highlight) inset; }
  input::placeholder { color: var(--pi-dim); }
  input:focus { border-color: var(--codex-dialog-focus); background: color-mix(in srgb, var(--codex-dialog-panel) 86%, var(--pi-text) 4%); }
  .options button { display: block; width: 100%; padding: 11px 12px; text-align: left; }
  .options button.selected, .options button:hover { background: var(--codex-dialog-panel-hover); }
  small { display: block; margin-top: 4px; color: var(--pi-muted); line-height: 1.35; }
  .empty { padding: 28px; color: var(--pi-muted); text-align: center; }
  @media (max-width: 640px) {
    .backdrop { padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom)); }
    section { max-height: calc(100dvh - max(12px, env(safe-area-inset-top)) - max(12px, env(safe-area-inset-bottom))); border-radius: 16px; }
  }
`;

export const actionPaletteStyles = css`
  :host {
    position: fixed;
    inset: 0;
    z-index: 20;
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
  .backdrop { --palette-top: min(12dvh, 92px); --palette-bottom: max(20px, env(safe-area-inset-bottom)); display: grid; align-items: start; justify-items: center; width: 100%; height: 100dvh; background: var(--codex-dialog-backdrop); padding: var(--palette-top) 20px var(--palette-bottom); box-sizing: border-box; backdrop-filter: blur(18px) saturate(115%); -webkit-backdrop-filter: blur(18px) saturate(115%); overflow: hidden; }
  section { position: relative; width: min(720px, 100%); max-height: min(640px, calc(100dvh - var(--palette-top) - var(--palette-bottom))); display: flex; flex-direction: column; border: 1px solid var(--codex-dialog-border); border-radius: 18px; background: linear-gradient(180deg, color-mix(in srgb, var(--pi-text-bright) 4%, transparent), transparent 80px), var(--codex-dialog-surface); box-shadow: 0 24px 80px var(--pi-backdrop), 0 1px 0 var(--pi-inset-highlight) inset; overflow: hidden; }
  header { display: grid; grid-template-columns: 1fr auto; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--codex-dialog-hairline); background: color-mix(in srgb, var(--codex-dialog-panel) 58%, transparent); }
  input { min-width: 0; border: 0; outline: none; border-radius: 12px; background: transparent; color: var(--pi-text); font: 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 9px 10px; }
  input::placeholder { color: var(--pi-dim); }
  button { border: 0; border-radius: 12px; background: transparent; color: var(--pi-text); font: inherit; cursor: pointer; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--codex-dialog-focus); outline-offset: 2px; }
  header button { display: grid; place-items: center; width: 32px; height: 32px; color: var(--pi-muted); font-size: 21px; line-height: 1; padding: 0; }
  header button:hover, header button:focus { color: var(--pi-text-bright); background: var(--codex-dialog-panel-hover); }
  .options { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 6px; scrollbar-width: thin; }
  .options button { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 12px; width: 100%; padding: 11px 12px; text-align: left; }
  .options button.selected, .options button:hover { background: var(--codex-dialog-panel-hover); }
  .main { min-width: 0; }
  strong { display: block; overflow: hidden; color: var(--pi-text-bright); font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  small { display: block; color: var(--pi-muted); overflow: hidden; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
  .group { grid-column: 1 / -1; font-size: 12px; }
  kbd { align-self: center; border: 1px solid var(--codex-dialog-border); border-radius: 7px; background: var(--codex-dialog-panel); color: var(--pi-muted); padding: 2px 7px; font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: nowrap; box-shadow: 0 1px 0 var(--pi-inset-highlight) inset; }
  .empty { padding: 28px; color: var(--pi-muted); text-align: center; }
  @media (max-width: 640px) {
    .backdrop { --palette-top: max(12px, env(safe-area-inset-top)); --palette-bottom: max(12px, env(safe-area-inset-bottom)); padding-inline: 12px; }
    section { border-radius: 16px; }
  }
`;

export const promptEditorStyles = css`
  /* ════════════════════════════════════════════════════════════════
     Minimalist Single-Line Composer
     ════════════════════════════════════════════════════════════════ */
  :host { position: relative; z-index: 5; display: block; color: var(--pi-text); font: 14px system-ui, sans-serif; }
  .composer-shell { position: relative; box-sizing: border-box; padding-top: 14px; }
  footer {
    position: relative;
    padding: 10px 14px;
    border-top: 0;
    transition: opacity .2s ease-in-out;
  }
  footer[data-generating] { opacity: .65; }
  footer.shell-mode { background: var(--pi-success-bg); }

  /* ── Single-line composer row ── */
  .composer-line {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--pi-border-muted);
    border-radius: 24px;
    background: var(--pi-surface);
    box-shadow: 0 10px 34px -6px var(--pi-shadow-strong);
    transition: border-color .2s ease-in-out, box-shadow .2s ease-in-out;
  }
  footer:focus-within .composer-line, footer:hover .composer-line {
    border-color: var(--pi-hover-overlay-strong);
    box-shadow: 0 10px 34px -6px var(--pi-shadow-strong), 0 0 0 1.5px color-mix(in srgb, var(--pi-running) 10%, transparent);
  }
  footer.shell-mode .composer-line { border-color: color-mix(in srgb, var(--pi-success) 12%, transparent); }

  /* ── Left cluster: model selector ── */
  .left-cluster { flex: 0 1 auto; display: flex; align-items: center; gap: 6px; min-width: 0; }
  .model-selector {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: min(34vw, 220px);
    padding: 4px 6px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--pi-muted);
    font: 12px system-ui, sans-serif;
    cursor: pointer;
    transition: all .2s ease-in-out;
  }
  .model-selector:hover, .model-selector:focus-visible { background: color-mix(in srgb, var(--pi-text) 6%, transparent); color: var(--pi-text-secondary); }
  .model-globe { font-size: 11px; line-height: 1; filter: grayscale(.3); }
  .model-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-chevron { opacity: 0; transform: translateY(1px); transition: opacity .15s ease; }
  .model-selector:hover .model-chevron, .model-selector:focus-visible .model-chevron { opacity: 1; }
  .thinking-selector {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--pi-muted);
    cursor: pointer;
    transition: all .2s ease-in-out;
  }
  .thinking-selector:hover, .thinking-selector:focus-visible { background: color-mix(in srgb, var(--pi-text) 6%, transparent); color: var(--pi-text-secondary); }
  .thinking-selector .prompt-thinking-gauge { width: 14px; height: 14px; }
  .thinking-selector .prompt-thinking-gauge .gauge-bar { fill: currentColor; stroke: none; opacity: .28; }
  .thinking-selector .prompt-thinking-gauge .gauge-bar-active { opacity: 1; }

  /* ── Center: flexible editor ── */
  .editor-wrap { flex: 1 1 auto; position: relative; min-width: 0; }
  .markdown-editor .cm-editor {
    box-sizing: border-box; width: 100%;
    min-height: 36px; max-height: 220px; resize: none; overflow: hidden;
    border-radius: 16px;
    border: 0;
    background: transparent;
    color: var(--pi-text);
    font: 15px/1.45 system-ui, sans-serif;
    box-shadow: none;
    transition: background .2s ease-in-out;
  }
  .markdown-editor .cm-focused .cm-editor { outline: none; }
  .markdown-editor .cm-scroller { max-height: 220px; overflow-y: auto; font-family: system-ui, sans-serif; line-height: 1.45; border-radius: 16px; }
  .markdown-editor .cm-content { min-height: 22px; padding: 7px 6px; caret-color: var(--pi-text); text-align: start; unicode-bidi: plaintext; }
  .markdown-editor .cm-line { padding: 0; unicode-bidi: plaintext; }
  .markdown-editor .cm-placeholder { color: var(--pi-dim); }
  .markdown-editor-disabled .cm-editor { opacity: .45; }

  /* ── Right cluster: attach + action ── */
  .right-cluster { flex: 0 0 auto; display: flex; align-items: center; gap: 2px; }
  .right-cluster button {
    display: inline-grid;
    place-items: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    background: transparent;
    color: var(--pi-muted);
    cursor: pointer;
    transition: all .2s ease-in-out;
  }
  .right-cluster button:hover:not(:disabled), .right-cluster button:focus-visible:not(:disabled) { background: color-mix(in srgb, var(--pi-text) 6%, transparent); color: var(--pi-text-secondary); }
  .right-cluster button:disabled { opacity: .35; cursor: not-allowed; }
  .right-cluster .prompt-action-icon, .right-cluster .prompt-thinking-gauge { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  .right-cluster .prompt-action-icon-filled { fill: currentColor; stroke: none; }
  .attach-button { opacity: .65; }
  .attach-button:hover:not(:disabled) { opacity: 1; }

  /* ── Quantum action button ── */
  .action-button { position: relative; overflow: hidden; }
  .action-button.action-active { color: var(--pi-accent); }
  .action-button.action-generating { color: var(--pi-danger); }
  .action-icon { display: inline-grid; place-items: center; transition: opacity .2s ease-in-out, transform .2s ease-in-out; }
  .action-icon.hidden { opacity: 0; transform: scale(.7); pointer-events: none; }
  .action-icon-stop { position: absolute; inset: 0; }

  /* ── Inline autocomplete at cursor ── */
  autocomplete-menu { position: absolute; left: 0; right: 0; bottom: calc(100% + 8px); z-index: 10; }
  autocomplete-menu.cursor-positioned {
    left: auto;
    right: auto;
    bottom: auto;
  }

  /* ── Steer long-press popup ── */
  .steer-popup {
    position: absolute;
    right: 10px;
    bottom: calc(100% + 8px);
    z-index: 11;
    padding: 4px;
    border: 1px solid var(--pi-border-muted);
    border-radius: 10px;
    background: var(--pi-surface);
    box-shadow: 0 10px 30px var(--pi-shadow);
  }
  .steer-option {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 7px 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--pi-text);
    font: 13px system-ui, sans-serif;
    white-space: nowrap;
    cursor: pointer;
  }
  .steer-option:hover, .steer-option:focus-visible { background: color-mix(in srgb, var(--pi-text) 8%, transparent); }
  .steer-option kbd { padding: 1px 5px; border: 1px solid var(--pi-border-muted); border-radius: 5px; background: var(--pi-bg); color: var(--pi-muted); font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

  /* ── Mode hints / Attachments ── */
  .mode-hint { position: absolute; right: 58px; bottom: 4px; max-width: calc(100% - 80px); border: 1px solid color-mix(in srgb, var(--pi-success) 25%, transparent); border-radius: 999px; background: var(--pi-success-bg); color: var(--pi-success); padding: 2px 8px; font-size: 11px; pointer-events: none; }
  .attachments { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 8px; padding: 0 4px; }
  .attachment-chip { position: relative; width: 56px; height: 56px; border: 1px solid var(--pi-border-muted); border-radius: 8px; overflow: hidden; background: var(--pi-solid-bg); }
  .attachment-chip img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .attachment-chip-file { display: grid; place-items: center; }
  .attachment-file-preview { display: grid; place-items: center; width: 34px; height: 26px; border: 1px solid var(--pi-border-muted); border-radius: 4px; background: var(--pi-surface); color: var(--pi-muted); font: 700 10px/1 system-ui, sans-serif; letter-spacing: .03em; }
  .attachment-file-name { position: absolute; right: 4px; bottom: 3px; left: 4px; overflow: hidden; color: var(--pi-muted); font-size: 10px; line-height: 1.2; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
  .attachment-remove { position: absolute; top: 1px; right: 1px; width: 18px; height: 18px; padding: 0; line-height: 16px; border-radius: 50%; border: 1px solid var(--pi-border-muted); background: var(--pi-surface); color: var(--pi-text); font-size: 13px; cursor: pointer; }
  .attachment-delivery select { border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 5px 7px; font: 12px system-ui, sans-serif; }
  .attachment-error { flex-basis: 100%; color: var(--pi-danger); font-size: 12px; }

  @media (max-width: 640px) {
    footer { padding: 8px 10px; }
    .composer-line { gap: 6px; padding: 5px 6px; border-radius: 20px; }
    .model-selector { max-width: min(40vw, 170px); font-size: 11px; }
    .markdown-editor .cm-content { padding: 7px 4px; font-size: 16px; }
  }
  @media (max-width: 430px) {
    .model-selector { max-width: 34vw; }
    .thinking-selector { display: none; }
    .right-cluster button { width: 32px; height: 32px; }
  }
`;
