import { css, html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { modelsConfigApi, type PiModelConfig, type PiModelCostConfig, type PiModelOverrideConfig, type PiModelProviderConfig, type PiModelsConfigResponse, type PiModelsConfigValues } from "../../api";

const API_OPTIONS = ["openai-completions", "openai-responses", "anthropic-messages", "google-generative-ai"] as const;
const EMPTY_MODELS_CONFIG: PiModelsConfigValues = { providers: {} };
const EMPTY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;
const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

type ModelJsonObjectField = "headers" | "compat" | "thinkingLevelMap";
type ProviderJsonObjectField = "headers" | "compat" | "modelOverrides";

type PresetId = "ollama" | "openai-compatible" | "anthropic-proxy" | "google-ai-studio";

@customElement("settings-providers-panel")
export class SettingsProvidersPanel extends LitElement {
  @state() private response: PiModelsConfigResponse | undefined;
  @state() private draft: PiModelsConfigValues = EMPTY_MODELS_CONFIG;
  @state() private rawDraft = "";
  @state() private rawMode = false;
  @state() private loading = true;
  @state() private saving = false;
  @state() private error = "";
  @state() private localError = "";
  @state() private savedMessage = "";
  private savedMessageTimer: number | undefined;

  @property({ attribute: false }) onConfigureAuth?: () => void;
  @property({ attribute: false }) onLogoutAuth?: () => void;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadConfig();
  }

  override disconnectedCallback(): void {
    if (this.savedMessageTimer !== undefined) window.clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = undefined;
    super.disconnectedCallback();
  }

  override render(): TemplateResult {
    return html`
      <div class="section-heading">
        <div>
          <h2>Providers</h2>
          <p>Configure provider authentication and edit pi's <code>models.json</code> for custom providers, model metadata, reasoning, token limits, routing, headers, and compatibility settings.</p>
        </div>
        <button class="secondary" ?disabled=${this.loading} @click=${() => { void this.loadConfig(); }}>Reload</button>
      </div>
      ${this.renderMessages()}
      ${this.renderAuthCard()}
      ${this.response === undefined && this.loading ? html`<div class="loading-card">Loading provider configuration…</div>` : this.renderModelsConfig()}
    `;
  }

  private renderMessages(): TemplateResult | null {
    const message = firstNonEmpty(this.localError, this.error, this.response?.error);
    if (message !== "") return html`<div class="message error-message">${message}</div>`;
    if (this.savedMessage !== "") return html`<div class="message success-message">${this.savedMessage}</div>`;
    return null;
  }

  private renderAuthCard(): TemplateResult {
    return html`
      <section class="category-card auth-card">
        <div>
          <h3>Stored authentication</h3>
          <p>Use pi's auth store for OAuth/API keys, or define model-provider auth in <code>models.json</code> with <code>apiKey</code>, environment interpolation, commands, and request headers.</p>
        </div>
        <div class="action-row">
          <button class="primary" type="button" ?disabled=${this.onConfigureAuth === undefined} @click=${() => { this.onConfigureAuth?.(); }}>Configure authentication</button>
          <button type="button" ?disabled=${this.onLogoutAuth === undefined} @click=${() => { this.onLogoutAuth?.(); }}>Remove authentication</button>
        </div>
      </section>
    `;
  }

  private renderModelsConfig(): TemplateResult {
    const providerEntries = Object.entries(this.draft.providers);
    return html`
      <section class="models-card">
        <div class="models-heading">
          <div>
            <h3>models.json</h3>
            <p>Changes are saved to pi's model registry file. Pi reloads this file whenever the model list or model selection is opened; no PI WEB restart is required.</p>
          </div>
          <button type="button" ?disabled=${this.saving} @click=${() => { this.rawMode = !this.rawMode; }}>${this.rawMode ? "Use structured editor" : "Edit raw JSON"}</button>
        </div>
        <div class="config-path-card">
          <span>Models file</span>
          <code>${this.response?.path ?? "Unknown"}</code>
          <small>${this.response?.exists === true ? "Existing file" : "This file will be created on save"}</small>
        </div>
        ${this.renderApiDatalist()}
        ${this.rawMode ? this.renderRawEditor() : html`
          ${this.renderPresetActions()}
          ${providerEntries.length === 0 ? html`<div class="empty-card">No custom providers yet. Add a preset or create a provider to start.</div>` : providerEntries.map(([providerId, provider]) => this.renderProviderCard(providerId, provider))}
          <footer class="form-actions">
            <button type="button" @click=${() => { this.addProvider(); }}>Add empty provider</button>
            <button class="primary" type="button" ?disabled=${this.loading || this.saving} @click=${() => { void this.saveStructured(); }}>${this.saving ? "Saving…" : "Save models.json"}</button>
          </footer>
        `}
        ${this.renderReference()}
      </section>
    `;
  }

  private renderRawEditor(): TemplateResult {
    return html`
      <div class="raw-editor">
        <label class="field">
          <span class="field-heading">Raw models.json</span>
          <textarea rows="18" spellcheck="false" .value=${this.rawDraft} @input=${(event: Event) => { this.rawDraft = textAreaValue(event); this.localError = ""; }}></textarea>
          <small>Supports the same JSON-with-comments syntax pi accepts. Saving validates and rewrites the file as formatted JSON.</small>
        </label>
        <footer class="form-actions">
          <button type="button" ?disabled=${this.loading || this.saving} @click=${() => { void this.loadConfig(); }}>Reset from disk</button>
          <button class="primary" type="button" ?disabled=${this.loading || this.saving} @click=${() => { void this.saveRaw(); }}>${this.saving ? "Saving…" : "Save raw JSON"}</button>
        </footer>
      </div>
    `;
  }

  private renderPresetActions(): TemplateResult {
    return html`
      <section class="preset-card">
        <div>
          <span class="card-eyebrow">Quick add</span>
          <h3>Provider presets</h3>
          <p>Start from common local/proxy configurations, then adjust model ids, limits, headers, and compatibility fields below.</p>
        </div>
        <div class="preset-grid">
          ${this.renderPresetButton("ollama", "Ollama", "http://localhost:11434/v1")}
          ${this.renderPresetButton("openai-compatible", "OpenAI-compatible", "LM Studio, vLLM, LiteLLM")}
          ${this.renderPresetButton("anthropic-proxy", "Anthropic proxy", "Anthropic Messages API")}
          ${this.renderPresetButton("google-ai-studio", "Google AI Studio", "Gemini/Gemma custom entries")}
        </div>
      </section>
    `;
  }

  private renderPresetButton(id: PresetId, label: string, detail: string): TemplateResult {
    return html`<button type="button" class="preset-button" @click=${() => { this.addPreset(id); }}><strong>${label}</strong><small>${detail}</small></button>`;
  }

  private renderProviderCard(providerId: string, provider: PiModelProviderConfig): TemplateResult {
    const models = provider.models ?? [];
    return html`
      <article class="provider-card">
        <header class="provider-header">
          <div>
            <span class="card-eyebrow">Provider</span>
            <h3>${provider.name ?? providerId}</h3>
            <small><code>${providerId}</code>${models.length > 0 ? ` · ${String(models.length)} model${models.length === 1 ? "" : "s"}` : " · override-only"}</small>
          </div>
          <button type="button" class="danger" @click=${() => { this.removeProvider(providerId); }}>Remove provider</button>
        </header>
        <div class="summary-pills" aria-label="Provider summary">
          ${this.renderSummaryPill("API", provider.api ?? "inherit/built-in")}
          ${this.renderSummaryPill("Endpoint", provider.baseUrl ?? "default")}
          ${this.renderSummaryPill("Auth", provider.apiKey !== undefined ? "models.json key" : provider.authHeader === true ? "Bearer header" : "pi auth store")}
          ${this.renderSummaryPill("Advanced", providerAdvancedSummary(provider))}
        </div>
        <div class="provider-grid compact-grid">
          <label class="field">
            <span class="field-heading">Provider id</span>
            <input .value=${providerId} autocomplete="off" spellcheck="false" @change=${(event: Event) => { this.renameProvider(providerId, inputValue(event)); }}>
            <small>Key under <code>providers</code>; also used as the model provider id.</small>
          </label>
          <label class="field">
            <span class="field-heading">Display name <code>name</code></span>
            <input .value=${provider.name ?? ""} placeholder=${providerId} autocomplete="off" @input=${(event: Event) => { this.updateProviderString(providerId, "name", inputValue(event)); }}>
          </label>
          <label class="field">
            <span class="field-heading">API endpoint <code>baseUrl</code></span>
            <input .value=${provider.baseUrl ?? ""} placeholder="https://api.example.com/v1" autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateProviderString(providerId, "baseUrl", inputValue(event)); }}>
          </label>
          <label class="field">
            <span class="field-heading">API type <code>api</code></span>
            <input list="provider-api-options" .value=${provider.api ?? ""} placeholder="openai-completions" autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateProviderString(providerId, "api", inputValue(event)); }}>
          </label>
        </div>
        <details class="details-card provider-details">
          <summary>View provider details</summary>
          <div class="details-body">
            <div class="provider-grid compact-grid">
              <label class="field">
                <span class="field-heading">API key config <code>apiKey</code></span>
                <input .value=${provider.apiKey ?? ""} placeholder="$MY_API_KEY or !command" autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateProviderString(providerId, "apiKey", inputValue(event)); }}>
                <small>Supports literals, <code>$ENV_VAR</code>, <code>${"${ENV_VAR}"}</code>, <code>!command</code>, <code>$$</code>, and <code>$!</code>.</small>
              </label>
              <label class="toggle-field">
                <input type="checkbox" .checked=${provider.authHeader === true} @change=${(event: Event) => { this.updateProviderBoolean(providerId, checkboxChecked(event)); }}>
                <span>Add <code>Authorization: Bearer &lt;apiKey&gt;</code> <small><code>authHeader</code></small></span>
              </label>
            </div>
            <div class="json-grid">
              ${this.renderProviderJsonField(providerId, provider, "headers", "Headers", '{\n  "x-api-key": "$PROXY_KEY"\n}')}
              ${this.renderProviderJsonField(providerId, provider, "compat", "Provider compat", '{\n  "supportsDeveloperRole": false,\n  "supportsReasoningEffort": false\n}')}
              ${this.renderProviderJsonField(providerId, provider, "modelOverrides", "Built-in model overrides", '{\n  "gpt-5": {\n    "contextWindow": 400000,\n    "maxTokens": 128000\n  }\n}')}
            </div>
          </div>
        </details>
        <section class="models-section">
          <div class="models-section-heading">
            <div>
              <h4>Custom models <code>models</code></h4>
              <p>Only the model id/name and capability summary are shown here. Open details for routing, token, cost, headers, and compatibility fields.</p>
            </div>
            <button type="button" @click=${() => { this.addModel(providerId); }}>Add model</button>
          </div>
          ${models.length === 0 ? html`<div class="empty-card compact">No custom model entries. Provider-level overrides can still route built-in models.</div>` : models.map((model, index) => this.renderModelCard(providerId, model, index))}
        </section>
      </article>
    `;
  }

  private renderApiDatalist(): TemplateResult {
    return html`<datalist id="provider-api-options">${API_OPTIONS.map((api) => html`<option value=${api}></option>`)}</datalist>`;
  }

  private renderProviderJsonField(providerId: string, provider: PiModelProviderConfig, field: ProviderJsonObjectField, title: string, placeholder: string): TemplateResult {
    return html`
      <label class="field json-field">
        <span class="field-heading">${title} <code>${field}</code></span>
        <textarea rows="5" spellcheck="false" placeholder=${placeholder} .value=${jsonText(provider[field])} @change=${(event: Event) => { this.updateProviderJson(providerId, field, textAreaValue(event)); }}></textarea>
      </label>
    `;
  }

  private renderModelCard(providerId: string, model: PiModelConfig, index: number): TemplateResult {
    return html`
      <article class="model-card">
        <header class="model-header">
          <div>
            <h4>${model.name ?? model.id}</h4>
            <small><code>${model.id !== "" ? model.id : "model-id"}</code>${model.reasoning === true ? " · reasoning" : ""}${model.input?.includes("image") === true ? " · vision" : ""}</small>
          </div>
          <button type="button" class="danger" @click=${() => { this.removeModel(providerId, index); }}>Remove model</button>
        </header>
        <div class="summary-pills" aria-label="Model summary">
          ${this.renderSummaryPill("Context", tokenSummary(model.contextWindow))}
          ${this.renderSummaryPill("Max output", tokenSummary(model.maxTokens))}
          ${this.renderSummaryPill("Input", model.input?.includes("image") === true ? "text + image" : "text")}
          ${this.renderSummaryPill("Routing", modelRoutingSummary(model))}
          ${this.renderSummaryPill("Pricing", costSummary(model.cost))}
        </div>
        <div class="model-grid compact-grid">
          <label class="field">
            <span class="field-heading">Model id <code>id</code></span>
            <input .value=${model.id} autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateModelString(providerId, index, "id", inputValue(event), { required: true }); }}>
          </label>
          <label class="field">
            <span class="field-heading">Display name <code>name</code></span>
            <input .value=${model.name ?? ""} placeholder=${model.id} autocomplete="off" @input=${(event: Event) => { this.updateModelString(providerId, index, "name", inputValue(event)); }}>
          </label>
        </div>
        <details class="details-card model-details">
          <summary>View model details</summary>
          <div class="details-body">
            <div class="model-grid">
              <label class="field">
                <span class="field-heading">Model API override <code>api</code></span>
                <input list="provider-api-options" .value=${model.api ?? ""} placeholder="inherit provider api" autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateModelString(providerId, index, "api", inputValue(event)); }}>
              </label>
              <label class="field">
                <span class="field-heading">Model endpoint override <code>baseUrl</code></span>
                <input .value=${model.baseUrl ?? ""} placeholder="inherit provider baseUrl" autocomplete="off" spellcheck="false" @input=${(event: Event) => { this.updateModelString(providerId, index, "baseUrl", inputValue(event)); }}>
              </label>
              <label class="field">
                <span class="field-heading">Context window <code>contextWindow</code></span>
                <input type="number" min="1" step="1" .value=${numberText(model.contextWindow)} placeholder="128000" @input=${(event: Event) => { this.updateModelNumber(providerId, index, "contextWindow", inputValue(event)); }}>
              </label>
              <label class="field">
                <span class="field-heading">Max output tokens <code>maxTokens</code></span>
                <input type="number" min="1" step="1" .value=${numberText(model.maxTokens)} placeholder="16384" @input=${(event: Event) => { this.updateModelNumber(providerId, index, "maxTokens", inputValue(event)); }}>
              </label>
              <label class="toggle-field">
                <input type="checkbox" .checked=${model.reasoning === true} @change=${(event: Event) => { this.updateModelBoolean(providerId, index, "reasoning", checkboxChecked(event)); }}>
                <span>Supports reasoning <small><code>reasoning</code></small></span>
              </label>
              <div class="input-types">
                <span class="field-heading">Input types <code>input</code></span>
                <label><input type="checkbox" checked disabled> text</label>
                <label><input type="checkbox" .checked=${model.input?.includes("image") === true} @change=${(event: Event) => { this.updateModelImageInput(providerId, index, checkboxChecked(event)); }}> image</label>
              </div>
            </div>
            <div class="cost-grid">
              <span class="field-heading cost-heading">Cost per million tokens <code>cost</code></span>
              ${this.renderCostField(providerId, index, model.cost, "input", "Input")}
              ${this.renderCostField(providerId, index, model.cost, "output", "Output")}
              ${this.renderCostField(providerId, index, model.cost, "cacheRead", "Cache read")}
              ${this.renderCostField(providerId, index, model.cost, "cacheWrite", "Cache write")}
            </div>
            <div class="json-grid">
              ${this.renderModelJsonField(providerId, index, model, "thinkingLevelMap", "Thinking level map", '{\n  "minimal": null,\n  "high": "high",\n  "xhigh": "max"\n}')}
              ${this.renderModelJsonField(providerId, index, model, "headers", "Model headers", '{\n  "x-route": "fast"\n}')}
              ${this.renderModelJsonField(providerId, index, model, "compat", "Model compat", '{\n  "thinkingFormat": "openrouter"\n}')}
            </div>
          </div>
        </details>
      </article>
    `;
  }

  private renderSummaryPill(label: string, value: string): TemplateResult {
    return html`<span class="summary-pill"><strong>${label}</strong>${value}</span>`;
  }

  private renderCostField(providerId: string, modelIndex: number, cost: Required<PiModelCostConfig> | undefined, field: keyof Required<PiModelCostConfig>, label: string): TemplateResult {
    return html`
      <label class="field compact-field">
        <span>${label}</span>
        <input type="number" min="0" step="0.000001" .value=${numberText(cost?.[field])} placeholder="0" @input=${(event: Event) => { this.updateModelCost(providerId, modelIndex, field, inputValue(event)); }}>
      </label>
    `;
  }

  private renderModelJsonField(providerId: string, modelIndex: number, model: PiModelConfig, field: ModelJsonObjectField, title: string, placeholder: string): TemplateResult {
    return html`
      <label class="field json-field">
        <span class="field-heading">${title} <code>${field}</code></span>
        <textarea rows="5" spellcheck="false" placeholder=${placeholder} .value=${jsonText(model[field])} @change=${(event: Event) => { this.updateModelJson(providerId, modelIndex, field, textAreaValue(event)); }}></textarea>
      </label>
    `;
  }

  private renderReference(): TemplateResult {
    return html`
      <details class="reference-card">
        <summary>Show all supported models.json fields</summary>
        <div class="reference-grid">
          <section>
            <h4>Provider fields</h4>
            <dl>
              <div><dt>name</dt><dd>Display name.</dd></div>
              <div><dt>baseUrl</dt><dd>Provider endpoint URL.</dd></div>
              <div><dt>api</dt><dd>API type: ${API_OPTIONS.join(", ")} or extension-defined API.</dd></div>
              <div><dt>apiKey</dt><dd>Literal, <code>$ENV</code>, <code>${"${ENV}"}</code>, or leading <code>!command</code>.</dd></div>
              <div><dt>headers</dt><dd>String-valued custom request headers.</dd></div>
              <div><dt>authHeader</dt><dd>Add <code>Authorization: Bearer &lt;apiKey&gt;</code>.</dd></div>
              <div><dt>compat</dt><dd>Provider compatibility defaults, merged into models.</dd></div>
              <div><dt>models</dt><dd>Custom model definitions.</dd></div>
              <div><dt>modelOverrides</dt><dd>Overrides for built-in model ids.</dd></div>
            </dl>
          </section>
          <section>
            <h4>Model fields</h4>
            <dl>
              <div><dt>id</dt><dd>Required model identifier sent to the API.</dd></div>
              <div><dt>name</dt><dd>Human-readable label used for matching/details.</dd></div>
              <div><dt>api/baseUrl</dt><dd>Per-model overrides.</dd></div>
              <div><dt>reasoning</dt><dd>Whether extended thinking is supported.</dd></div>
              <div><dt>thinkingLevelMap</dt><dd>Map <code>off|minimal|low|medium|high|xhigh</code> to provider values or <code>null</code>.</dd></div>
              <div><dt>input</dt><dd><code>["text"]</code> or <code>["text", "image"]</code>.</dd></div>
              <div><dt>contextWindow</dt><dd>Context window tokens.</dd></div>
              <div><dt>maxTokens</dt><dd>Maximum output tokens.</dd></div>
              <div><dt>cost</dt><dd>Per-million-token input/output/cache pricing.</dd></div>
              <div><dt>headers/compat</dt><dd>Per-model request and compatibility overrides.</dd></div>
            </dl>
          </section>
          <section>
            <h4>Common compat fields</h4>
            <p><strong>OpenAI-compatible:</strong> supportsStore, supportsDeveloperRole, supportsReasoningEffort, supportsUsageInStreaming, maxTokensField, requiresToolResultName, requiresAssistantAfterToolResult, requiresThinkingAsText, requiresReasoningContentOnAssistantMessages, thinkingFormat, chatTemplateKwargs, cacheControlFormat, supportsStrictMode, supportsLongCacheRetention, openRouterRouting, vercelGatewayRouting.</p>
            <p><strong>OpenAI Responses:</strong> supportsDeveloperRole, sendSessionIdHeader, supportsLongCacheRetention.</p>
            <p><strong>Anthropic Messages:</strong> supportsEagerToolInputStreaming, supportsLongCacheRetention, sendSessionAffinityHeaders, supportsCacheControlOnTools, forceAdaptiveThinking, allowEmptySignature.</p>
          </section>
        </div>
      </details>
    `;
  }

  private async loadConfig(): Promise<void> {
    this.loading = true;
    this.error = "";
    this.savedMessage = "";
    try {
      this.applyResponse(await modelsConfigApi.config());
    } catch (error) {
      this.error = `Failed to load models.json: ${errorMessage(error)}`;
    } finally {
      this.loading = false;
    }
  }

  private async saveStructured(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.localError = "";
    this.error = "";
    try {
      this.applyResponse(await modelsConfigApi.saveConfig(this.draft));
      this.showSavedMessage();
    } catch (error) {
      this.localError = `Failed to save models.json: ${errorMessage(error)}`;
    } finally {
      this.saving = false;
    }
  }

  private async saveRaw(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    this.localError = "";
    this.error = "";
    try {
      this.applyResponse(await modelsConfigApi.saveRaw(this.rawDraft));
      this.showSavedMessage();
    } catch (error) {
      this.localError = `Failed to save models.json: ${errorMessage(error)}`;
    } finally {
      this.saving = false;
    }
  }

  private applyResponse(response: PiModelsConfigResponse): void {
    this.response = response;
    this.draft = cloneConfig(response.config);
    this.rawDraft = response.raw;
    this.rawMode = response.error !== undefined;
    this.localError = "";
  }

  private showSavedMessage(): void {
    this.savedMessage = "models.json saved.";
    if (this.savedMessageTimer !== undefined) window.clearTimeout(this.savedMessageTimer);
    this.savedMessageTimer = window.setTimeout(() => {
      if (this.savedMessage === "models.json saved.") this.savedMessage = "";
      this.savedMessageTimer = undefined;
    }, 3000);
  }

  private addProvider(): void {
    const id = uniqueProviderId(this.draft.providers, "custom-provider");
    this.mutateDraft((draft) => {
      draft.providers[id] = { api: "openai-completions", models: [] };
    });
  }

  private addPreset(preset: PresetId): void {
    const provider = providerPreset(preset);
    const id = uniqueProviderId(this.draft.providers, provider.id);
    this.mutateDraft((draft) => {
      draft.providers[id] = provider.config;
    });
  }

  private removeProvider(providerId: string): void {
    this.mutateDraft((draft) => {
      draft.providers = Object.fromEntries(Object.entries(draft.providers).filter(([id]) => id !== providerId));
    });
  }

  private renameProvider(oldId: string, rawNewId: string): void {
    const newId = rawNewId.trim();
    if (newId === "" || newId === oldId) return;
    if (this.draft.providers[newId] !== undefined) {
      this.localError = `Provider already exists: ${newId}`;
      return;
    }
    this.mutateDraft((draft) => {
      const provider = draft.providers[oldId];
      if (provider === undefined) return;
      const entries: [string, PiModelProviderConfig][] = Object.entries(draft.providers).map(([id, value]) => id === oldId ? [newId, value] : [id, value]);
      draft.providers = Object.fromEntries(entries);
    });
  }

  private updateProviderString(providerId: string, field: "name" | "baseUrl" | "apiKey" | "api", rawValue: string): void {
    this.mutateDraft((draft) => {
      const provider = draft.providers[providerId];
      if (provider === undefined) return;
      setProviderOptionalString(provider, field, rawValue);
    });
  }

  private updateProviderBoolean(providerId: string, value: boolean): void {
    this.mutateDraft((draft) => {
      const provider = draft.providers[providerId];
      if (provider === undefined) return;
      if (value) provider.authHeader = true;
      else delete provider.authHeader;
    });
  }

  private updateProviderJson(providerId: string, field: ProviderJsonObjectField, rawValue: string): void {
    try {
      this.mutateDraft((draft) => {
        const provider = draft.providers[providerId];
        if (provider === undefined) return;
        if (field === "headers") {
          const parsed = parseOptionalStringJsonObject(rawValue, field);
          if (parsed === undefined) delete provider.headers;
          else provider.headers = parsed;
        } else if (field === "compat") {
          const parsed = parseOptionalJsonObject(rawValue, field);
          if (parsed === undefined) delete provider.compat;
          else provider.compat = parsed;
        } else {
          const parsed = parseOptionalModelOverridesJson(rawValue);
          if (parsed === undefined) delete provider.modelOverrides;
          else provider.modelOverrides = parsed;
        }
      });
    } catch (error) {
      this.localError = errorMessage(error);
    }
  }

  private addModel(providerId: string): void {
    this.mutateDraft((draft) => {
      const provider = draft.providers[providerId];
      if (provider === undefined) return;
      provider.models = [...(provider.models ?? []), { id: uniqueModelId(provider.models ?? [], "model-id"), input: ["text"], reasoning: false, cost: { ...EMPTY_COST } }];
    });
  }

  private removeModel(providerId: string, index: number): void {
    this.mutateDraft((draft) => {
      const provider = draft.providers[providerId];
      if (provider?.models === undefined) return;
      provider.models = provider.models.filter((_model, modelIndex) => modelIndex !== index);
      if (provider.models.length === 0) delete provider.models;
    });
  }

  private updateModelString(providerId: string, modelIndex: number, field: "id" | "name" | "api" | "baseUrl", rawValue: string, options: { required?: boolean } = {}): void {
    this.mutateModel(providerId, modelIndex, (model) => {
      if (options.required === true) model.id = rawValue.trim();
      else setModelOptionalString(model, field, rawValue);
    });
  }

  private updateModelNumber(providerId: string, modelIndex: number, field: "contextWindow" | "maxTokens", rawValue: string): void {
    try {
      const parsed = parseOptionalPositiveNumber(rawValue, field);
      this.mutateModel(providerId, modelIndex, (model) => {
        if (field === "contextWindow") {
          if (parsed === undefined) delete model.contextWindow;
          else model.contextWindow = parsed;
        } else if (parsed === undefined) {
          delete model.maxTokens;
        } else {
          model.maxTokens = parsed;
        }
      });
    } catch (error) {
      this.localError = errorMessage(error);
    }
  }

  private updateModelBoolean(providerId: string, modelIndex: number, field: "reasoning", value: boolean): void {
    this.mutateModel(providerId, modelIndex, (model) => {
      model[field] = value;
    });
  }

  private updateModelImageInput(providerId: string, modelIndex: number, enabled: boolean): void {
    this.mutateModel(providerId, modelIndex, (model) => {
      model.input = enabled ? ["text", "image"] : ["text"];
    });
  }

  private updateModelCost(providerId: string, modelIndex: number, field: keyof Required<PiModelCostConfig>, rawValue: string): void {
    try {
      const parsed = parseOptionalNonNegativeNumber(rawValue, field);
      this.mutateModel(providerId, modelIndex, (model) => {
        if (parsed === undefined) {
          delete model.cost;
          return;
        }
        const cost = { ...EMPTY_COST, ...(model.cost ?? {}) };
        cost[field] = parsed;
        model.cost = cost;
      });
    } catch (error) {
      this.localError = errorMessage(error);
    }
  }

  private updateModelJson(providerId: string, modelIndex: number, field: ModelJsonObjectField, rawValue: string): void {
    try {
      this.mutateModel(providerId, modelIndex, (model) => {
        if (field === "headers") {
          const parsed = parseOptionalStringJsonObject(rawValue, field);
          if (parsed === undefined) delete model.headers;
          else model.headers = parsed;
        } else if (field === "compat") {
          const parsed = parseOptionalJsonObject(rawValue, field);
          if (parsed === undefined) delete model.compat;
          else model.compat = parsed;
        } else {
          const parsed = parseOptionalThinkingLevelMap(rawValue);
          if (parsed === undefined) delete model.thinkingLevelMap;
          else model.thinkingLevelMap = parsed;
        }
      });
    } catch (error) {
      this.localError = errorMessage(error);
    }
  }

  private mutateModel(providerId: string, modelIndex: number, mutator: (model: PiModelConfig) => void): void {
    this.mutateDraft((draft) => {
      const model = draft.providers[providerId]?.models?.[modelIndex];
      if (model !== undefined) mutator(model);
    });
  }

  private mutateDraft(mutator: (draft: PiModelsConfigValues) => void): void {
    const draft = cloneConfig(this.draft);
    mutator(draft);
    this.draft = draft;
    this.localError = "";
  }

  static override styles = css`
    :host { display: block; }
    .section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
    .section-heading > div { display: grid; gap: 6px; min-width: 0; }
    h2, h3, h4, p { margin: 0; }
    h2 { font-size: 17px; line-height: 1.25; }
    h3 { font-size: 15px; line-height: 1.3; }
    h4 { font-size: 13px; line-height: 1.3; }
    p { color: var(--pi-muted); line-height: 1.45; }
    button, input, textarea { font: inherit; }
    button { border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-surface); color: var(--pi-text); padding: 7px 9px; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    button:hover, button:focus { background: color-mix(in srgb, var(--pi-text) 8%, var(--pi-surface)); }
    .primary { border-color: var(--pi-accent); background: var(--pi-selection-bg); color: var(--pi-text-bright); }
    .secondary { flex: 0 0 auto; }
    .danger { border-color: color-mix(in srgb, var(--pi-danger) 45%, var(--pi-border)); color: var(--pi-danger); }
    .message, .loading-card, .config-path-card, .category-card, .models-card, .preset-card, .provider-card, .model-card, .empty-card, .reference-card, .details-card { border: 1px solid var(--pi-border); border-radius: 10px; background: var(--pi-surface); padding: 12px; }
    .message { margin-bottom: 12px; }
    .error-message { border-color: var(--pi-danger); color: var(--pi-danger); background: color-mix(in srgb, var(--pi-danger) 10%, var(--pi-surface)); white-space: pre-wrap; }
    .success-message { border-color: var(--pi-success-border); color: var(--pi-success); background: var(--pi-success-surface); }
    .loading-card, .empty-card { color: var(--pi-muted); }
    .category-card, .models-card, .preset-card, .provider-card, .model-card { display: grid; gap: 14px; }
    .auth-card { margin-bottom: 14px; }
    .action-row, .form-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .form-actions { justify-content: flex-end; padding-top: 2px; }
    .models-heading, .provider-header, .model-header, .models-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .models-heading > div, .provider-header > div, .model-header > div, .models-section-heading > div { display: grid; gap: 4px; min-width: 0; }
    .config-path-card { display: grid; gap: 5px; }
    .config-path-card span, .field-heading, .card-eyebrow, dt { color: var(--pi-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .card-eyebrow { letter-spacing: .06em; }
    code { border: 1px solid var(--pi-border-muted); border-radius: 5px; background: var(--pi-bg); padding: 1px 4px; color: var(--pi-text); font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; overflow-wrap: anywhere; }
    small { color: var(--pi-muted); line-height: 1.4; }
    .preset-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
    .preset-button { display: grid; gap: 4px; text-align: left; align-content: start; }
    .preset-button strong, .preset-button small { min-width: 0; overflow-wrap: anywhere; }
    .provider-grid, .model-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .compact-grid { gap: 10px; }
    .json-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
    .cost-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; align-items: end; }
    .cost-heading { grid-column: 1 / -1; }
    .field { display: grid; gap: 7px; min-width: 0; }
    .field-heading { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .compact-field span { color: var(--pi-muted); font-size: 12px; }
    input, textarea { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--pi-border); border-radius: 8px; background: var(--pi-bg); color: var(--pi-text); padding: 9px 10px; outline: none; }
    input:focus, textarea:focus { border-color: var(--pi-accent); box-shadow: 0 0 0 1px var(--pi-accent-border); }
    textarea { resize: vertical; min-height: 110px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.45; }
    .raw-editor textarea { min-height: 360px; }
    .toggle-field, .input-types { display: grid; gap: 8px; align-content: start; border: 1px solid var(--pi-border-muted); border-radius: 8px; background: var(--pi-bg); padding: 10px; }
    .toggle-field { grid-template-columns: auto minmax(0, 1fr); align-items: start; }
    .toggle-field input, .input-types input { width: 16px; height: 16px; }
    .input-types label { display: flex; align-items: center; gap: 7px; color: var(--pi-text); }
    .models-section { display: grid; gap: 12px; }
    .summary-pills { display: flex; flex-wrap: wrap; gap: 6px; }
    .summary-pill { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; border: 1px solid var(--pi-border-muted); border-radius: 999px; background: var(--pi-bg); color: var(--pi-muted); padding: 4px 8px; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .summary-pill strong { color: var(--pi-text); font-weight: 650; }
    .details-card { background: color-mix(in srgb, var(--pi-surface) 82%, var(--pi-bg)); padding: 0; overflow: hidden; }
    .details-card summary { cursor: pointer; color: var(--pi-text-bright); font-weight: 650; padding: 10px 12px; }
    .details-card summary:hover, .details-card summary:focus { background: color-mix(in srgb, var(--pi-text) 7%, transparent); }
    .details-body { display: grid; gap: 12px; padding: 0 12px 12px; }
    .empty-card.compact { padding: 10px; }
    .reference-card { background: color-mix(in srgb, var(--pi-surface) 80%, var(--pi-bg)); }
    .reference-card summary { cursor: pointer; color: var(--pi-text-bright); font-weight: 650; }
    .reference-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-top: 12px; }
    .reference-grid section:last-child { grid-column: 1 / -1; }
    dl { display: grid; gap: 8px; margin: 8px 0 0; }
    dl > div { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px; }
    dd { margin: 0; color: var(--pi-text); overflow-wrap: anywhere; }

    @media (max-width: 980px) {
      .preset-grid, .json-grid, .cost-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .reference-grid { grid-template-columns: minmax(0, 1fr); }
      .reference-grid section:last-child { grid-column: auto; }
    }
    @media (max-width: 760px) {
      .section-heading, .models-heading, .provider-header, .model-header, .models-section-heading { display: grid; gap: 12px; }
      .section-heading .secondary { justify-self: start; }
      .provider-grid, .model-grid, .preset-grid, .json-grid, .cost-grid { grid-template-columns: minmax(0, 1fr); }
      dl > div { grid-template-columns: minmax(0, 1fr); gap: 3px; }
      .form-actions { justify-content: flex-start; }
    }
  `;
}

