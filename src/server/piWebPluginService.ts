import { existsSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultPackageManager, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import { piWebDataDir } from "../config.js";

const pluginIdPattern = /^[a-z][a-z0-9.-]*$/u;
const defaultEntryFile = "pi-web-plugin.js";

export interface PiWebPluginManifest {
  plugins: { id: string; module: string; source: string; scope: PiWebPluginScope }[];
}

export type PiWebPluginScope = "bundled" | "local" | "user" | "project";

export interface ConfiguredPiPackage {
  source: string;
  scope: "user" | "project";
  installedPath?: string;
}

export interface PiPackageProvider {
  listPackages(): ConfiguredPiPackage[];
  getInstalledPath(source: string, scope: "user" | "project"): string | undefined;
}

interface PluginRecord {
  id: string;
  root: string;
  entryFile: string;
  version: string;
  source: string;
  scope: PiWebPluginScope;
}

interface PiWebPluginServiceOptions {
  roots?: LocalPluginRoot[];
  cwd?: string;
  agentDir?: string;
  packageProvider?: PiPackageProvider | false;
}

interface LocalPluginRoot {
  path: string;
  source: string;
  scope: PiWebPluginScope;
}

interface PiWebPackageConfig {
  id?: string;
  plugins: PiWebPluginEntry[];
}

interface PiWebPluginEntry {
  id?: string;
  path: string;
}

type ArraylessPluginRecord = Omit<PluginRecord, "source" | "scope">;

export class DefaultPiPackageProvider implements PiPackageProvider {
  private readonly packageManager: DefaultPackageManager;

  constructor(cwd = process.cwd(), agentDir = getAgentDir()) {
    this.packageManager = new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: SettingsManager.create(cwd, agentDir),
    });
  }

  listPackages(): ConfiguredPiPackage[] {
    return this.packageManager.listConfiguredPackages();
  }

  getInstalledPath(source: string, scope: "user" | "project"): string | undefined {
    return this.packageManager.getInstalledPath(source, scope);
  }
}

export class PiWebPluginService {
  private readonly roots: LocalPluginRoot[];
  private readonly packageProvider: PiPackageProvider | undefined;

  constructor(options: PiWebPluginServiceOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    const agentDir = options.agentDir ?? getAgentDir();
    this.roots = options.roots ?? defaultPluginRoots();
    this.packageProvider = options.packageProvider === false ? undefined : options.packageProvider ?? new DefaultPiPackageProvider(cwd, agentDir);
  }

  async manifest(): Promise<PiWebPluginManifest> {
    const plugins = await this.discoverPlugins();
    return {
      plugins: plugins.map((plugin) => ({
        id: plugin.id,
        module: `/pi-web-plugins/${encodeURIComponent(plugin.id)}/${plugin.entryFile}?v=${encodeURIComponent(plugin.version)}`,
        source: plugin.source,
        scope: plugin.scope,
      })),
    };
  }

  async readAsset(pluginId: string, assetPath: string): Promise<{ content: Buffer; contentType: string } | undefined> {
    if (!pluginIdPattern.test(pluginId)) return undefined;
    const plugin = (await this.discoverPlugins()).find((candidate) => candidate.id === pluginId);
    if (plugin === undefined) return undefined;

    const resolved = resolve(plugin.root, assetPath);
    const [realRoot, realAsset] = await Promise.all([
      realpath(plugin.root),
      realpath(resolved).catch(() => undefined),
    ]);
    if (realAsset === undefined || !isWithin(realRoot, realAsset)) return undefined;

    const assetStat = await stat(realAsset).catch(() => undefined);
    if (assetStat?.isFile() !== true) return undefined;

    return { content: await readFile(realAsset), contentType: contentTypeFor(realAsset) };
  }

  private async discoverPlugins(): Promise<PluginRecord[]> {
    const records = new Map<string, PluginRecord>();
    for (const plugin of await this.discoverLocalPlugins()) addUnique(records, plugin);
    if (this.packageProvider !== undefined) {
      for (const plugin of await this.discoverPiPackagePlugins(this.packageProvider)) addUnique(records, plugin);
    }
    return [...records.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  private async discoverLocalPlugins(): Promise<PluginRecord[]> {
    const plugins: PluginRecord[] = [];
    for (const root of this.roots) plugins.push(...await discoverLocalRoot(root));
    return plugins;
  }

  private async discoverPiPackagePlugins(packageProvider: PiPackageProvider): Promise<PluginRecord[]> {
    const plugins: PluginRecord[] = [];
    for (const configuredPackage of packageProvider.listPackages()) {
      const root = configuredPackage.installedPath ?? packageProvider.getInstalledPath(configuredPackage.source, configuredPackage.scope);
      if (root === undefined) continue;
      plugins.push(...await discoverPackageRoot(root, configuredPackage));
    }
    return plugins;
  }
}

function defaultPluginRoots(): LocalPluginRoot[] {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return [
    { path: join(moduleDir, "..", "..", "pi-web-plugins"), source: "bundled", scope: "bundled" },
    { path: join(piWebDataDir(), "plugins"), source: "local", scope: "local" },
  ];
}

async function discoverLocalRoot(root: LocalPluginRoot): Promise<PluginRecord[]> {
  if (!existsSync(root.path)) return [];
  const entries = await readdir(root.path, { withFileTypes: true }).catch(() => []);
  const plugins: PluginRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !pluginIdPattern.test(entry.name)) continue;
    plugins.push(...await discoverLocalPlugin(join(root.path, entry.name), entry.name, root));
  }
  return plugins;
}

