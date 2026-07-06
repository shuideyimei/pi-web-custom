import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { PiModelConfig, PiModelOverrideConfig, PiModelProviderConfig, PiModelsConfigResponse, PiModelsConfigValues } from "../shared/apiTypes.js";

const MODEL_INPUT_TYPES = new Set(["text", "image"]);
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);
const DEFAULT_MODELS_CONFIG = { providers: {} } satisfies PiModelsConfigValues;
const SECURE_JSON_WRITE_OPTIONS = { encoding: "utf8", mode: 0o600 } as const;

export interface PiModelsConfigService {
  read: () => PiModelsConfigResponse | Promise<PiModelsConfigResponse>;
  write: (config: PiModelsConfigValues) => PiModelsConfigResponse | Promise<PiModelsConfigResponse>;
}

export interface ModelsConfigLoadOptions {
  path?: string;
}

export function defaultPiModelsConfigPath(): string {
  return join(getAgentDir(), "models.json");
}

export function createFilePiModelsConfigService(options: ModelsConfigLoadOptions = {}): PiModelsConfigService {
  const path = options.path ?? defaultPiModelsConfigPath();
  return {
    read: () => currentPiModelsConfigResponse(path),
    write: (config) => {
      savePiModelsConfig(config, path);
      return currentPiModelsConfigResponse(path);
    },
  };
}

export function currentPiModelsConfigResponse(path = defaultPiModelsConfigPath()): PiModelsConfigResponse {
  if (!existsSync(path)) return { path, exists: false, config: DEFAULT_MODELS_CONFIG, raw: `${JSON.stringify(DEFAULT_MODELS_CONFIG, null, 2)}\n` };
  const raw = readFileSync(path, "utf8");
  try {
    return { path, exists: true, config: parseModelsConfigJson(raw, path), raw };
  } catch (error) {
    return { path, exists: true, config: DEFAULT_MODELS_CONFIG, raw, error: errorMessage(error) };
  }
}

