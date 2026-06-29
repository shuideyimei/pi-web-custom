import type { ExtensionUIDialogOptions } from "@earendil-works/pi-coding-agent";
import { EXTENSION_OVERLAY_CLOSE_VALUE, EXTENSION_OVERLAY_KEY_PREFIX } from "../../shared/apiTypes.js";
import type { SessionEventHub } from "../realtime/sessionEventHub.js";

interface ComponentLike { render(width: number): string[]; handleInput?(data: string): void; dispose?(): void }
interface WebTui { width: number; height: number; requestRender: () => void }
interface WebTheme {
  fg: (name: string, text: string) => string;
  bold: (text: string) => string;
  getBashModeBorderColor: () => string;
  getThinkingBorderColor: (level: string) => string;
}
interface WebKeybindings { matches: () => boolean }
interface CustomOptions { overlay?: boolean; overlayOptions?: unknown; onHandle?: (handle: unknown) => void }
interface PendingDialog {
  resolve: (value: string | undefined) => void;
  handleInput?: (data: string) => void;
}

const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 28;

export class WebExtensionUIContext {
  private readonly pendingDialogs = new Map<string, PendingDialog>();
  private dialogIdSeq = 0;

  constructor(
    private readonly sessionId: string,
    private readonly events: SessionEventHub,
  ) {}

  notify(message: string, type: "info" | "warning" | "error" = "info"): void {
    this.events.publish(this.sessionId, {
      type: "command.output",
      level: type === "error" ? "error" : "info",
      message,
    });
  }

  select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined> {
    void opts;
    const requestId = this.nextDialogId();
    return new Promise((resolve) => {
      this.pendingDialogs.set(requestId, { resolve });
      this.events.publish(this.sessionId, {
        type: "extension.overlay",
        overlay: {
          requestId,
          title,
          body: options.map((option, index) => `${String(index + 1)}. ${option}`).join("\n"),
          status: "ready",
          closable: true,
        },
      });
    });
  }

  async confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean> {
    void opts;
    const value = await this.input(title, message);
    return value?.toLowerCase() === "yes" || value?.toLowerCase() === "y" || value === "true";
  }

  input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined> {
    void opts;
    const requestId = this.nextDialogId();
    return new Promise((resolve) => {
      this.pendingDialogs.set(requestId, { resolve });
      this.events.publish(this.sessionId, {
        type: "extension.overlay",
        overlay: {
          requestId,
          title,
          body: placeholder ?? "",
          status: "ready",
          closable: true,
        },
      });
    });
  }

  onTerminalInput(handler: (data: string) => { consume?: boolean; data?: string } | undefined): () => void {
    void handler;
    return () => {
      void handler;
      // Raw terminal input is not available in the browser UI.
    };
  }

  setStatus(key: string, text: string | undefined): void {
    void key;
    void text;
  }

  setWorkingMessage(message?: string): void {
    if (message !== undefined && message !== "") this.notify(message, "info");
  }

  setWorkingVisible(visible: boolean): void {
    void visible;
  }

  setWorkingIndicator(options?: { frames?: string[]; intervalMs?: number }): void {
    void options;
  }

  setHiddenThinkingLabel(label?: string): void {
    void label;
  }

  setWidget(key: string, content: string[] | ((tui: WebTui, theme: WebTheme) => ComponentLike) | undefined, options?: { placement?: "aboveEditor" | "belowEditor" }): void {
    void key;
    void content;
    void options;
  }

  setFooter(factory: ((tui: WebTui, theme: WebTheme, footerData: unknown) => ComponentLike) | undefined): void {
    void factory;
  }

  setHeader(factory: ((tui: WebTui, theme: WebTheme) => ComponentLike) | undefined): void {
    void factory;
  }

  setTitle(title: string): void {
    void title;
  }

