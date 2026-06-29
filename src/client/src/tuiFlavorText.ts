const TUI_FLAVOR_TEXT_PATTERNS = [
  /yeh\s+dukh\s+kaahe\s+khatam\s+nahi\s+hota/i,
  /pre-buffing\s+with\s+logs\s+and\s+false\s+confidence/i,
  /enrage\s+timer\s+active/i,
  /casting\s+npm\s+install/i,
  /summoning\s+stack\s+traces\s+from\s+the\s+8th\s+dimension/i,
  /segfault\s*\(\s*core\s+dumped\s+emotionally\s*\)/i,
] as const;

const TUI_FLAVOR_KEYWORDS = /\b(segfault|core dumped|emotionally|enrage|pre-?buff|false confidence|summon(?:ing)?|casting|8th dimension|dukh|stack traces?|aggro|crit|debuff|nerf|loot|boss|goblin|gremlin|ritual|oracle|void|eldritch)\b/i;

export function stripTuiFlavorText(text: string): string {
  return stripTuiFlavorTextPreservingWhitespace(text).trim();
}

export function stripTuiFlavorTextPreservingWhitespace(text: string): string {
  return text
    .split("\n")
    .filter((line) => !isTuiFlavorLine(line))
    .join("\n");
}

export function stripAssistantEchoedPrompt(text: string, userPrompt: string | undefined): string {
  const normalizedPrompt = normalizeComparableLine(userPrompt ?? "");
  if (normalizedPrompt === "") return text.trim();
  return text
    .split("\n")
    .filter((line) => normalizeComparableLine(line) !== normalizedPrompt)
    .join("\n")
    .trim();
}

function isTuiFlavorLine(line: string): boolean {
  const normalized = line.trim();
  if (normalized === "") return false;
  if (TUI_FLAVOR_TEXT_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (normalized.length > 180) return false;
  if (TUI_FLAVOR_KEYWORDS.test(normalized)) return true;
  // TUI-only status quips are usually short standalone emoji/status lines.
  if (/^[\p{Extended_Pictographic}\p{So}\s]+[\w\s'’:,;.!?()-]+$/u.test(normalized) && /\.{3}$/.test(normalized)) return true;
  return false;
}

function normalizeComparableLine(text: string): string {
  return text.replace(/\s+/g, "").trim();
}