export function savePiModelsConfig(config: PiModelsConfigValues, path = defaultPiModelsConfigPath()): void {
  const normalized = parseModelsConfigRequest(config);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(normalized, null, 2)}\n`, SECURE_JSON_WRITE_OPTIONS);
  chmodSync(path, 0o600);
}

export function registerModelsConfigRoutes(app: FastifyInstance, service: PiModelsConfigService = createFilePiModelsConfigService()): void {
  app.get("/api/models-config", async (_request, reply) => {
    try {
      return await service.read();
    } catch (error) {
      return reply.code(500).send({ error: errorMessage(error) });
    }
  });

  app.put<{ Body: { config?: unknown; raw?: unknown } | undefined }>("/api/models-config", async (request, reply) => {
    try {
      const body = request.body;
      const config = typeof body?.raw === "string"
        ? parseModelsConfigJson(body.raw, "request")
        : parseModelsConfigRequest(body?.config);
      return await service.write(config);
    } catch (error) {
      const status = isModelsConfigValidationError(error) || isModelsConfigParseError(error) ? 400 : 500;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });
}

function parseModelsConfigJson(raw: string, path: string): PiModelsConfigValues {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch (error) {
    throw new Error(`Failed to parse models.json: ${errorMessage(error)}: ${path}`, { cause: error });
  }
  try {
    return parseModelsConfigRequest(parsed);
  } catch (error) {
    throw new Error(`${errorMessage(error)}: ${path}`, { cause: error });
  }
}

function parseModelsConfigRequest(value: unknown): PiModelsConfigValues {
  if (!isRecord(value)) throw modelsConfigError("models.json config must be an object");
  const providersValue = value["providers"];
  if (!isRecord(providersValue)) throw modelsConfigError("models.json providers must be an object");
  const config: PiModelsConfigValues = { providers: {} };
  for (const [key, item] of Object.entries(value)) {
    if (key !== "providers") config[key] = item;
  }
  for (const [providerId, providerConfig] of Object.entries(providersValue)) {
    if (providerId.trim() === "") throw modelsConfigError("models.json provider ids must be non-empty strings");
    config.providers[providerId] = parseProviderConfig(providerId, providerConfig);
  }
  return config;
}

function parseProviderConfig(providerId: string, value: unknown): PiModelProviderConfig {
  if (!isRecord(value)) throw modelsConfigError(`models.json provider ${providerId} must be an object`);
  const provider: PiModelProviderConfig = {};
  for (const [key, item] of Object.entries(value)) provider[key] = item;
  optionalNonEmptyString(value, "name", `provider ${providerId}`);
  optionalNonEmptyString(value, "baseUrl", `provider ${providerId}`);
  optionalNonEmptyString(value, "apiKey", `provider ${providerId}`);
  optionalNonEmptyString(value, "api", `provider ${providerId}`);
  optionalBoolean(value, "authHeader", `provider ${providerId}`);
  optionalStringRecord(value, "headers", `provider ${providerId}`);
  optionalObject(value, "compat", `provider ${providerId}`);
  const models = value["models"];
  if (models !== undefined) {
    if (!Array.isArray(models)) throw modelsConfigError(`models.json provider ${providerId}.models must be an array`);
    provider.models = models.map((model, index) => parseModelConfig(providerId, index, model));
  }
  const modelOverrides = value["modelOverrides"];
  if (modelOverrides !== undefined) {
    if (!isRecord(modelOverrides)) throw modelsConfigError(`models.json provider ${providerId}.modelOverrides must be an object`);
    const overrides: NonNullable<PiModelProviderConfig["modelOverrides"]> = {};
    for (const [modelId, override] of Object.entries(modelOverrides)) {
      if (modelId.trim() === "") throw modelsConfigError(`models.json provider ${providerId}.modelOverrides keys must be non-empty model ids`);
      overrides[modelId] = parseModelOverrideConfig(providerId, modelId, override);
    }
    provider.modelOverrides = overrides;
  }
  return provider;
}

function parseModelConfig(providerId: string, index: number, value: unknown): PiModelConfig {
  const location = `provider ${providerId}.models[${String(index)}]`;
  if (!isRecord(value)) throw modelsConfigError(`models.json ${location} must be an object`);
  const id = value["id"];
  if (typeof id !== "string" || id.trim() === "") throw modelsConfigError(`models.json ${location}.id must be a non-empty string`);
  optionalModelSharedFields(value, location);
  if (value["cost"] !== undefined) parseCostConfig(value["cost"], location, true);
  const model: PiModelConfig = { id };
  for (const [key, item] of Object.entries(value)) model[key] = item;
  return model;
}

function parseModelOverrideConfig(providerId: string, modelId: string, value: unknown): PiModelOverrideConfig {
  const location = `provider ${providerId}.modelOverrides.${modelId}`;
  if (!isRecord(value)) throw modelsConfigError(`models.json ${location} must be an object`);
  optionalModelSharedFields(value, location);
  if (value["cost"] !== undefined) parseCostConfig(value["cost"], location, false);
  const override: PiModelOverrideConfig = {};
  for (const [key, item] of Object.entries(value)) override[key] = item;
  return override;
}

function optionalModelSharedFields(record: Record<string, unknown>, location: string): void {
  optionalNonEmptyString(record, "name", location);
  optionalNonEmptyString(record, "api", location);
  optionalNonEmptyString(record, "baseUrl", location);
  optionalBoolean(record, "reasoning", location);
  optionalPositiveNumber(record, "contextWindow", location);
  optionalPositiveNumber(record, "maxTokens", location);
  optionalStringRecord(record, "headers", location);
  optionalObject(record, "compat", location);
  parseInputTypes(record["input"], location);
  parseThinkingLevelMap(record["thinkingLevelMap"], location);
}

function optionalNonEmptyString(record: Record<string, unknown>, key: string, location: string): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "string" || value.trim() === "")) throw modelsConfigError(`models.json ${location}.${key} must be a non-empty string`);
}

function optionalBoolean(record: Record<string, unknown>, key: string, location: string): void {
  const value = record[key];
  if (value !== undefined && typeof value !== "boolean") throw modelsConfigError(`models.json ${location}.${key} must be a boolean`);
}

function optionalPositiveNumber(record: Record<string, unknown>, key: string, location: string): void {
  const value = record[key];
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) throw modelsConfigError(`models.json ${location}.${key} must be a positive number`);
}

function optionalObject(record: Record<string, unknown>, key: string, location: string): void {
  const value = record[key];
  if (value !== undefined && !isRecord(value)) throw modelsConfigError(`models.json ${location}.${key} must be an object`);
}

function optionalStringRecord(record: Record<string, unknown>, key: string, location: string): void {
  const value = record[key];
  if (value === undefined) return;
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === "string")) {
    throw modelsConfigError(`models.json ${location}.${key} must be an object with string values`);
  }
}

function parseInputTypes(value: unknown, location: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && MODEL_INPUT_TYPES.has(item))) {
    throw modelsConfigError(`models.json ${location}.input must be an array containing "text" or "image"`);
  }
}

function parseThinkingLevelMap(value: unknown, location: string): void {
  if (value === undefined) return;
  if (!isRecord(value)) throw modelsConfigError(`models.json ${location}.thinkingLevelMap must be an object`);
  for (const [level, mapped] of Object.entries(value)) {
    if (!THINKING_LEVELS.has(level)) throw modelsConfigError(`models.json ${location}.thinkingLevelMap has an unsupported level: ${level}`);
    if (mapped !== null && typeof mapped !== "string") throw modelsConfigError(`models.json ${location}.thinkingLevelMap.${level} must be a string or null`);
  }
}

function parseCostConfig(value: unknown, location: string, requireAllFields: boolean): void {
  if (!isRecord(value)) throw modelsConfigError(`models.json ${location}.cost must be an object`);
  for (const key of ["input", "output", "cacheRead", "cacheWrite"]) {
    const field = value[key];
    if (field === undefined) {
      if (requireAllFields) throw modelsConfigError(`models.json ${location}.cost.${key} must be a number`);
      continue;
    }
    if (typeof field !== "number" || !Number.isFinite(field) || field < 0) throw modelsConfigError(`models.json ${location}.cost.${key} must be a non-negative number`);
  }
}

function stripJsonComments(source: string): string {
  let output = "";
  let inString = false;
  let escaping = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    const next = source.charAt(index + 1);
    if (inString) {
      output += char;
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") {
      inString = true;
      output += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < source.length && source.charAt(index) !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source.charAt(index) === "*" && source.charAt(index + 1) === "/")) {
        if (source.charAt(index) === "\n") output += "\n";
        index += 1;
      }
      index += 1;
      continue;
    }
    output += char;
  }
  return output;
}

function modelsConfigError(message: string): Error {
  return new Error(`PI models config ${message}`);
}

function isModelsConfigValidationError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("PI models config");
}

function isModelsConfigParseError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("Failed to parse models.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
