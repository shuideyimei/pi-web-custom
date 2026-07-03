export type SettingsSection =
  | "appearance"
  | "chat"
  | "notifications"
  | "sessiond"
  | "snippets"
  | "agents"
  | "behavior"
  | "shortcuts"
  | "mcp"
  | "plugins"
  | "providers"
  | "usage"
  | "skills"
  | "skills-catalog"
  | "general"
  | "marketplace";

export function readSettingsSection(): SettingsSection | undefined {
  return parseSettingsSection(new URLSearchParams(window.location.search).get("settings"));
}

export function writeSettingsSection(section: SettingsSection | undefined, options?: { replace?: boolean | undefined }): void {
  const url = new URL(window.location.href);
  if (section === undefined) url.searchParams.delete("settings");
  else url.searchParams.set("settings", section);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (options?.replace === true) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}

export function parseSettingsSection(value: string | null): SettingsSection | undefined {
  if (value === "appearance" || value === "theme" || value === "themes") return "appearance";
  if (value === "chat" || value === "conversation" || value === "composer") return "chat";
  if (value === "notifications" || value === "notification") return "notifications";
  if (value === "sessiond" || value === "sessions" || value === "session") return "sessiond";
  if (value === "snippets" || value === "snippet" || value === "prompts") return "snippets";
  if (value === "agents" || value === "agent") return "agents";
  if (value === "behavior" || value === "behaviour") return "behavior";
  if (value === "general") return "general";
  if (value === "commands" || value === "shortcuts" || value === "keyboard" || value === "keyboard-shortcuts" || value === "hotkeys" || value === "keybindings" || value === "keys") return "shortcuts";
  if (value === "mcp") return "mcp";
  if (value === "plugins" || value === "extensions") return "plugins";
  if (value === "providers" || value === "provider" || value === "auth" || value === "authentication" || value === "login") return "providers";
  if (value === "usage" || value === "token-usage" || value === "tokens") return "usage";
  if (value === "skills" || value === "skill") return "skills";
  if (value === "skills-catalog" || value === "skill-catalog" || value === "catalog") return "skills-catalog";
  if (value === "marketplace" || value === "market" || value === "packages" || value === "install") return "marketplace";
  return undefined;
}