function providerPreset(preset: PresetId): { id: string; config: PiModelProviderConfig } {
  switch (preset) {
    case "ollama":
      return {
        id: "ollama",
        config: {
          name: "Ollama",
          baseUrl: "http://localhost:11434/v1",
          api: "openai-completions",
          apiKey: "ollama",
          compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
          models: [defaultModel("llama3.1:8b")],
        },
      };
    case "openai-compatible":
      return {
        id: "local-llm",
        config: {
          name: "Local OpenAI-compatible",
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "local",
          compat: { supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" },
          models: [defaultModel("model-id")],
        },
      };
    case "anthropic-proxy":
      return {
        id: "anthropic-proxy",
        config: {
          name: "Anthropic proxy",
          baseUrl: "https://proxy.example.com",
          api: "anthropic-messages",
          apiKey: "$ANTHROPIC_PROXY_KEY",
          models: [{ ...defaultModel("claude-sonnet-4-proxy"), input: ["text", "image"], reasoning: true }],
        },
      };
    case "google-ai-studio":
      return {
        id: "google-ai-studio",
        config: {
          name: "Google AI Studio",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
          api: "google-generative-ai",
          apiKey: "$GEMINI_API_KEY",
          models: [{ ...defaultModel("gemma-4-31b-it"), name: "Gemma 4 31B", input: ["text", "image"], contextWindow: 262144, reasoning: true }],
        },
      };
  }
}

function defaultModel(id: string): PiModelConfig {
  return { id, input: ["text"], reasoning: false, contextWindow: 128000, maxTokens: 16384, cost: { ...EMPTY_COST } };
}

function uniqueProviderId(providers: Record<string, PiModelProviderConfig>, baseId: string): string {
  if (providers[baseId] === undefined) return baseId;
  for (let index = 2; ; index += 1) {
    const candidate = `${baseId}-${String(index)}`;
    if (providers[candidate] === undefined) return candidate;
  }
}

function uniqueModelId(models: readonly PiModelConfig[], baseId: string): string {
  const ids = new Set(models.map((model) => model.id));
  if (!ids.has(baseId)) return baseId;
  for (let index = 2; ; index += 1) {
    const candidate = `${baseId}-${String(index)}`;
    if (!ids.has(candidate)) return candidate;
  }
}

function setProviderOptionalString(provider: PiModelProviderConfig, field: "name" | "baseUrl" | "apiKey" | "api", rawValue: string): void {
  const value = rawValue.trim();
  if (field === "name") {
    if (value === "") delete provider.name;
    else provider.name = value;
  } else if (field === "baseUrl") {
    if (value === "") delete provider.baseUrl;
    else provider.baseUrl = value;
  } else if (field === "apiKey") {
    if (value === "") delete provider.apiKey;
    else provider.apiKey = value;
  } else if (value === "") {
    delete provider.api;
  } else {
    provider.api = value;
  }
}

function setModelOptionalString(model: PiModelConfig, field: "id" | "name" | "api" | "baseUrl", rawValue: string): void {
  const value = rawValue.trim();
  if (field === "id") {
    model.id = value;
  } else if (field === "name") {
    if (value === "") delete model.name;
    else model.name = value;
  } else if (field === "api") {
    if (value === "") delete model.api;
    else model.api = value;
  } else if (value === "") {
    delete model.baseUrl;
  } else {
    model.baseUrl = value;
  }
}

function parseOptionalJsonObject(rawValue: string, label: string): Record<string, unknown> | undefined {
  const value = rawValue.trim();
  if (value === "") return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object.`);
  return parsed;
}

function parseOptionalStringJsonObject(rawValue: string, label: string): NonNullable<PiModelProviderConfig["headers"]> | undefined {
  const parsed = parseOptionalJsonObject(rawValue, label);
  if (parsed === undefined) return undefined;
  const result: NonNullable<PiModelProviderConfig["headers"]> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") throw new Error(`${label}.${key} must be a string.`);
    result[key] = value;
  }
  return result;
}

function parseOptionalModelOverridesJson(rawValue: string): NonNullable<PiModelProviderConfig["modelOverrides"]> | undefined {
  const parsed = parseOptionalJsonObject(rawValue, "modelOverrides");
  if (parsed === undefined) return undefined;
  const result: NonNullable<PiModelProviderConfig["modelOverrides"]> = {};
  for (const [modelId, value] of Object.entries(parsed)) {
    if (!isRecord(value)) throw new Error(`modelOverrides.${modelId} must be an object.`);
    const override: PiModelOverrideConfig = {};
    for (const [key, item] of Object.entries(value)) override[key] = item;
    result[modelId] = override;
  }
  return result;
}

function parseOptionalThinkingLevelMap(rawValue: string): NonNullable<PiModelConfig["thinkingLevelMap"]> | undefined {
  const parsed = parseOptionalJsonObject(rawValue, "thinkingLevelMap");
  if (parsed === undefined) return undefined;
  const result: NonNullable<PiModelConfig["thinkingLevelMap"]> = {};
  for (const [level, value] of Object.entries(parsed)) {
    if (!isThinkingLevel(level)) throw new Error(`thinkingLevelMap has an unsupported level: ${level}.`);
    if (value !== null && typeof value !== "string") throw new Error(`thinkingLevelMap.${level} must be a string or null.`);
    result[level] = value;
  }
  return result;
}

function isThinkingLevel(value: string): value is keyof NonNullable<PiModelConfig["thinkingLevelMap"]> {
  return THINKING_LEVELS.some((level) => level === value);
}

function parseOptionalPositiveNumber(rawValue: string, label: string): number | undefined {
  const value = rawValue.trim();
  if (value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be a positive number.`);
  return parsed;
}

