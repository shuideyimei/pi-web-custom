# Task for scout

梳理 /home/dev/code/pi-web 当前前端 Agent 工作台/非主 chat 页面结构，重点定位 src/client/src/components/PiWebApp.ts、SettingsPanel、WorkspacePanel、ProjectList、SessionList、CommandPicker 等相关文件的布局、样式模式和适合改造成 Cursor 风格的入口。只读，不修改文件。输出：关键文件、现有信息架构、建议的最小但大幅视觉改造方案、验证命令。用户要求：根据 /home/dev/code/cursor/cursor-ui-function-design-analysis.md 和同目录截图，除主 chat 页面外都大改并沿用 Cursor 设计。

---
**Output:**
Write your findings to exactly this path: /home/dev/code/pi-web/.pi-subagents/artifacts/outputs/734abb47-f4b6-435f-9af1-14b0141bca02/agent-workbench-recon.md
This path is authoritative for this run.
Ignore any other output filename or output path mentioned elsewhere, including output destinations in the base agent prompt, system prompt, or task instructions.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```