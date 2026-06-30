/**
 * Timeline Execution Stream — adapter layer.
 *
 * Converts the existing ChatLine/ChatGroup data model into a flat sequence
 * of TimelineNode entries that the TimelineLayout can render as a vertical
 * execution stream with status beacons on a 1px anchor axis.
 *
 * Design notes:
 *  - toolCall / toolExecution / toolResult parts that share the same
 *    toolCallId are merged into a single TimelineToolNode so the UI can
 *    show input, output, status, and error in one collapsible row.
 *  - Duration is surfaced only when the upstream data provides it; we never
 *    fabricate a value.
 *  - The adapter is a pure function — no side effects, no DOM, no state.
 */

import { stripAssistantEchoedPrompt, stripTuiFlavorText } from "../tuiFlavorText";
import type { ChatLine, ChatPart, ToolExecutionPart } from "./shared";

// ─── Status ───────────────────────────────────────────────────────────

export type TimelineNodeStatus =
  | "pending"
  | "running"
  | "success"
  | "error"
  | "idle";

// ─── Node types ───────────────────────────────────────────────────────

export type TimelineNodeType =
  | "user"        // User prompt
  | "assistant"   // AI prose / markdown
  | "tool"        // Tool call (aggregated call + execution + result)
  | "step"        // Codex-style step: thinking + tool calls grouped as one compact row
  | "error"       // System / error message
  | "bash"        // Shell output log
  | "thinking"    // Thinking section (standalone, not part of a step)
  | "skill"       // Skill invocation / read
  | "meta";       // Low-key metadata line (event group summary)

// ─── Tool aggregation ─────────────────────────────────────────────────

export interface ToolAggregation {
  toolCall?: Extract<ChatPart, { type: "toolCall" }>;
  execution?: ToolExecutionPart;
  result?: Extract<ChatPart, { type: "toolResult" }>;
  skillRead?: Extract<ChatPart, { type: "skillRead" }>;
}

// ─── Timeline node ────────────────────────────────────────────────────

export interface TimelineNode {
  type: TimelineNodeType;
  status: TimelineNodeStatus;
  /** Unique key for Lit diffing and scroll anchoring. */
  key: string;
  /** The ChatPart(s) that feed this node. */
  parts: ChatPart[];
  /** Aggregated tool data (only set when type === "tool"). */
  tool?: ToolAggregation;
  /** Step data: thinking part + aggregated tools (only set when type === "step"). */
  step?: StepData;
  /** Original message metadata (timestamp, model). */
  meta?: ChatLine["meta"];
  /** Compaction / branch_summary marker. */
  source?: ChatLine["source"];
}

// ─── Step data (thinking + tool calls grouped) ────────────────────────

export interface StepData {
  /** The thinking part, if present. */
  thinking: Extract<ChatPart, { type: "thinking" }> | undefined;
  /** Text parts that appeared between thinking and tools (e.g. "Let me check those files"). */
  textParts: Extract<ChatPart, { type: "text" }>[];
  /** Aggregated tool calls within this step. */
  tools: ToolAggregation[];
  /** Bash outputs within this step. */
  bashOutputs: string[];
}

// ─── Adapter ──────────────────────────────────────────────────────────

/**
 * Convert a flat ChatLine array into a TimelineNode sequence.
 *
 * @param messages  The raw chat lines from the session transcript.
 * @param offset   Index offset (messageStart) for generating stable keys.
 */
