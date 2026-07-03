import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { AppAction } from "../actions";
import type { PiWebConfigValues } from "../api";
import type { SettingsSection } from "../settingsRoute";
import "./SettingsPanel";

@customElement("settings-dialog")
export class SettingsDialog extends LitElement {
  @property({ attribute: false }) section: SettingsSection = "general";
  @property({ attribute: false }) actions: AppAction[] = [];
  @property({ attribute: false }) projectCwd: string | undefined;
  @property({ attribute: false }) onNavigate?: (section: SettingsSection) => void;
  @property({ attribute: false }) onClose?: () => void;
  @property({ attribute: false }) onConfigSaved?: (config: PiWebConfigValues) => void;
  @property({ attribute: false }) onOpenThemePicker?: () => void;
  @property({ attribute: false }) onConfigureAuth?: () => void;
  @property({ attribute: false }) onLogoutAuth?: () => void;
  @property({ attribute: false }) onOpenUsageDashboard?: () => void;

  override render(): TemplateResult {
    return html`
      <div class="backdrop" @mousedown=${() => this.onClose?.()}>
        <settings-panel
          presentation="dialog"
          role="dialog"
          aria-modal="true"
          .section=${this.section}
          .actions=${this.actions}
          .projectCwd=${this.projectCwd}
          .onNavigate=${this.onNavigate}
          .onClose=${this.onClose}
          .onConfigSaved=${this.onConfigSaved}
          .onOpenThemePicker=${this.onOpenThemePicker}
          .onConfigureAuth=${this.onConfigureAuth}
          .onLogoutAuth=${this.onLogoutAuth}
          .onOpenUsageDashboard=${this.onOpenUsageDashboard}
          @mousedown=${(event: MouseEvent) => { event.stopPropagation(); }}
        ></settings-panel>
      </div>
    `;
  }

  static override styles = css`
    :host { position: fixed; inset: 0; z-index: 30; }
    .backdrop { box-sizing: border-box; width: 100%; height: 100dvh; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); background: var(--pi-backdrop); backdrop-filter: blur(18px) saturate(115%); -webkit-backdrop-filter: blur(18px) saturate(115%); overflow: hidden; }
    @media (max-width: 760px) {
      .backdrop { padding: 0; place-items: stretch; }
    }
  `;
}
