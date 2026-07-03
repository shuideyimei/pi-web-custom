/**
 * Role Icons — Minimalist SVG icons inspired by Codex design language.
 *
 * Design principles:
 *   - Geometric simplicity: circles, lines, dots
 *   - Monochrome with subtle tinting via CSS color
 *   - No fills, only strokes or single accent dots
 *   - Consistent 20×20 viewBox, 1.5px stroke weight
 *   - Animations are subtle: slow pulses, gentle fades
 */

import { html, css, type TemplateResult, type CSSResult } from "lit";

export type ChatRole = "user" | "assistant" | "system" | "notice" | "bash" | "skill" | "tool";

/** Render an SVG role icon (20×20 viewBox) */
export function renderRoleIcon(role: ChatRole): TemplateResult {
  switch (role) {
    case "user":      return userIcon;
    case "assistant": return assistantIcon;
    case "system":    return systemIcon;
    case "notice":    return noticeIcon;
    case "bash":      return bashIcon;
    case "skill":     return skillIcon;
    case "tool":      return toolIcon;
    default:          return toolIcon;
  }
}

/* ─── SVG Icons (20×20 viewBox) ───────────────────────────────────── */

/** User: single circle + arc — human silhouette reduced to geometry */
const userIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/>
    <path d="M4 16c0-3 3-5 6-5s6 2 6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`;

/** Assistant: concentric circles — signal / ripple / intelligence */
const assistantIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="2.5" fill="currentColor" class="ri-dot"/>
    <circle cx="10" cy="10" r="5" stroke="currentColor" stroke-width="1.2" opacity=".5" class="ri-ring"/>
    <circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width=".8" opacity=".25" class="ri-outer"/>
  </svg>`;

/** System: centered dot with radiating warning marks */
const systemIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="1.8" fill="currentColor"/>
    <path d="M10 4v3M10 13v3M4 10h3M13 10h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity=".6"/>
  </svg>`;

/** Notice: low-key information circle */
const noticeIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="6" stroke="currentColor" stroke-width="1.3" opacity=".75"/>
    <path d="M10 9v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="10" cy="6.6" r=".9" fill="currentColor"/>
  </svg>`;

/** Bash: prompt symbol >_ reduced to two strokes */
const bashIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M6 7l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" class="ri-cursor"/>
  </svg>`;

/** Skill: diamond with center dot — precision / focus */
const skillIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 3l6.5 7-6.5 7-6.5-7z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
  </svg>`;

/** Tool: simple wrench / spanner outline */
const toolIcon: TemplateResult = html`
  <svg class="ri" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="3" stroke="currentColor" stroke-width="1.5"/>
    <path d="M9.5 9.5l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M13 13l2.5-1.5-1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

/* ─── Shared CSS ───────────────────────────────────────────────────── */

export const roleIconStyles: CSSResult = css`
  /* ════════════════════════════════════════════════════════════════
     Role Icons — Codex-inspired minimalism
     ════════════════════════════════════════════════════════════════ */

  .ri {
    display: block;
    width: 18px;
    height: 18px;
    color: currentColor;
  }

  /* ── Container: invisible hit-area, no background plate ── */
  .role-icon {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    transition: background .15s ease;
  }

  /* ── User: cyan accent ── */
  .msg.user .role-icon { color: var(--pi-accent); }
  .msg.user .role-icon:hover { background: color-mix(in srgb, var(--pi-running) 8%, transparent); }

  /* ── Assistant: neutral with slow ripple ── */
  .msg.assistant .role-icon { color: var(--pi-text-secondary); }
  .msg.assistant .role-icon:hover { background: var(--pi-hover-overlay); }
  .msg.assistant .ri-ring {
    animation: ri-ripple 3s ease-in-out infinite;
    transform-origin: center;
  }
  .msg.assistant .ri-outer {
    animation: ri-ripple 3s ease-in-out infinite .6s;
    transform-origin: center;
  }

  /* ── System: danger red ── */
  .msg.system .role-icon { color: var(--pi-danger); }
  .msg.system .role-icon:hover { background: color-mix(in srgb, var(--pi-danger) 6%, transparent); }

  /* ── Notice: muted information ── */
  .msg.notice .role-icon { color: var(--pi-muted); }
  .msg.notice .role-icon:hover { background: var(--pi-hover-overlay); }

  /* ── Bash: mint green with cursor blink ── */
  .msg.bash .role-icon { color: var(--pi-success); }
  .msg.bash .role-icon:hover { background: color-mix(in srgb, var(--pi-success) 6%, transparent); }
  .msg.bash .ri-cursor {
    animation: ri-blink 1.4s steps(1, end) infinite;
  }

  /* ── Skill: purple ── */
  .msg.skill .role-icon { color: var(--pi-purple); }
  .msg.skill .role-icon:hover { background: color-mix(in srgb, var(--pi-purple) 6%, transparent); }

  /* ── Tool: amber ── */
  .msg.tool .role-icon { color: var(--pi-warning); }
  .msg.tool .role-icon:hover { background: color-mix(in srgb, var(--pi-warning) 6%, transparent); }

  /* ═══ Keyframes — subtle only ═══ */
  @keyframes ri-ripple {
    0%, 100% { transform: scale(1); opacity: .5; }
    50% { transform: scale(1.15); opacity: .2; }
  }
  @keyframes ri-blink {
    0%, 100% { opacity: 1; }
    50% { opacity: .25; }
  }
`;
