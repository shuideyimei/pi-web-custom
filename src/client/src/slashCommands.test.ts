import { describe, expect, it } from "vitest";
import { isWebSlashCommandName, parseSlashCommandInput, settingsSectionFromSlashArgument, slashCommandArguments, WEB_SLASH_COMMANDS } from "./slashCommands";

describe("slashCommands", () => {
  it("parses leading slash commands and arguments", () => {
    expect(parseSlashCommandInput("/model anthropic/claude")).toEqual({ raw: "/model anthropic/claude", name: "model", args: "anthropic/claude" });
    expect(parseSlashCommandInput("  /settings shortcuts  ")).toEqual({ raw: "/settings shortcuts", name: "settings", args: "shortcuts" });
    expect(parseSlashCommandInput("hello /model")).toBeUndefined();
    expect(parseSlashCommandInput("/")).toBeUndefined();
  });

  it("recognizes Web-owned slash command names", () => {
    expect(isWebSlashCommandName("model")).toBe(true);
    expect(isWebSlashCommandName("MODEL")).toBe(true);
    expect(isWebSlashCommandName("skill:planner")).toBe(false);
    expect(WEB_SLASH_COMMANDS.map((command) => command.name)).toContain("hotkeys");
    expect(WEB_SLASH_COMMANDS.map((command) => command.name)).toContain("marketplace");
  });

  it("splits simple slash command arguments", () => {
    expect(slashCommandArguments("")).toEqual([]);
    expect(slashCommandArguments("openai extra")).toEqual(["openai", "extra"]);
  });

  it("maps settings aliases to settings sections", () => {
    expect(settingsSectionFromSlashArgument(undefined)).toBe("general");
    expect(settingsSectionFromSlashArgument("hotkeys")).toBe("shortcuts");
    expect(settingsSectionFromSlashArgument("keybindings")).toBe("shortcuts");
    expect(settingsSectionFromSlashArgument("marketplace")).toBe("marketplace");
    expect(settingsSectionFromSlashArgument("packages")).toBe("marketplace");
    expect(settingsSectionFromSlashArgument("plugins")).toBe("plugins");
    expect(settingsSectionFromSlashArgument("unknown")).toBeUndefined();
  });
});
