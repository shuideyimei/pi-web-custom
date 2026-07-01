import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ChatPart } from "./shared";
import { quantumBeaconStyles } from "./quantumBeacon";
import "./ToolCallCard";

@customElement("tool-call-group")
export class ToolCallGroup extends LitElement {
  @property({ attribute: false }) parts: ChatPart[] = [];
  @state() private expanded = false;

  override render() {
    const toolParts = this.parts.filter(
      (p): p is Extract<ChatPart, { type: "toolExecution" }> => p.type === "toolExecution"
    );
    if (toolParts.length === 0) return null;

    // Single tool call - no grouping needed
    if (toolParts.length === 1) {
      return html`<tool-call-card class="part" .execution=${toolParts[0]}></tool-call-card>`;
    }

    // Multiple tool calls - group with summary
    const successCount = toolParts.filter(p => p.status === "success").length;
    const errorCount = toolParts.filter(p => p.status === "error").length;
    const runningCount = toolParts.filter(p => p.status === "running" || p.status === "pending").length;

    return html`
      <div class="tool-group">
        <div class="group-header" role="button" tabindex="0"
          @click=${() => { this.expanded = !this.expanded; }}
          @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.expanded = !this.expanded; } }}>
          <span class="chevron" aria-hidden="true">${this.expanded ? "▾" : "▸"}</span>
          <strong>${String(toolParts.length)} tool calls</strong>
          <span class="group-stats">
            ${successCount > 0 ? html`<span class="stat success">${String(successCount)} done</span>` : null}
            ${errorCount > 0 ? html`<span class="stat error">${String(errorCount)} failed</span>` : null}
            ${runningCount > 0 ? html`<span class="stat running">${String(runningCount)} running</span>` : null}
          </span>
        </div>
        ${this.expanded ? html`
          <div class="group-body">
            ${toolParts.map((part) => html`
              <tool-call-card class="part" .execution=${part}></tool-call-card>
            `)}
          </div>
        ` : html`
          <div class="group-preview">
            ${toolParts.map((part) => html`
              <span class=${`preview-chip ${part.status}`}>
                ${part.toolName}
                ${pathFromArgs(part.args) !== undefined ? html`<span class="preview-path">${pathFromArgs(part.args)}</span>` : ""}
              </span>
            `)}
          </div>
        `}
      </div>
  `;
  }

  static override styles = [quantumBeaconStyles, css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .tool-group { display: grid; gap: 4px; width: 100%; max-width: 100%; min-width: 0; }
    .group-header { display: flex; align-items: center; gap: 6px; min-width: 0; padding: 6px 8px; border: 1px solid var(--pi-border-muted); border-radius: 12px; background: var(--pi-surface); cursor: pointer; user-select: none; font-size: 13px; }
    .group-header:hover { background: var(--pi-hover-overlay-strong); }
    .group-header:focus-visible { outline: 2px solid var(--pi-accent); outline-offset: -2px; border-radius: 8px; }
    .chevron { font-size: 11px; color: var(--pi-muted); }
    strong { color: var(--pi-text); font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
    .group-stats { display: inline-flex; gap: 6px; margin-left: auto; }
    .stat { font-size: 11px; }
    .stat.success { color: var(--pi-success); }
    .stat.error { color: var(--pi-danger); }
    .stat.running { color: var(--pi-running); }
    .group-body { display: grid; gap: 4px; padding-left: 8px; }
    .group-preview { display: flex; flex-wrap: wrap; gap: 4px; padding: 2px 0; }
    .preview-chip { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--pi-hover-overlay); border-radius: 6px; background: transparent; padding: 2px 8px; font-size: 12px; color: var(--pi-text); }
    .preview-chip.success { border-color: color-mix(in srgb, var(--pi-success) 12%, transparent); }
    .preview-chip.error { border-color: color-mix(in srgb, var(--pi-danger) 15%, transparent); }
    .preview-chip.running, .preview-chip.pending { border-color: color-mix(in srgb, var(--pi-running) 15%, transparent); }

    .preview-path { color: var(--pi-accent); font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `];
}

function pathFromArgs(args: unknown): string | undefined {
  if (args === null || args === undefined || typeof args !== "object") return undefined;
  const entries = Object.entries(args);
  const pathEntry = entries.find(([k]) => k === "path");
  const filePathEntry = entries.find(([k]) => k === "file_path");
  const p: unknown = pathEntry?.[1];
  const f: unknown = filePathEntry?.[1];
  if (typeof p === "string" && p !== "") return p;
  if (typeof f === "string") return f;
  return undefined;
}