  custom<T>(
    factory: (tui: WebTui, theme: WebTheme, keybindings: WebKeybindings, done: (result: T) => void) => ComponentLike | Promise<ComponentLike>,
    options?: CustomOptions,
  ): Promise<T | undefined> {
    const requestId = this.nextDialogId();
    const overlay = options?.overlay === true;
    let component: ComponentLike | undefined;
    let settled = false;

    return new Promise((resolve) => {
      const publishClose = (): void => {
        if (!overlay) return;
        this.events.publish(this.sessionId, { type: "extension.overlay.close", requestId });
      };
      const finish = (result: T | undefined): void => {
        if (settled) return;
        settled = true;
        this.pendingDialogs.delete(requestId);
        component?.dispose?.();
        publishClose();
        resolve(result);
      };
      const publishRender = (status: "working" | "ready"): void => {
        if (!overlay || component === undefined || settled) return;
        const lines = renderComponent(component);
        this.events.publish(this.sessionId, {
          type: "extension.overlay",
          overlay: {
            requestId,
            title: titleFromLines(lines, status),
            body: stripAnsi(lines.join("\n")).trimEnd(),
            status,
            closable: true,
          },
        });
      };

      const tui: WebTui = {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        requestRender: () => {
          publishRender(overlay ? "ready" : "working");
        },
      };

      if (overlay) {
        this.pendingDialogs.set(requestId, {
          resolve: () => {
            finish(undefined);
          },
          handleInput: (data) => {
            component?.handleInput?.(data);
            publishRender("ready");
          },
        });
      }

      Promise.resolve()
        .then(() => factory(tui, webTheme(), webKeybindings(), finish))
        .then((created) => {
          component = created;
          publishRender(overlay ? "ready" : "working");
          options?.onHandle?.({
            close: () => {
              finish(undefined);
            },
            requestRender: () => {
              publishRender(overlay ? "ready" : "working");
            },
          });
        })
        .catch((error: unknown) => {
          this.notify(`Extension UI failed: ${error instanceof Error ? error.message : String(error)}`, "error");
          finish(undefined);
        });
    });
  }

  pasteToEditor(text: string): void {
    void text;
  }

  setEditorText(text: string): void {
    void text;
  }

  getEditorText(): string {
    return "";
  }

  editor(title: string, prefill?: string): Promise<string | undefined> {
    return this.input(title, prefill);
  }

  addAutocompleteProvider(factory: (current: unknown) => unknown): void {
    void factory;
  }

  setEditorComponent(factory: ((tui: WebTui, theme: WebTheme, keybindings: WebKeybindings) => ComponentLike) | undefined): void {
    void factory;
  }

  getEditorComponent(): ((tui: WebTui, theme: WebTheme, keybindings: WebKeybindings) => ComponentLike) | undefined {
    return undefined;
  }

  get theme(): WebTheme {
    return webTheme();
  }

  getAllThemes(): { name: string; path: string | undefined }[] {
    return [];
  }

  getTheme(name: string): WebTheme | undefined {
    void name;
    return undefined;
  }

  setTheme(theme: string | WebTheme): { success: boolean; error?: string } {
    void theme;
    return { success: false, error: "Theme switching is not supported in the web UI" };
  }

  getToolsExpanded(): boolean {
    return false;
  }

  setToolsExpanded(expanded: boolean): void {
    void expanded;
  }

  respondToDialog(requestId: string, value: string | undefined): boolean {
    const pending = this.pendingDialogs.get(requestId);
    if (pending === undefined) return false;
    const input = decodeOverlayInput(value);
    if (input !== undefined) {
      pending.handleInput?.(input);
      return true;
    }
    this.pendingDialogs.delete(requestId);
    this.events.publish(this.sessionId, { type: "extension.overlay.close", requestId });
    pending.resolve(value === undefined || value === "" || value === EXTENSION_OVERLAY_CLOSE_VALUE ? undefined : value);
    return true;
  }

  private nextDialogId(): string {
    this.dialogIdSeq += 1;
    return `web-extension-${this.sessionId}-${String(this.dialogIdSeq)}`;
  }
}

function renderComponent(component: ComponentLike): string[] {
  try {
    const lines = component.render(DEFAULT_WIDTH);
    return lines.length === 0 ? [""] : lines;
  } catch (error: unknown) {
    return [`Extension UI render failed: ${error instanceof Error ? error.message : String(error)}`];
  }
}

function titleFromLines(lines: readonly string[], status: "working" | "ready"): string {
  for (const line of lines.slice(0, 4)) {
    const text = stripAnsi(line).replace(/[╭╮╰╯│├┤─░█›]/g, " ").replace(/\s+/g, " ").trim();
    if (/[A-Za-z0-9]/.test(text)) return text.slice(0, 80);
  }
  return status === "working" ? "Extension working" : "Extension";
}

function webTheme(): WebTheme {
  return {
    fg: (name, text) => {
      void name;
      return text;
    },
    bold: (text) => text,
    getBashModeBorderColor: () => "",
    getThinkingBorderColor: (level) => {
      void level;
      return "";
    },
  };
}

function webKeybindings(): WebKeybindings {
  return { matches: () => false };
}

function stripAnsi(value: string): string {
  const escape = String.fromCharCode(27);
  return value.replace(new RegExp(`${escape}\\[[0-?]*[ -/]*[@-~]`, "g"), "");
}

function decodeOverlayInput(value: string | undefined): string | undefined {
  if (value?.startsWith(EXTENSION_OVERLAY_KEY_PREFIX) !== true) return undefined;
  try {
    return decodeURIComponent(value.slice(EXTENSION_OVERLAY_KEY_PREFIX.length));
  } catch {
    return "";
  }
}
