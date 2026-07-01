import { describe, expect, it } from "vitest";
import { CLASSIC_THEME_ID, DEFAULT_THEME_PREFERENCE, appThemeColorForScheme, findThemePairForTheme, resolveThemePreference } from "./theme";
import type { QualifiedContributionId, QualifiedThemeContribution, QualifiedThemePairContribution, ThemeColorScheme, ThemeTokens } from "./plugins/types";

const tokens = {
  "--pi-bg": "#000000",
  "--pi-surface": "#000000",
  "--pi-surface-hover": "#000000",
  "--pi-terminal-bg": "#000000",
  "--pi-terminal-text": "#000000",
  "--pi-border": "#000000",
  "--pi-border-muted": "#000000",
  "--pi-text": "#000000",
  "--pi-text-secondary": "#000000",
  "--pi-text-bright": "#000000",
  "--pi-muted": "#000000",
  "--pi-dim": "#000000",
  "--pi-accent": "#000000",
  "--pi-accent-border": "#000000",
  "--pi-selection-bg": "#000000",
  "--pi-success": "#000000",
  "--pi-success-border": "#000000",
  "--pi-success-bg": "#000000",
  "--pi-success-surface": "#000000",
  "--pi-success-ring": "#000000",
  "--pi-warning": "#000000",
  "--pi-warning-border": "#000000",
  "--pi-warning-surface": "#000000",
  "--pi-danger": "#000000",
  "--pi-purple": "#000000",
  "--pi-purple-border": "#000000",
  "--pi-purple-surface": "#000000",
  "--pi-overlay": "#000000",
  "--pi-shadow-soft": "#000000",
  "--pi-shadow": "#000000",
  "--pi-shadow-strong": "#000000",
  "--pi-bg-overlay-soft": "#000000",
  "--pi-bg-overlay": "#000000",
  "--pi-success-bg-overlay": "#000000",
  "--pi-terminal-selection": "#000000",
  "--pi-accent-ref": "#000000",
  "--pi-accent-ref-bg": "#000000",
  "--pi-running": "#000000",
  "--pi-running-bg": "#000000",
  "--pi-glass-bg": "#000000",
  "--pi-glass-border": "#000000",
  "--pi-glass-highlight": "#000000",
  "--pi-glass-blur": "blur(20px)",
  "--pi-solid-bg": "#000000",
  "--pi-solid-bg-strong": "#000000",
  "--pi-danger-bg": "#000000",
  "--pi-diff-removed-border": "#000000",
  "--pi-info": "#000000",
  "--pi-info-bg": "#000000",
  "--pi-info-border": "#000000",
  "--pi-diff-removed-bg": "#000000",
  "--pi-diff-added-border": "#000000",
  "--pi-diff-added-bg": "#000000",
  "--pi-code-bg": "#000000",
  "--pi-user-message-text": "#000000",
  "--pi-user-message-bg": "#000000",
  "--pi-main-bg": "#000000",
  "--pi-backdrop": "#000000",
  "--pi-inset-highlight": "#000000",
  "--pi-elevated-border": "#000000",
  "--pi-elevated-bg": "#000000",
  "--pi-hover-overlay-strong": "#000000",
  "--pi-hover-overlay": "#000000",
  "--pi-panel-border": "#000000",
  "--pi-panel-bg": "#000000",
} satisfies ThemeTokens;

const themes = [
  theme("pi-web-dark", "PI WEB Dark", "dark"),
  theme("pi-web-light", "PI WEB Light", "light"),
  theme("ayu-mirage", "Ayu Mirage", "dark"),
  theme("ayu-dark", "Ayu Dark", "dark"),
  theme("tokyo-night", "Tokyo Night", "dark"),
  theme("nord", "Nord", "dark"),
  theme("dracula", "Dracula", "dark"),
  theme("classic", "PI WEB Classic", "dark"),
];

const themePairs: QualifiedThemePairContribution[] = [
  {
    id: "themes:pi-web",
    pluginId: "themes",
    localId: "pi-web",
    name: "PI WEB",
    light: "themes:pi-web-light",
    dark: "themes:pi-web-dark",
  },
];

describe("resolveThemePreference", () => {
  it("resolves the default auto preference to the dark member when the system is dark", () => {
    expect(resolveThemePreference({ themes, themePairs, preference: DEFAULT_THEME_PREFERENCE, prefersLight: false }).activeTheme?.id)
      .toBe("themes:pi-web-dark");
  });

  it("resolves the default auto preference to the light member when the system is light", () => {
    expect(resolveThemePreference({ themes, themePairs, preference: DEFAULT_THEME_PREFERENCE, prefersLight: true }).activeTheme?.id)
      .toBe("themes:pi-web-light");
  });

  it("keeps an unpaired theme selected when auto is enabled", () => {
    const resolution = resolveThemePreference({
      themes,
      themePairs,
      preference: { themeId: CLASSIC_THEME_ID, auto: true },
      prefersLight: true,
    });

    expect(resolution.selectedTheme?.id).toBe("themes:classic");
    expect(resolution.activeTheme?.id).toBe("themes:classic");
    expect(resolution.selectedThemePair).toBeUndefined();
  });

  it("falls back to Classic when the selected theme does not exist", () => {
    const resolution = resolveThemePreference({
      themes,
      themePairs,
      preference: { themeId: "plugin:missing", auto: false },
      prefersLight: true,
    });

    expect(resolution.selectedTheme?.id).toBe("themes:classic");
    expect(resolution.activeTheme?.id).toBe("themes:classic");
  });

  it("does not overwrite a missing selected theme preference in the resolution result", () => {
    const missingThemeId: QualifiedContributionId = "plugin:missing";
    const resolution = resolveThemePreference({
      themes,
      themePairs,
      preference: { themeId: missingThemeId, auto: true },
      prefersLight: false,
    });

    expect(resolution.selectedTheme?.id).toBe("themes:classic");
    expect(missingThemeId).toBe("plugin:missing");
  });

  it("can look up a pair from either member theme", () => {
    expect(findThemePairForTheme(themePairs, "themes:pi-web-light")?.id).toBe("themes:pi-web");
    expect(findThemePairForTheme(themePairs, "themes:pi-web-dark")?.id).toBe("themes:pi-web");
  });
});

describe("appThemeColorForScheme", () => {
  it("uses a light installed-app frame for light themes", () => {
    expect(appThemeColorForScheme("light")).toBe("#f7f9fc");
  });

  it("uses a dark installed-app frame for dark themes", () => {
    expect(appThemeColorForScheme("dark")).toBe("#090d14");
  });
});

function theme(localId: string, name: string, colorScheme: ThemeColorScheme): QualifiedThemeContribution {
  return {
    id: `themes:${localId}`,
    pluginId: "themes",
    localId,
    name,
    colorScheme,
    tokens,
  };
}
