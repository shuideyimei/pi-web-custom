import { describe, expect, it } from "vitest";
import { aggregateSubagentStatus, resultStatus, subagentResultOutput, summarizeSubagentArgs, summarizeSubagentDetails } from "./subagentDisplay";

describe("subagent display helpers", () => {
  it("summarizes subagent execution arguments", () => {
    expect(summarizeSubagentArgs({ agent: "reviewer", task: "Review the current diff for correctness." })).toBe("reviewer · Review the current diff for correctness.");
    expect(summarizeSubagentArgs({ tasks: [{ agent: "reviewer", count: 2 }, { agent: "oracle" }] })).toBe("parallel (3)");
    expect(summarizeSubagentArgs({ chain: [{ agent: "scout" }, { agent: "planner" }] })).toBe("chain (2)");
    expect(summarizeSubagentArgs({ action: "status", id: "abc123" })).toBe("status abc123");
  });

  it("aggregates running, failed, and completed details", () => {
    expect(aggregateSubagentStatus({ mode: "parallel", results: [{ agent: "a", exitCode: 0 }, { agent: "b", progress: { status: "running" } }] })).toBe("running");
    expect(aggregateSubagentStatus({ mode: "parallel", results: [{ agent: "a", exitCode: 0 }, { agent: "b", exitCode: 1 }] })).toBe("failed");
    expect(aggregateSubagentStatus({ mode: "single", results: [{ agent: "a", exitCode: 0 }] })).toBe("completed");
  });

  it("summarizes result counts", () => {
    expect(summarizeSubagentDetails({ mode: "chain", chainAgents: ["scout", "planner", "worker"], results: [{ agent: "scout", exitCode: 0 }] })).toBe("chain (1/3) · completed");
  });

  it("detects result statuses and output", () => {
    expect(resultStatus({ progress: { status: "running" } })).toBe("running");
    expect(resultStatus({ interrupted: true, exitCode: 0 })).toBe("paused");
    expect(resultStatus({ exitCode: 2 })).toBe("failed");
    expect(subagentResultOutput({ messages: [{ role: "assistant", content: [{ type: "text", text: "final answer" }] }] })).toBe("final answer");
  });
});
