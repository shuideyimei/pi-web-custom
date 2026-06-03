import type { FastifyInstance } from "fastify";
import { effectivePiWebConfig, loadPiWebConfig, savePiWebConfig, type LoadOptions, type PiWebConfig } from "../config.js";
import type { PiWebConfigEnvOverrides, PiWebConfigResponse, PiWebConfigValues } from "../shared/apiTypes.js";

export interface PiWebConfigService {
  read: () => PiWebConfigResponse | Promise<PiWebConfigResponse>;
  write: (config: PiWebConfigValues) => PiWebConfigResponse | Promise<PiWebConfigResponse>;
}

export function createFilePiWebConfigService(options: LoadOptions = {}): PiWebConfigService {
  return {
    read: () => currentPiWebConfigResponse(options),
    write: (config) => {
      savePiWebConfig(config, options);
      return currentPiWebConfigResponse(options);
    },
  };
}

export function currentPiWebConfigResponse(options: LoadOptions = {}): PiWebConfigResponse {
  const loaded = loadPiWebConfig(options);
  const effective = effectivePiWebConfig(options);
  const env = options.env ?? process.env;
  return {
    path: loaded.path,
    exists: loaded.exists,
    config: loaded.config,
    effectiveConfig: effective.config,
    envOverrides: piWebConfigEnvOverrides(env),
  };
}

export function registerConfigRoutes(app: FastifyInstance, service: PiWebConfigService = createFilePiWebConfigService()): void {
  app.get("/api/config", async (_request, reply) => {
    try {
      return await service.read();
    } catch (error) {
      return reply.code(500).send({ error: errorMessage(error) });
    }
  });

  app.put<{ Body: { config?: unknown } | undefined }>("/api/config", async (request, reply) => {
    try {
      return await service.write(parseConfigRequest(request.body?.config));
    } catch (error) {
      const status = isConfigValidationError(error) ? 400 : 500;
      return reply.code(status).send({ error: errorMessage(error) });
    }
  });
}

function parseConfigRequest(value: unknown): PiWebConfig {
  if (!isRecord(value)) throw new Error("PI WEB config update must include a config object");
  const config: PiWebConfig = {};
  const host = value["host"];
  const port = value["port"];
  const allowedHosts = value["allowedHosts"];
  if (host !== undefined) {
    if (typeof host !== "string") throw new Error("PI WEB config host must be a string");
    config.host = host;
  }
  if (port !== undefined) {
    if (typeof port !== "number") throw new Error("PI WEB config port must be a number");
    config.port = port;
  }
  if (allowedHosts !== undefined) config.allowedHosts = parseAllowedHostsRequest(allowedHosts);
  return config;
}

function parseAllowedHostsRequest(value: unknown): string[] | true {
  if (value === true) return true;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("PI WEB config allowedHosts must be true or an array of strings");
  }
  return value;
}

function piWebConfigEnvOverrides(env: NodeJS.ProcessEnv): PiWebConfigEnvOverrides {
  return {
    host: isEnvSet(env["PI_WEB_HOST"]),
    port: isEnvSet(env["PI_WEB_PORT"]) || isEnvSet(env["PORT"]),
    allowedHosts: isEnvSet(env["PI_WEB_ALLOWED_HOSTS"]),
  };
}

function isEnvSet(value: string | undefined): boolean {
  return value !== undefined && value !== "";
}

function isConfigValidationError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("PI WEB config");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
