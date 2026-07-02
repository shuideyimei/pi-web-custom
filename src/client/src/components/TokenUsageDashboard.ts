import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { DailyTokenUsage, TokenUsageSummary } from "../api";

type UsageDashboardTab = "overview" | "models";
type UsageRange = "all" | "30d" | "7d";

const RANGE_DAYS: Record<UsageRange, number> = {
  all: 182,
  "30d": 30,
  "7d": 7,
};

const LORD_OF_THE_RINGS_TOKEN_ESTIMATE = 590_000;

@customElement("token-usage-dashboard")
export class TokenUsageDashboard extends LitElement {
  @property({ attribute: false }) summary: TokenUsageSummary | undefined;
  @property({ type: Boolean }) loading = false;
  @property({ attribute: false }) onStartSession?: () => void;
  @state() private activeTab: UsageDashboardTab = "overview";
  @state() private activeRange: UsageRange = "all";

  override render() {
    if (this.loading || this.summary === undefined) return this.renderLoading();

    return html`
      <div class="usage-page">
        <div class="usage-wrap">
          <header class="hero">
            <h1>What’s up next?</h1>
          </header>

          <section class="panel" aria-label="Token usage dashboard">
            <div class="panel-toolbar">
              <nav class="tabs" aria-label="Usage sections">
                ${this.renderTab("overview", "Overview")}
                ${this.renderTab("models", "Models")}
              </nav>
              <div class="ranges" aria-label="Usage date range">
                ${this.renderRange("all", "All")}
                ${this.renderRange("30d", "30d")}
                ${this.renderRange("7d", "7d")}
              </div>
            </div>

            ${this.activeTab === "overview" ? this.renderOverview(this.summary) : this.renderModels(this.summary)}
          </section>
        </div>
      </div>
    `;
  }

  private renderLoading() {
    return html`
      <div class="usage-page">
        <div class="usage-wrap">
          <header class="hero">
            <h1>What’s up next?</h1>
          </header>
          <section class="panel loading-panel" aria-live="polite">
            <div class="loading">Loading usage stats…</div>
          </section>
        </div>
      </div>
    `;
  }

  private renderOverview(summary: TokenUsageSummary) {
    return html`
      <div class="metrics-grid">
        ${this.renderMetric("Sessions", formatNumber(summary.totalSessions))}
        ${this.renderMetric("Messages", formatNumber(summary.totalMessages))}
        ${this.renderMetric("Total tokens", formatCompactNumber(summary.totalTokens))}
        ${this.renderMetric("Active days", formatNumber(summary.activeDays))}
        ${this.renderMetric("Current streak", `${formatNumber(summary.currentStreak)}d`)}
        ${this.renderMetric("Longest streak", `${formatNumber(summary.longestStreak)}d`)}
        ${this.renderMetric("Peak hour", summary.peakHour ?? "—")}
        ${this.renderMetric("Favorite model", favoriteModelLabel(summary), favoriteModelTitle(summary))}
      </div>

      <div class="heatmap" aria-label="Daily token usage heatmap">
        ${this.renderHeatmap(summary)}
      </div>

      <p class="usage-note">${comparisonText(summary.totalTokens)}</p>
    `;
  }

  private renderModels(summary: TokenUsageSummary) {
    return html`
      <div class="models-pane">
        <div class="model-card">
          <span class="model-label">Favorite model</span>
          <strong class="model-value" title=${favoriteModelTitle(summary)}>${favoriteModelLabel(summary)}</strong>
          <span class="model-detail">Model-level breakdown will appear here as more usage metadata is available.</span>
        </div>
      </div>
    `;
  }

  private renderMetric(label: string, value: string, title = value) {
    return html`
      <div class="metric">
        <span class="metric-label">${label}</span>
        <strong class="metric-value" title=${title}>${value}</strong>
      </div>
    `;
  }

  private renderTab(tab: UsageDashboardTab, label: string) {
    return html`
      <button
        class=${`tab ${this.activeTab === tab ? "active" : ""}`}
        type="button"
        aria-pressed=${this.activeTab === tab}
        @click=${() => { this.activeTab = tab; }}
      >${label}</button>
    `;
  }

  private renderRange(range: UsageRange, label: string) {
    return html`
      <button
        class=${`range ${this.activeRange === range ? "active" : ""}`}
        type="button"
        aria-pressed=${this.activeRange === range}
        @click=${() => { this.activeRange = range; }}
      >${label}</button>
    `;
  }

