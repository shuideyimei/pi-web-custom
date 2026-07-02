import { DefaultPackageManager, getAgentDir, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { PiPackageInfo, PiPackageInstallResponse, PiPackageScope, PiPackagesResponse } from "../shared/apiTypes.js";

export type { PiPackageInfo, PiPackageInstallResponse, PiPackageScope, PiPackagesResponse } from "../shared/apiTypes.js";

interface ConfiguredPackageRecord {
  source: string;
  scope: PiPackageScope;
  filtered: boolean;
  installedPath?: string;
}

interface PackageManagerLike {
  installAndPersist(source: string, options?: { local?: boolean }): Promise<void>;
  listConfiguredPackages(): ConfiguredPackageRecord[];
}

interface PiPackageServiceOptions {
  cwd?: string;
  agentDir?: string;
  packageManagerFactory?: (cwd: string, agentDir: string) => PackageManagerLike;
}

export interface PiPackageInstallInput {
  source: string;
  scope?: PiPackageScope;
  cwd?: string;
}

interface ParsedInstallSource {
  source: string;
  scopeHint?: PiPackageScope;
}

export class PiPackageService {
  private readonly cwd: string;
  private readonly agentDir: string;
  private readonly packageManagerFactory: (cwd: string, agentDir: string) => PackageManagerLike;

  constructor(options: PiPackageServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.agentDir = options.agentDir ?? getAgentDir();
    this.packageManagerFactory = options.packageManagerFactory ?? ((cwd, agentDir) => new DefaultPackageManager({
      cwd,
      agentDir,
      settingsManager: SettingsManager.create(cwd, agentDir),
    }));
  }

  packages(cwd?: string): Promise<PiPackagesResponse> {
    return Promise.resolve({ packages: this.packageManager(cwd).listConfiguredPackages().map(piPackageInfo) });
  }

  async install(input: PiPackageInstallInput): Promise<PiPackageInstallResponse> {
    const parsed = normalizePiPackageInstallSource(input.source);
    const scope = input.scope ?? parsed.scopeHint ?? "user";
    const manager = this.packageManager(input.cwd);
    await manager.installAndPersist(parsed.source, { local: scope === "project" });
    const packages = manager.listConfiguredPackages().map(piPackageInfo);
    const installedPackage = packages.find((candidate) => candidate.scope === scope && packageSourcesEqual(candidate.source, parsed.source)) ?? {
      source: parsed.source,
      scope,
      filtered: false,
    };
    return { package: installedPackage, packages };
  }

  private packageManager(cwd?: string): PackageManagerLike {
    return this.packageManagerFactory(cwd ?? this.cwd, this.agentDir);
  }
}

export function normalizePiPackageInstallSource(input: string): ParsedInstallSource {
  const trimmed = input.trim().replace(/^\$\s*/u, "");
  if (trimmed === "") throw new Error("Package source is required");

  const installCommand = /^(?:npx\s+)?pi\s+install(?:\s+|$)([\s\S]*)$/u.exec(trimmed);
  const parsed = installCommand === null ? { source: trimmed } : sourceFromInstallCommand(installCommand[1] ?? "");
  const source = normalizeBareNpmPackageSource(parsed.source);
  if (source === "") throw new Error("Package source is required");
  return { source, ...(parsed.scopeHint === undefined ? {} : { scopeHint: parsed.scopeHint }) };
}

function sourceFromInstallCommand(input: string): ParsedInstallSource {
  const tokens = input.trim().split(/\s+/u).filter((token) => token !== "");
  let scopeHint: PiPackageScope | undefined;
  let source = "";
  for (const token of tokens) {
    if (token === "-l" || token === "--local") {
      scopeHint = "project";
      continue;
    }
    if (token === "--approve" || token === "--no-approve") continue;
    if (token.startsWith("-")) continue;
    source ||= stripShellQuotes(token);
  }
  return { source, ...(scopeHint === undefined ? {} : { scopeHint }) };
}

function normalizeBareNpmPackageSource(sourceInput: string): string {
  const source = stripShellQuotes(sourceInput.trim());
  if (source === "") return "";
  if (source.startsWith("npm:") || source.startsWith("git:")) return source;
  if (/^(?:https?|ssh|git):\/\//u.test(source)) return source;
  if (source.startsWith("/") || source.startsWith("./") || source.startsWith("../") || source.startsWith("~")) return source;
  if (/^[A-Za-z]:[\\/]/u.test(source)) return source;
  return `npm:${source}`;
}

function stripShellQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1);
  }
  return value;
}

function piPackageInfo(pkg: ConfiguredPackageRecord): PiPackageInfo {
  return {
    source: pkg.source,
    scope: pkg.scope,
    filtered: pkg.filtered,
    ...(pkg.installedPath === undefined ? {} : { installedPath: pkg.installedPath }),
  };
}

function packageSourcesEqual(left: string, right: string): boolean {
  return left === right || left === normalizeBareNpmPackageSource(right) || normalizeBareNpmPackageSource(left) === right;
}
