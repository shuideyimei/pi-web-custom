import type { SlashCommand } from "./api";
import type { SettingsSection } from "./settingsRoute";
import { parseSettingsSection } from "./settingsRoute";

export interface ParsedSlashCommandInput {
  raw: string;
  name: string;
  args: string;
}

export const WEB_SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: "model", description: "Select or set the current model", source: "builtin" },
  { name: "thinking", description: "Select or set the current thinking level", source: "builtin" },
  { name: "settings", description: "Open Web settings", source: "builtin" },
  { name: "marketplace", description: "Open Pi package marketplace and installer", source: "builtin" },
  { name: "hotkeys", description: "Open keyboard shortcut settings", source: "builtin" },
  { name: "login", description: "Configure provider authentication", source: "builtin" },
  { name: "logout", description: "Remove provider authentication", source: "builtin" },
  { name: "new", description: "Start a new session in the selected workspace", source: "builtin" },
  { name: "theme", description: "Select the Web color theme", source: "builtin" },
  { name: "terminal", description: "Open the selected workspace terminal", source: "builtin" },
  { name: "refresh", description: "Refresh Web app data", source: "builtin" },
];

const webSlashCommandNames = new Set(WEB_SLASH_COMMANDS.map((command) => command.name));

export function parseSlashCommandInput(text: string): ParsedSlashCommandInput | undefined {
  const trimmedStart = text.trimStart();
  const raw = trimmedStart.trimEnd();
  if (!raw.startsWith("/") || raw === "/") return undefined;
  const withoutSlash = raw.slice(1);
  const match = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(withoutSlash);
  if (match === null) return undefined;
  const rawName = match[1]?.trim() ?? "";
  if (rawName === "") return undefined;
  return {
    raw,
    name: rawName.toLowerCase(),
    args: match[2]?.trim() ?? "",
  };
}

export function isWebSlashCommandName(name: string): boolean {
  return webSlashCommandNames.has(name.toLowerCase());
}

export function slashCommandArguments(args: string): string[] {
  return args === "" ? [] : args.split(/\s+/u);
}

export function settingsSectionFromSlashArgument(value: string | undefined): SettingsSection | undefined {
  if (value === undefined || value === "") return "appearance";
  return parseSettingsSection(value);
}