async function discoverLocalPlugin(root: string, fallbackId: string, localRoot: LocalPluginRoot): Promise<PluginRecord[]> {
  const config = await readPiWebPackageConfig(root) ?? { plugins: [{ path: defaultEntryFile }] };
  const plugins = await discoverPluginEntries(root, config, fallbackId);
  return plugins.map((plugin) => ({ ...plugin, source: localRoot.source, scope: localRoot.scope }));
}

async function discoverPackageRoot(root: string, configuredPackage: ConfiguredPiPackage): Promise<PluginRecord[]> {
  const config = await readPiWebPackageConfig(root);
  if (config === undefined) return [];
  const fallbackId = sanitizePluginId(config.id ?? configuredPackage.source);
  const plugins = await discoverPluginEntries(root, config, fallbackId);
  return plugins.map((plugin) => ({ ...plugin, source: configuredPackage.source, scope: configuredPackage.scope }));
}

async function discoverPluginEntries(root: string, config: PiWebPackageConfig, fallbackId: string): Promise<ArraylessPluginRecord[]> {
  const plugins: ArraylessPluginRecord[] = [];
  for (const [index, entry] of config.plugins.entries()) {
    if (!isSafeRelativePath(entry.path)) continue;
    const entryPath = join(root, entry.path);
    const entryStat = await stat(entryPath).catch(() => undefined);
    if (entryStat?.isFile() !== true) continue;
    const id = pluginEntryId(config, entry, fallbackId, index);
    plugins.push({ id, root, entryFile: entry.path, version: String(Math.floor(entryStat.mtimeMs)) });
  }
  return plugins;
}

function pluginEntryId(config: PiWebPackageConfig, entry: PiWebPluginEntry, fallbackId: string, index: number): string {
  if (entry.id !== undefined) return sanitizePluginId(entry.id);
  if (config.id !== undefined && config.plugins.length === 1) return sanitizePluginId(config.id);
  if (config.id !== undefined) return sanitizePluginId(`${config.id}.${basename(entry.path, ".js")}`);
  if (config.plugins.length === 1) return sanitizePluginId(fallbackId);
  return sanitizePluginId(`${fallbackId}.${String(index + 1)}`);
}

async function readPiWebPackageConfig(root: string): Promise<PiWebPackageConfig | undefined> {
  const packagePath = join(root, "package.json");
  const content = await readFile(packagePath, "utf8").catch(() => undefined);
  if (content === undefined) return undefined;
  const parsed: unknown = JSON.parse(content);
  if (!isRecord(parsed)) return undefined;
  const pi = parsed["pi"];
  const piWeb = isRecord(parsed["piWeb"]) ? parsed["piWeb"] : isRecord(pi) && isRecord(pi["piWeb"]) ? pi["piWeb"] : undefined;
  if (!isRecord(piWeb)) return undefined;

  const plugins = parsePluginEntries(piWeb);
  if (plugins.length === 0) return undefined;
  return {
    ...(typeof piWeb["id"] === "string" ? { id: piWeb["id"] } : {}),
    plugins,
  };
}

function parsePluginEntries(piWeb: Record<string, unknown>): PiWebPluginEntry[] {
  const plugin = piWeb["plugin"];
  if (typeof plugin === "string") return [{ path: plugin }];
  const plugins = piWeb["plugins"];
  if (!Array.isArray(plugins)) return [];
  return plugins.flatMap((entry): PiWebPluginEntry[] => {
    if (typeof entry === "string" && entry !== "") return [{ path: entry }];
    if (!isRecord(entry) || typeof entry["module"] !== "string" || entry["module"] === "") return [];
    return [{ path: entry["module"], ...(typeof entry["id"] === "string" ? { id: entry["id"] } : {}) }];
  });
}

function addUnique(records: Map<string, PluginRecord>, plugin: PluginRecord): void {
  if (!records.has(plugin.id)) {
    records.set(plugin.id, plugin);
    return;
  }
  for (let index = 2; ; index += 1) {
    const id = sanitizePluginId(`${plugin.id}.${String(index)}`);
    if (!records.has(id)) {
      records.set(id, { ...plugin, id });
      return;
    }
  }
}

function sanitizePluginId(value: string): string {
  const normalized = value.toLowerCase().replace(/^npm:/u, "").replace(/^git:/u, "").replace(/[^a-z0-9.-]+/gu, ".").replace(/^[^a-z]+/u, "").replace(/[.-]+$/u, "");
  return pluginIdPattern.test(normalized) ? normalized : "plugin";
}

function isSafeRelativePath(path: string): boolean {
  return path !== "" && !path.includes("..") && !path.startsWith("/");
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep));
}

function contentTypeFor(path: string): string {
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