export function buildTimelineNodes(
  messages: readonly ChatLine[],
  offset = 0,
): TimelineNode[] {
  const nodes: TimelineNode[] = [];
  let toolBuffer = new Map<string, ToolAggregation>();
  let syntheticToolIndex = 0;
  let stepThinking: Extract<ChatPart, { type: "thinking" }> | undefined;
  let stepTools: ToolAggregation[] = [];
  let stepBashOutputs: string[] = [];
  let stepIndex = 0;
  let latestUserPrompt: string | undefined;

  const resetStep = () => {
    stepThinking = undefined;
    stepTools = [];
    stepBashOutputs = [];
  };

  const hasOpenStep = () => stepThinking !== undefined || stepTools.length > 0 || stepBashOutputs.length > 0;

  const makeStepNode = (
    keyPrefix: string,
    thinking: Extract<ChatPart, { type: "thinking" }> | undefined,
    tools: ToolAggregation[],
    bashOutputs: string[],
    meta: ChatLine["meta"] | undefined,
  ): TimelineNode => {
    const parts: ChatPart[] = [];
    if (thinking !== undefined) parts.push(thinking);
    for (const agg of tools) {
      if (agg.toolCall !== undefined) parts.push(agg.toolCall);
      if (agg.execution !== undefined) parts.push(agg.execution);
      if (agg.result !== undefined) parts.push(agg.result);
      if (agg.skillRead !== undefined) parts.push(agg.skillRead);
    }
    return {
      type: "step",
      status: stepStatus(thinking, tools, bashOutputs),
      key: `${keyPrefix}:${String(stepIndex++)}`,
      parts,
      step: { thinking, textParts: [], tools, bashOutputs },
      meta,
    };
  };

  const flushOpenStep = (keyPrefix: string, meta: ChatLine["meta"] | undefined) => {
    if (!hasOpenStep()) return;
    nodes.push(makeStepNode(keyPrefix, stepThinking, stepTools, stepBashOutputs, meta));
    resetStep();
  };

  const flushToolBuffer = (keyPrefix: string, meta: ChatLine["meta"] | undefined) => {
    if (toolBuffer.size === 0) return;
    const aggs = [...toolBuffer.values()];
    if (stepThinking !== undefined || stepBashOutputs.length > 0 || stepTools.length > 0) {
      stepTools.push(...aggs);
    } else {
      nodes.push(makeStepNode(keyPrefix, undefined, aggs, [], meta));
    }
    toolBuffer = new Map<string, ToolAggregation>();
    syntheticToolIndex = 0;
  };

  let lineIndex = 0;
  for (const message of messages) {
    const absIndex = offset + lineIndex;
    const absIndexKey = String(absIndex);
    lineIndex++;

    if (message.source === "compaction" || message.source === "branch_summary") {
      flushToolBuffer(`tg:${absIndexKey}`, message.meta);
      flushOpenStep(`step:${absIndexKey}`, message.meta);
      nodes.push({
        type: "meta",
        status: "idle",
        key: `m:${absIndexKey}`,
        parts: message.parts,
        meta: message.meta,
        source: message.source,
      });
      continue;
    }

    let partIndex = 0;
    for (const part of message.parts) {
      const partKey = `${absIndexKey}:${String(partIndex++)}`;
      switch (part.type) {
        case "toolCall":
        case "toolExecution":
        case "toolResult": {
          const id = part.toolCallId ?? `__no_id_${String(syntheticToolIndex++)}`;
          const existing = toolBuffer.get(id) ?? {};
          if (part.type === "toolCall") existing.toolCall = part;
          if (part.type === "toolExecution") existing.execution = part;
          if (part.type === "toolResult") existing.result = part;
          toolBuffer.set(id, existing);
          break;
        }

        case "skillRead": {
          const id = part.toolCallId ?? `__skill_${String(syntheticToolIndex++)}`;
          const existing = toolBuffer.get(id) ?? {};
          existing.skillRead = part;
          toolBuffer.set(id, existing);
          break;
        }

        case "thinking": {
          flushToolBuffer(`tg:${partKey}`, message.meta);
          flushOpenStep(`step:${partKey}`, message.meta);
          stepThinking = part;
          break;
        }

        case "text": {
          flushToolBuffer(`tg:${partKey}`, message.meta);
          if (message.role === "user") {
            flushOpenStep(`step:${partKey}`, message.meta);
            latestUserPrompt = appendPromptText(latestUserPrompt, part.text);
            nodes.push({ type: "user", status: "idle", key: `u:${partKey}`, parts: [part], meta: message.meta });
          } else if (message.role === "assistant") {
            flushOpenStep(`step:${partKey}`, message.meta);
            const assistantPart = sanitizeAssistantTextPart(part, latestUserPrompt);
            if (assistantPart !== undefined) nodes.push({ type: "assistant", status: "idle", key: `a:${partKey}`, parts: [assistantPart], meta: message.meta });
          } else if (message.role === "bash") {
            if (hasOpenStep()) {
              stepBashOutputs.push(part.text);
            } else {
              nodes.push(makeStepNode(`bash:${partKey}`, undefined, [], [part.text], message.meta));
            }
          } else if (message.role === "system") {
            flushOpenStep(`step:${partKey}`, message.meta);
            nodes.push({ type: "error", status: "error", key: `s:${partKey}`, parts: [part], meta: message.meta });
          } else {
            flushOpenStep(`step:${partKey}`, message.meta);
            const assistantPart = sanitizeAssistantTextPart(part, latestUserPrompt);
            if (assistantPart !== undefined) nodes.push({ type: "assistant", status: "idle", key: `x:${partKey}`, parts: [assistantPart], meta: message.meta });
          }
          break;
        }

        case "skillInvocation":
          flushToolBuffer(`tg:${partKey}`, message.meta);
          flushOpenStep(`step:${partKey}`, message.meta);
          nodes.push({ type: "skill", status: "idle", key: `sk:${partKey}`, parts: [part], meta: message.meta });
          break;

        case "image":
          flushToolBuffer(`tg:${partKey}`, message.meta);
          flushOpenStep(`step:${partKey}`, message.meta);
          nodes.push({ type: "assistant", status: "idle", key: `img:${partKey}`, parts: [part], meta: message.meta });
          break;

        case "empty":
          break;
      }
    }
  }

  flushToolBuffer(`tg:${String(offset + lineIndex)}`, undefined);
  flushOpenStep(`step:${String(offset + lineIndex)}`, undefined);
  return mergeAdjacentStepNodes(nodes);
}

