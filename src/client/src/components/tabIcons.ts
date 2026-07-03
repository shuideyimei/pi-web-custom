import { html, svg, type TemplateResult } from "lit";

export type AppTabBuiltinIcon = "navigation" | "chat" | "summary" | "files" | "git" | "terminal" | "settings";
export type AppTabIcon = AppTabBuiltinIcon | TemplateResult;

export function renderAppTabIcon(icon: AppTabIcon): TemplateResult {
  if (typeof icon !== "string") return html`<span class="tab-custom-icon" aria-hidden="true">${icon}</span>`;
  return renderBuiltinTabIcon(icon);
}

export function renderBuiltinTabIcon(icon: AppTabBuiltinIcon): TemplateResult {
  switch (icon) {
    case "navigation":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="6" cy="7" r="1.5"></circle>
          <path d="M10 7h8"></path>
          <circle cx="6" cy="12" r="1.5"></circle>
          <path d="M10 12h8"></path>
          <circle cx="6" cy="17" r="1.5"></circle>
          <path d="M10 17h8"></path>
        </svg>
      `;
    case "chat":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 5h10a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3h-6l-5 4v-4H7a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"></path>
          <path d="M8 9h8"></path>
          <path d="M8 13h5"></path>
        </svg>
      `;
    case "summary":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 5h14"></path>
          <path d="M5 10h10"></path>
          <path d="M5 15h14"></path>
          <path d="M5 20h7"></path>
        </svg>
      `;
    case "files":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>
        </svg>
      `;
    case "git":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="6" cy="6" r="2"></circle>
          <circle cx="18" cy="6" r="2"></circle>
          <circle cx="12" cy="18" r="2"></circle>
          <path d="M8 6h6"></path>
          <path d="M6 8v2a6 6 0 0 0 6 6"></path>
          <path d="M18 8v2a6 6 0 0 1-6 6"></path>
        </svg>
      `;
    case "terminal":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="3" y="5" width="18" height="14" rx="2"></rect>
          <path d="m7 10 3 3-3 3"></path>
          <path d="M12 16h5"></path>
        </svg>
      `;
    case "settings":
      return svg`
        <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 0 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 0 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3h.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 0 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6.9h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"></path>
        </svg>
      `;
  }
}