function parseOptionalNonNegativeNumber(rawValue: string, label: string): number | undefined {
  const value = rawValue.trim();
  if (value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number.`);
  return parsed;
}

function jsonText(value: unknown): string {
  return value === undefined ? "" : JSON.stringify(value, null, 2);
}

function numberText(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function providerAdvancedSummary(provider: PiModelProviderConfig): string {
  const parts: string[] = [];
  if (provider.headers !== undefined) parts.push("headers");
  if (provider.compat !== undefined) parts.push("compat");
  if (provider.modelOverrides !== undefined) parts.push("overrides");
  return parts.length === 0 ? "none" : parts.join(" · ");
}

function tokenSummary(value: number | undefined): string {
  return value === undefined ? "inherit/default" : formatCompactNumber(value);
}

function modelRoutingSummary(model: PiModelConfig): string {
  if (model.api !== undefined && model.baseUrl !== undefined) return "api + endpoint";
  if (model.api !== undefined) return "api override";
  if (model.baseUrl !== undefined) return "endpoint override";
  return "inherit provider";
}

function costSummary(cost: Required<PiModelCostConfig> | undefined): string {
  if (cost === undefined) return "not set";
  const values = [cost.input, cost.output, cost.cacheRead, cost.cacheWrite];
  return values.some((value) => value > 0) ? "configured" : "zero/free";
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function cloneConfig(config: PiModelsConfigValues): PiModelsConfigValues {
  return structuredClone(config);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : "";
}

function textAreaValue(event: Event): string {
  return event.target instanceof HTMLTextAreaElement ? event.target.value : "";
}

function checkboxChecked(event: Event): boolean {
  return event.target instanceof HTMLInputElement && event.target.checked;
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  return values.find((value) => value !== undefined && value !== "") ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
