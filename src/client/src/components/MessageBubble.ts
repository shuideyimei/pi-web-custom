import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ChatLine, ChatPart } from "./shared";
import "./FormattedText";
import "./ToolCallNode";
import "./ToolCallGroup";
import "./TaskTimeline";
import "./ExecutionLog";
import "./CollapsibleSection";
import "./DiffViewer";
import "./ThinkingNode";

@customElement("message-bubble")
export class MessageBubble extends LitElement {
  @property({ attribute: false }) message: ChatLine | undefined;
  @property({ type: Boolean }) isLive = false;

  override render() {
    const message = this.message;
    if (message === undefined) return null;

    return html`
      <div class=${`bubble ${message.role}${this.isLive ? " live" : ""}`}>
        ${this.renderRoleIcon(message.role)}
        <div class="bubble-content">
          <div class="role-label">${roleLabel(message.role)}</div>
          ${this.renderParts(message)}
        </div>
      </div>
    `;
  }

  private renderRoleIcon(role: string) {
    if (role === "user") return html`<div class="avatar user-avatar">U</div>`;
    if (role === "assistant") return html`<div class="avatar assistant-avatar">AI</div>`;
    if (role === "system") return html`<div class="avatar system-avatar">S</div>`;
    if (role === "bash") return html`<div class="avatar bash-avatar">$</div>`;
    return html`<div class="avatar tool-avatar">T</div>`;
  }

  private renderParts(message: ChatLine) {
    // Group consecutive toolExecution parts for grouped display
    const grouped = this.groupToolExecutions(message.parts);

    return grouped.map((group) => {
      if (group.kind === "timeline") {
        return html`<task-timeline class="part" .parts=${group.parts}></task-timeline>`;
      }
      if (group.kind === "group") {
        return html`<tool-call-group class="part" .parts=${group.parts}></tool-call-group>`;
      }
      // Single part
      const part = group.parts[0];
      if (part === undefined) return null;
      return this.renderSinglePart(part, message);
    });
  }

  private renderSinglePart(part: ChatPart, message: ChatLine) {
    if (part.type === "text" && message.role === "bash") {
      return html`<execution-log class="part" .stdout=${part.text}></execution-log>`;
    }
    if (part.type === "text") {
      return html`<formatted-text class="part" .text=${part.text}></formatted-text>`;
    }
    // Thinking content is NEVER shown — use compact shimmer node
    if (part.type === "thinking") {
      return html`<thinking-node class="part" .text=${part.text}></thinking-node>`;
    }
    if (part.type === "skillInvocation") {
      return html`
        <collapsible-section class="part" summary=${`[skill] ${part.name}`}>
          <small>${part.location}</small>
          <formatted-text .text=${part.content}></formatted-text>
        </collapsible-section>
      `;
    }
    if (part.type === "skillRead") {
      return html`<tool-call-node class="part" .aggregation=${{ skillRead: part }} .agentActive=${this.isLive}></tool-call-node>`;
    }
    if (part.type === "image") {
      return html`<img class="part chat-image" src=${`data:${part.mimeType};base64,${part.data}`} alt="attached image" loading="lazy" />`;
    }
    // Compact tool call — single line, expandable
    if (part.type === "toolCall") {
      return html`<tool-call-node class="part" .aggregation=${{ toolCall: part }}></tool-call-node>`;
    }
    if (part.type === "toolExecution") {
      return html`<tool-call-node class="part" .aggregation=${{ execution: part }}></tool-call-node>`;
    }
    // Compact tool result — single status line
    if (part.type === "toolResult") {
      return html`
        <div class="part tool-result-line ${part.isError ? "error" : "success"}">
          <span class="tool-result-status">${part.isError ? "✖" : "✓"}</span>
          <span class="tool-result-name">${part.toolName}</span>
          <span class="tool-result-summary">${part.isError ? "failed" : "done"}</span>
        </div>
      `;
    }
    return null;
  }

  private groupToolExecutions(parts: ChatPart[]): { kind: "timeline" | "group" | "single"; parts: ChatPart[] }[] {
    const result: { kind: "timeline" | "group" | "single"; parts: ChatPart[] }[] = [];
    let toolBuffer: ChatPart[] = [];

    const flushTools = () => {
      if (toolBuffer.length === 0) return;
      if (toolBuffer.length >= 3) {
        result.push({ kind: "timeline", parts: toolBuffer });
      } else if (toolBuffer.length > 1) {
        result.push({ kind: "group", parts: toolBuffer });
      } else {
        result.push({ kind: "single", parts: toolBuffer });
      }
      toolBuffer = [];
    };

    for (const part of parts) {
      if (part.type === "toolExecution" || part.type === "toolCall" || part.type === "toolResult") {
        toolBuffer.push(part);
      } else {
        flushTools();
        result.push({ kind: "single", parts: [part] });
      }
    }
    flushTools();
    return result;
  }

  static override styles = css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .bubble { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 8px; padding: 8px; border-radius: 0; border: 0; background: transparent; }
    .bubble.user { color: rgba(255, 255, 255, 0.85); }
    .bubble.assistant { background: transparent; }
    .bubble.system { background: var(--pi-danger-bg); }
    .bubble.bash { background: var(--pi-success-bg); }
    .bubble.tool { color: var(--pi-warning); }
    .bubble.skill { background: var(--pi-purple-surface); }
    .avatar { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; flex: 0 0 auto; margin-top: 2px; }
    .user-avatar { background: color-mix(in srgb, var(--pi-text) 8%, transparent); color: var(--pi-text-secondary); }
    .assistant-avatar { background: rgba(255,255,255,0.03); color: var(--pi-text-secondary); }
    .system-avatar { background: var(--pi-danger-bg); color: var(--pi-danger); }
    .bash-avatar { background: var(--pi-success-bg); color: var(--pi-success); font-family: ui-monospace, monospace; }
    .tool-avatar { background: var(--pi-warning-surface); color: var(--pi-warning); }
    .bubble-content { min-width: 0; display: grid; gap: 4px; }
    .role-label { display: none; }
    .part { max-width: 100%; min-width: 0; overflow: visible; }
    .part + .part { margin-top: 4px; }
    .tool-line { color: var(--pi-warning); font-size: 13px; }
    .summary { color: var(--pi-muted); margin-left: 6px; }
    .part:is(details) { border-top: 1px solid rgba(255,255,255,0.04); padding-top: 4px; }
    .skill-invocation { border: 1px solid var(--pi-border); border-radius: 8px; background: transparent; padding: 8px 10px; }
    .skill-invocation > summary { color: var(--pi-purple); }
    .skill-invocation > small { display: block; margin: 6px 0 0; color: var(--pi-muted); }
    .thinking-section { border-top: 1px solid rgba(255,255,255,0.04); padding-top: 8px; }
    .chat-image { display: block; max-width: 100%; max-height: 320px; margin: 4px 0 0; border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; object-fit: contain; }
    formatted-text.part { display: block; }
  `;
}

function roleLabel(role: string): string {
  if (role === "user") return "You";
  if (role === "assistant") return "Assistant";
  if (role === "system") return "System";
  if (role === "bash") return "Shell";
  if (role === "skill") return "Skill";
  return "Tool";
}