  private renderHeatmap(summary: TokenUsageSummary) {
    const days = this.daysForRange(summary.tokensByDay);
    const max = Math.max(1, ...days.map((day) => day.total));
    const weeks = Math.ceil(days.length / 7);

    return html`
      <div class="heatmap-grid" style=${`--heatmap-weeks: ${String(weeks)}`}>
        ${days.map((day) => {
          const level = heatmapLevel(day.total, max);
          return html`
            <div
              class=${`heatmap-cell level-${String(level)}`}
              title=${`${day.date}: ${formatNumber(day.total)} tokens`}
              aria-label=${`${day.date}: ${formatNumber(day.total)} tokens`}
            ></div>
          `;
        })}
      </div>
    `;
  }

  private daysForRange(days: readonly DailyTokenUsage[]): DailyTokenUsage[] {
    const cellCount = Math.ceil(RANGE_DAYS[this.activeRange] / 7) * 7;
    const today = todayKey();
    const start = addDays(today, -cellCount + 1);
    const dayMap = new Map(days.map((day) => [day.date, day]));
    const result: DailyTokenUsage[] = [];
    for (let index = 0; index < cellCount; index++) {
      const date = addDays(start, index);
      result.push(dayMap.get(date) ?? { date, input: 0, output: 0, total: 0 });
    }
    return result;
  }

  static override styles = css`
    :host {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      background:
        radial-gradient(circle at 50% 18%, rgba(255, 255, 255, .035), transparent 34%),
        linear-gradient(180deg, #252525 0%, #1f1f1f 100%);
      color: #f2f2f2;
    }

    .usage-page {
      box-sizing: border-box;
      width: 100%;
      min-height: 100%;
      padding: 22px 24px 42px;
    }

    .usage-wrap {
      width: min(520px, calc(100vw - 48px));
      margin: 0 auto;
    }

    .hero {
      display: flex;
      align-items: center;
      margin: 0 0 42px;
    }

    h1 {
      margin: 0;
      color: #f5f5f5;
      font-size: 24px;
      font-weight: 760;
      letter-spacing: -.035em;
      line-height: 1.08;
      text-shadow: 0 1px 0 rgba(255, 255, 255, .03);
    }

    .panel {
      box-sizing: border-box;
      width: 100%;
      min-height: 318px;
      padding: 8px 11px 12px;
      border: 1px solid rgba(255, 255, 255, .035);
      border-radius: 7px 7px 0 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, .035), rgba(255, 255, 255, 0) 42%),
        linear-gradient(135deg, #313131 0%, #292929 100%);
      box-shadow:
        0 18px 34px rgba(0, 0, 0, .28),
        0 2px 8px rgba(0, 0, 0, .18),
        inset 0 1px 0 rgba(255, 255, 255, .055),
        inset 0 -1px 0 rgba(0, 0, 0, .24);
    }

    .panel-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      min-width: 0;
    }

    .tabs,
    .ranges {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }

    button {
      appearance: none;
      border: 0;
      cursor: pointer;
      font: inherit;
      color: #b9b9b9;
      background: transparent;
      transition: background .12s ease, color .12s ease, transform .12s ease;
    }

    button:hover {
      color: #f1f1f1;
      background: #414141;
    }

    button:focus-visible {
      outline: 2px solid #78a8ed;
      outline-offset: 2px;
    }

    .tab,
    .range {
      height: 24px;
      border-radius: 5px;
      padding: 0 9px;
      font-size: 13px;
      font-weight: 760;
      line-height: 24px;
    }

    .range {
      padding: 0 8px;
    }

    .tab.active,
    .range.active {
      color: #f4f4f4;
      background: linear-gradient(180deg, #535353, #454545);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .075), 0 1px 2px rgba(0, 0, 0, .18);
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4px;
      margin-top: 20px;
    }

    .metric {
      box-sizing: border-box;
      min-width: 0;
      height: 48px;
      padding: 6px 6px 5px;
      border: 1px solid rgba(255, 255, 255, .025);
      border-radius: 6px;
      background: linear-gradient(180deg, #484848 0%, #3e3e3e 100%);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .055), inset 0 -1px 0 rgba(0, 0, 0, .18), 0 1px 2px rgba(0, 0, 0, .16);
      overflow: hidden;
    }

    .metric-label,
    .model-label {
      display: block;
      min-width: 0;
      color: #b9b9b9;
      font-size: 13px;
      font-weight: 760;
      letter-spacing: -.025em;
      line-height: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .metric-value,
    .model-value {
      display: block;
      min-width: 0;
      margin-top: 1px;
      color: #f7f7f7;
      font-size: 17px;
      font-weight: 820;
      letter-spacing: -.035em;
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .heatmap {
      margin-top: 7px;
      overflow: hidden;
    }

    .heatmap-grid {
      display: grid;
      grid-template-rows: repeat(7, 14px);
      grid-auto-flow: column;
      grid-auto-columns: 14px;
      gap: 4px;
      width: max-content;
    }

    .heatmap-cell {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      background: linear-gradient(180deg, #424242, #363636);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .035), inset 0 -1px 0 rgba(0, 0, 0, .18), 0 1px 1px rgba(0, 0, 0, .16);
    }

    .heatmap-cell.level-1 { background: linear-gradient(180deg, #58677c, #46556d); }
    .heatmap-cell.level-2 { background: linear-gradient(180deg, #7193c4, #5d7ead); }
    .heatmap-cell.level-3 { background: linear-gradient(180deg, #91b7eb, #779fda); }
    .heatmap-cell.level-4 { background: linear-gradient(180deg, #609bf0, #447fd6); }
    .heatmap-cell.level-5 { background: linear-gradient(180deg, #438eea, #2672d3); }

    .usage-note {
      margin: 10px 0 0;
      color: #b8b8b8;
      font-size: 13px;
      font-weight: 760;
      line-height: 1.25;
      letter-spacing: -.035em;
    }

    .models-pane {
      margin-top: 26px;
    }

    .model-card {
      min-height: 208px;
      box-sizing: border-box;
      padding: 12px;
      border-radius: 6px;
      background: linear-gradient(180deg, #484848 0%, #3e3e3e 100%);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, .055), inset 0 -1px 0 rgba(0, 0, 0, .18), 0 1px 2px rgba(0, 0, 0, .16);
    }

    .model-detail {
      display: block;
      margin-top: 10px;
      color: #a9a9a9;
      font-size: 13px;
      line-height: 1.35;
    }

    .loading-panel {
      display: grid;
      place-items: center;
    }

    .loading {
      color: #b8b8b8;
      font-size: 15px;
      font-weight: 700;
    }

    @media (max-width: 720px) {
      .usage-page { padding: 20px 14px 36px; }
      .usage-wrap { width: 100%; }
      .hero { margin-bottom: 28px; }
      h1 { font-size: 23px; }
      .panel { min-height: 292px; padding: 8px; border-radius: 6px; }
      .panel-toolbar { align-items: flex-start; flex-direction: column; gap: 8px; }
      .metrics-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
      .heatmap { overflow-x: auto; padding-bottom: 4px; }
      .heatmap-grid { grid-template-rows: repeat(7, 12px); grid-auto-columns: 12px; gap: 3px; }
      .heatmap-cell { width: 12px; height: 12px; }
    }
  `;
}

