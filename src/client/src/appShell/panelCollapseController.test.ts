import type { ReactiveController, ReactiveControllerHost } from "lit";
import { describe, expect, it } from "vitest";
import { PanelCollapseController, mainViewClass } from "./panelCollapseController";

class TestHost implements ReactiveControllerHost {
  updateCount = 0;
  readonly controllers: ReactiveController[] = [];
  readonly updateComplete = Promise.resolve(true);

  addController(controller: ReactiveController): void {
    this.controllers.push(controller);
  }

  removeController(controller: ReactiveController): void {
    const index = this.controllers.indexOf(controller);
    if (index >= 0) this.controllers.splice(index, 1);
  }

  requestUpdate(): void {
    this.updateCount += 1;
  }
}

describe("PanelCollapseController", () => {
  it("defaults the workspace panel to collapsed", () => {
    const controller = new PanelCollapseController(new TestHost());

    expect(controller.workspacePanelCollapsed).toBe(true);
    expect(controller.shellClass("chat")).toBe("shell chat-view workspace-panel-collapsed");
  });

  it("opens the workspace panel when toggled or expanded", () => {
    const host = new TestHost();
    const controller = new PanelCollapseController(host);

    controller.toggleWorkspacePanel();

    expect(controller.workspacePanelCollapsed).toBe(false);
    expect(host.updateCount).toBe(1);

    controller.collapseWorkspacePanel();
    controller.expandWorkspacePanel();

    expect(controller.workspacePanelCollapsed).toBe(false);
    expect(host.updateCount).toBe(3);
  });

  it("maps main views to shell classes", () => {
    expect(mainViewClass("navigation")).toBe("navigation-view");
    expect(mainViewClass("chat")).toBe("chat-view");
    expect(mainViewClass("core:workspace.files")).toBe("workspace-view");
    expect(mainViewClass("home")).toBe("home-view");
  });
});
