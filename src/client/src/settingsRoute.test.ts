import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSettingsSection, readSettingsSection, writeSettingsSection } from "./settingsRoute";

const originalWindow = globalThis.window;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "window", { value: originalWindow, configurable: true });
});

function installWindow(href: string): { pushed: string[]; replaced: string[] } {
  const url = new URL(href);
  const pushed: string[] = [];
  const replaced: string[] = [];
  const fakeWindow = {
    location: {
      href: url.href,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    },
    history: {
      pushState: vi.fn((_state: object, _title: string, next: URL | string) => {
        pushed.push(String(next));
      }),
      replaceState: vi.fn((_state: object, _title: string, next: URL | string) => {
        replaced.push(String(next));
      }),
    },
  };
  Object.defineProperty(globalThis, "window", { value: fakeWindow, configurable: true });
  return { pushed, replaced };
}

describe("settings route helpers", () => {
  it("parses supported settings deep links and aliases", () => {
    expect(parseSettingsSection("appearance")).toBe("appearance");
    expect(parseSettingsSection("theme")).toBe("appearance");
    expect(parseSettingsSection("chat")).toBe("chat");
    expect(parseSettingsSection("notifications")).toBe("notifications");
    expect(parseSettingsSection("general")).toBe("general");
    expect(parseSettingsSection("behavior")).toBe("behavior");
    expect(parseSettingsSection("sessiond")).toBe("sessiond");
    expect(parseSettingsSection("sessions")).toBe("sessiond");
    expect(parseSettingsSection("snippets")).toBe("snippets");
    expect(parseSettingsSection("agents")).toBe("agents");
    expect(parseSettingsSection("marketplace")).toBe("marketplace");
    expect(parseSettingsSection("packages")).toBe("marketplace");
    expect(parseSettingsSection("mcp")).toBe("mcp");
    expect(parseSettingsSection("plugins")).toBe("plugins");
    expect(parseSettingsSection("providers")).toBe("providers");
    expect(parseSettingsSection("usage")).toBe("usage");
    expect(parseSettingsSection("skills")).toBe("skills");
    expect(parseSettingsSection("skills-catalog")).toBe("skills-catalog");
    expect(parseSettingsSection("shortcuts")).toBe("shortcuts");
    expect(parseSettingsSection("commands")).toBe("shortcuts");
    expect(parseSettingsSection("keyboard")).toBe("shortcuts");
    expect(parseSettingsSection("unknown")).toBeUndefined();
  });

  it("reads the settings section from the current URL", () => {
    installWindow("http://localhost/app?project=p1&settings=shortcuts");

    expect(readSettingsSection()).toBe("shortcuts");
  });

  it("writes settings deep links while preserving other route fields", () => {
    const { pushed } = installWindow("http://localhost/app?project=p1#bottom");

    writeSettingsSection("appearance");

    expect(pushed).toEqual(["http://localhost/app?project=p1&settings=appearance#bottom"]);
  });

  it("removes settings deep links with replace when closing", () => {
    const { replaced } = installWindow("http://localhost/app?project=p1&settings=general#bottom");

    writeSettingsSection(undefined, { replace: true });

    expect(replaced).toEqual(["http://localhost/app?project=p1#bottom"]);
  });
});
