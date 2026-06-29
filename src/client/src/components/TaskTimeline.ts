import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ChatPart } from "./shared";
import { quantumBeaconStyles } from "./quantumBeacon";

interface TimelineStep {
  label: string;
  icon: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  parts: ChatPart[];
}

@customElement("task-timeline")
export class TaskTimeline extends LitElement {
  @property({ attribute: false }) parts: ChatPart[] = [];

  override render() {
    const steps = this.buildSteps();
    if (steps.length === 0) return null;

    return html`
      <div class="timeline" role="list" aria-label="Task progress">
        ${steps.map((step) => html`
          <div class=${`step ${step.status}`} role="listitem">
            <div class="step-content">
              <div class="step-header">
                <strong class="step-label">${step.label}</strong>
                <span class=${`step-status ${step.status}`}>${stepStatusLabel(step.status)}</span>
              </div>
              ${step.parts.length > 0 ? html`
                <div class="step-details">
                  ${step.parts.map((part) => this.renderPartSummary(part))}
                </div>
              ` : null}
            </div>
          </div>
        `)}
      </div>
    `;
  }

  private renderPartSummary(part: ChatPart) {
    if (part.type === "toolExecution") {
      return html`
        <div class=${`tool-summary ${part.status}`}>
          <span class="tool-name">${part.toolName}</span>
          ${part.summary === "" ? "" : html`<span class="tool-desc">${part.summary}</span>`}
        </div>
  `;
    }
    if (part.type === "toolCall") {
      return html`
        <div class="tool-summary pending">
          <span class="tool-name">${part.toolName}</span>
          ${part.summary === "" ? "" : html`<span class="tool-desc">${part.summary}</span>`}
        </div>
  `;
    }
    if (part.type === "toolResult") {
      return html`
        <div class=${`tool-summary ${part.isError ? "error" : "success"}`}>
          <span class="tool-name">${part.toolName} result</span>
        </div>
  `;
    }
    return null;
  }

  private buildSteps(): TimelineStep[] {
    const steps: TimelineStep[] = [];
    let currentStep: TimelineStep | undefined;

    for (const part of this.parts) {
      const phase = this.inferPhase(part);
      if (phase !== undefined && (currentStep?.label !== phase.label)) {
        currentStep = { label: phase.label, icon: phase.icon, status: "pending", parts: [] };
        steps.push(currentStep);
      }
      if (currentStep === undefined) {
        currentStep = { label: "Processing", icon: "⚙", status: "pending", parts: [] };
        steps.push(currentStep);
      }
      currentStep.parts.push(part);
      currentStep.status = this.aggregateStatus(currentStep.parts);
    }

    return steps;
  }

  private inferPhase(part: ChatPart): { label: string; icon: string } | undefined {
    if (part.type === "toolCall" || part.type === "toolExecution") {
      const name = part.toolName;
      if (name === "read" || name === "bash" && part.type === "toolCall") return { label: "Analyzing", icon: "🔍" };
      if (name === "edit" || name === "write") return { label: "Modifying files", icon: "✏️" };
      if (name === "bash") return { label: "Executing", icon: "⚡" };
      if (name === "web_search" || name === "fetch_content") return { label: "Researching", icon: "🌐" };
      if (name === "subagent") return { label: "Delegating", icon: "🤖" };
      if (name === "glob" || name === "grep" || name === "rg") return { label: "Searching", icon: "🔍" };
      return { label: `Running ${name}`, icon: "⚙" };
    }
    if (part.type === "toolResult") {
      return undefined; // Stay in current step
    }
    return undefined;
  }

  private aggregateStatus(parts: ChatPart[]): TimelineStep["status"] {
    const execParts = parts.filter((p): p is Extract<ChatPart, { type: "toolExecution" }> => p.type === "toolExecution");
    if (execParts.some(p => p.status === "running")) return "running";
    if (execParts.some(p => p.status === "pending")) return "pending";
    if (execParts.some(p => p.status === "error")) return "error";
    if (execParts.length > 0 && execParts.every(p => p.status === "success")) return "success";
    return "pending";
  }

  static override styles = [quantumBeaconStyles, css`
    :host { display: block; width: 100%; max-width: 100%; min-width: 0; }
    .timeline { display: grid; gap: 0; width: 100%; }
    .step { display: grid; gap: 8px; min-width: 0; }
    .step-content { padding-bottom: 4px; min-width: 0; }
    .step-header { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .step-label { color: var(--pi-text); font-size: 13px; }
    .step-status { font-size: 11px; text-transform: uppercase; letter-spacing: .03em; }
    .step-status.pending { color: var(--pi-muted); }
    .step-status.running { color: var(--pi-running); }
    .step-status.success { color: var(--pi-success); }
    .step-status.error { color: var(--pi-danger); }
    .step-status.skipped { color: var(--pi-dim); }
    .step-details { display: grid; gap: 1px; margin-top: 2px; }
    .tool-summary { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--pi-muted); padding: 1px 0; }
    .tool-name { color: var(--pi-text-secondary); font-weight: 500; }
    .tool-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
  `];
}

function stepStatusLabel(status: TimelineStep["status"]): string {
  if (status === "success") return "done";
  if (status === "error") return "failed";
  if (status === "running") return "running";
  if (status === "skipped") return "skipped";
  return "pending";
}