function favoriteModelLabel(summary: TokenUsageSummary): string {
  return summary.favoriteModel?.name ?? summary.favoriteModel?.id ?? "—";
}

function favoriteModelTitle(summary: TokenUsageSummary): string {
  const model = summary.favoriteModel;
  if (model === null) return "No model usage metadata yet";
  return `${model.provider}/${model.id}`;
}

function comparisonText(totalTokens: number): string {
  if (totalTokens <= 0) return "Start a session to fill in your token calendar.";
  const ratio = Math.max(1, Math.round(totalTokens / LORD_OF_THE_RINGS_TOKEN_ESTIMATE));
  return `You’ve used ~${formatNumber(ratio)}x more tokens than The Lord of the Rings.`;
}

function heatmapLevel(total: number, max: number): number {
  if (total <= 0) return 0;
  const fraction = total / Math.max(1, max);
  if (fraction >= .8) return 5;
  if (fraction >= .55) return 4;
  if (fraction >= .32) return 3;
  if (fraction >= .14) return 2;
  return 1;
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatCompactNumber(value: number): string {
  if (value >= 1_000_000_000) return `${trimFixed(value / 1_000_000_000)}B`;
  if (value >= 1_000_000) return `${trimFixed(value / 1_000_000)}M`;
  if (value >= 1_000) return `${trimFixed(value / 1_000)}k`;
  return value.toLocaleString();
}

function trimFixed(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/u, "");
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, offset: number): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map((part) => Number.parseInt(part, 10));
  const value = new Date(Date.UTC(year, month - 1, day));
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
