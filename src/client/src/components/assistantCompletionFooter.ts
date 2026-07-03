import type { TimelineNode } from "./timelineAdapter";

interface AssistantCompletionFooterOptions {
  isSessionLive?: boolean | undefined;
  streamingNodeKey?: string | undefined;
}

interface FooterCandidate {
  key: string;
  hasTrailingTimelineContent: boolean;
}

export function assistantCompletionFooterKeys(nodes: readonly TimelineNode[], options: AssistantCompletionFooterOptions = {}): Set<string> {
  const footerKeys = new Set<string>();
  let candidate: FooterCandidate | undefined;

  for (const node of nodes) {
    if (node.type === "user") {
      addFooterKey(footerKeys, candidate, options);
      candidate = undefined;
      continue;
    }

    if (node.type === "assistant") {
      candidate = { key: node.key, hasTrailingTimelineContent: false };
      continue;
    }

    if (candidate !== undefined && isResponseTimelineContent(node)) candidate.hasTrailingTimelineContent = true;
  }

  addFooterKey(footerKeys, candidate, options);
  return footerKeys;
}

function addFooterKey(footerKeys: Set<string>, candidate: FooterCandidate | undefined, options: AssistantCompletionFooterOptions): void {
  if (candidate === undefined) return;
  if (candidate.hasTrailingTimelineContent) return;
  if (options.isSessionLive === true && candidate.key === options.streamingNodeKey) return;
  footerKeys.add(candidate.key);
}

function isResponseTimelineContent(node: TimelineNode): boolean {
  return node.type !== "meta" && node.type !== "notice";
}