function sanitizeAssistantTextPart(part: Extract<ChatPart, { type: "text" }>, userPrompt: string | undefined): Extract<ChatPart, { type: "text" }> | undefined {
  const withoutFlavor = stripTuiFlavorText(part.text);
  const text = stripAssistantEchoedPrompt(withoutFlavor, userPrompt);
  if (text === "") return undefined;
  return { ...part, text };
}

function appendPromptText(current: string | undefined, text: string): string {
  if (current === undefined || current === "") return text;
  return `${current}\n${text}`;
}

function mergeAdjacentStepNodes(nodes: TimelineNode[]): TimelineNode[] {
  const merged: TimelineNode[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (previous?.type === "step" && previous.step !== undefined && node.type === "step" && node.step !== undefined) {
      const thinking = previous.step.thinking ?? node.step.thinking;
      const textParts = [...previous.step.textParts, ...node.step.textParts];
      const tools = [...previous.step.tools, ...node.step.tools];
      const bashOutputs = [...previous.step.bashOutputs, ...node.step.bashOutputs];
      const parts = [...previous.parts, ...node.parts];
      previous.parts = parts;
      previous.status = stepStatus(thinking, tools, bashOutputs);
      previous.step = { thinking, textParts, tools, bashOutputs };
      continue;
    }
    merged.push(node);
  }
  return merged;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function stepStatus(
  thinking: Extract<ChatPart, { type: "thinking" }> | undefined,
  tools: ToolAggregation[],
  bashOutputs: readonly string[] = [],
): TimelineNodeStatus {
  // If we only have thinking/bash and no tools yet, we're running
  if (tools.length === 0) return thinking !== undefined || bashOutputs.length > 0 ? "running" : "idle";
  // If any tool is still running/pending, the step is running
  for (const agg of tools) {
    const s = toolAggregationStatus(agg);
    if (s === "running" || s === "pending") return "running";
  }
  // If any tool errored, the step has errors
  for (const agg of tools) {
    if (toolAggregationStatus(agg) === "error") return "error";
  }
  return "success";
}

function toolAggregationStatus(agg: ToolAggregation): TimelineNodeStatus {
  if (agg.execution !== undefined) {
    switch (agg.execution.status) {
      case "running":
        return "running";
      case "pending":
        return "pending";
      case "error":
        return "error";
      case "success":
        return "success";
    }
  }
  if (agg.result !== undefined) return agg.result.isError ? "error" : "success";
  if (agg.toolCall !== undefined) return "pending";
  if (agg.skillRead !== undefined) return "success";
  return "idle";
}
