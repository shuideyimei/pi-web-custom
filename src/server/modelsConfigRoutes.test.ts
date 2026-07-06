import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFilePiModelsConfigService, currentPiModelsConfigResponse, registerModelsConfigRoutes, type PiModelsConfigService } from "./modelsConfigRoutes.js";
import type { PiModelsConfigResponse, PiModelsConfigValues } from "../shared/apiTypes.js";

let app: FastifyInstance;
let savedConfig: PiModelsConfigValues;
let service: PiModelsConfigService;

beforeEach(async () => {
  savedConfig = { providers: { ollama: { baseUrl: "http://localhost:11434/v1", api: "openai-completions", apiKey: "ollama", models: [{ id: "llama3.1:8b" }] } } };
  service = {
    read: vi.fn(() => responseFor(savedConfig, true)),
    write: vi.fn((config: PiModelsConfigValues) => {
      savedConfig = config;
      return responseFor(savedConfig, true);
    }),
  };
  app = Fastify({ logger: false });
  registerModelsConfigRoutes(app, service);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe("models config routes", () => {
  it("returns the models.json config contract", async () => {
    const response = await app.inject({ method: "GET", url: "/api/models-config" });

    expect(response.statusCode).toBe(200);
    expect(response.json<PiModelsConfigResponse>()).toEqual(responseFor(savedConfig, true));
  });

  it("updates structured provider and model configuration", async () => {
    const config: PiModelsConfigValues = {
      providers: {
        "local-llm": {
          name: "Local",
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "local",
          authHeader: true,
          headers: { "x-route": "dev" },
          compat: { supportsDeveloperRole: false },
          models: [{ id: "model-a", reasoning: true, input: ["text", "image"], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
          modelOverrides: { "gpt-5": { maxTokens: 128000 } },
        },
      },
    };

    const response = await app.inject({ method: "PUT", url: "/api/models-config", payload: { config } });

    expect(response.statusCode).toBe(200);
    expect(savedConfig).toEqual(config);
    expect(response.json<PiModelsConfigResponse>().config).toEqual(config);
  });

  it("updates raw JSON with comments through the same validation path", async () => {
    const raw = `// local models\n{\n  "providers": {\n    "ollama": {\n      "baseUrl": "http://localhost:11434/v1",\n      "api": "openai-completions",\n      "apiKey": "ollama",\n      "models": [{ "id": "qwen2.5-coder:7b" }]\n    }\n  }\n}\n`;

    const response = await app.inject({ method: "PUT", url: "/api/models-config", payload: { raw } });

    expect(response.statusCode).toBe(200);
    expect(savedConfig.providers["ollama"]?.models?.[0]?.id).toBe("qwen2.5-coder:7b");
  });

  it("rejects invalid models config payloads before writing", async () => {
    const response = await app.inject({ method: "PUT", url: "/api/models-config", payload: { config: { providers: { bad: { models: [{ name: "missing id" }] } } } } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toHaveProperty("error");
    expect(service.write).not.toHaveBeenCalled();
  });
});

describe("file models config service", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pi-web-models-config-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads comment-tolerant models.json and writes formatted JSON", async () => {
    const path = join(dir, "models.json");
    writeFileSync(path, `// comment\n{ "providers": { "ollama": { "baseUrl": "http://localhost:11434/v1" } } }\n`, "utf8");
    const fileService = createFilePiModelsConfigService({ path });

    expect(await fileService.read()).toMatchObject({ exists: true, config: { providers: { ollama: { baseUrl: "http://localhost:11434/v1" } } } });

    await fileService.write({ providers: { custom: { api: "openai-completions", baseUrl: "http://localhost:1234/v1", models: [{ id: "model-a" }] } } });

    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ providers: { custom: { api: "openai-completions", baseUrl: "http://localhost:1234/v1", models: [{ id: "model-a" }] } } });
  });

  it("returns raw content and an error for invalid existing models.json", () => {
    const path = join(dir, "models.json");
    writeFileSync(path, `{ "providers": [] }\n`, "utf8");

    const response = currentPiModelsConfigResponse(path);

    expect(response.exists).toBe(true);
    expect(response.config).toEqual({ providers: {} });
    expect(response.raw).toContain("providers");
    expect(response.error).toContain("providers must be an object");
  });
});

function responseFor(config: PiModelsConfigValues, exists: boolean): PiModelsConfigResponse {
  return {
    path: "/tmp/pi/agent/models.json",
    exists,
    config,
    raw: `${JSON.stringify(config, null, 2)}\n`,
  };
}
