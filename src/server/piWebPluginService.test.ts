import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PiWebPluginService, type PiPackageProvider } from "./piWebPluginService.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "pi-web-plugin-service-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("PiWebPluginService", () => {
  it("discovers local plugins and serves assets", async () => {
    const pluginDir = join(tempDir, "plugins", "info");
    await writePlugin(pluginDir, {
      packageJson: { piWeb: { id: "info", plugin: "pi-web-plugin.js" } },
      files: { "pi-web-plugin.js": "export default { id: 'info' };" },
    });

    const service = new PiWebPluginService({ roots: [{ path: join(tempDir, "plugins"), source: "test", scope: "local" }], packageProvider: false });

    await expect(service.manifest()).resolves.toEqual({
      plugins: [expect.objectContaining({ id: "info", source: "test", scope: "local" })],
    });
    const manifest = await service.manifest();
    expect(manifest.plugins[0]?.module).toMatch(/^\/pi-web-plugins\/info\/pi-web-plugin\.js\?v=\d+$/u);

    const asset = await service.readAsset("info", "pi-web-plugin.js");
    expect(asset?.contentType).toBe("application/javascript; charset=utf-8");
    expect(asset?.content.toString("utf8")).toContain("export default");
  });

  it("discovers Pi package plugins through an injected package provider", async () => {
    const packageDir = join(tempDir, "pkg");
    await writePlugin(packageDir, {
      packageJson: { pi: { piWeb: { plugins: [{ id: "review", module: "dist/review.js" }] } } },
      files: { "dist/review.js": "export default { id: 'review' };" },
    });
    const packageProvider: PiPackageProvider = {
      listPackages: () => [{ source: "npm:@acme/review", scope: "user", installedPath: packageDir }],
      getInstalledPath: () => undefined,
    };

    const service = new PiWebPluginService({ roots: [], packageProvider });

    const manifest = await service.manifest();
    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins[0]).toMatchObject({ id: "review", source: "npm:@acme/review", scope: "user" });
    expect(manifest.plugins[0]?.module).toMatch(/^\/pi-web-plugins\/review\/dist\/review\.js\?v=\d+$/u);
  });

  it("keeps duplicate plugin ids addressable", async () => {
    await writePlugin(join(tempDir, "plugins", "one"), {
      packageJson: { piWeb: { id: "duplicate", plugin: "pi-web-plugin.js" } },
      files: { "pi-web-plugin.js": "export default {};" },
    });
    await writePlugin(join(tempDir, "plugins", "two"), {
      packageJson: { piWeb: { id: "duplicate", plugin: "pi-web-plugin.js" } },
      files: { "pi-web-plugin.js": "export default {};" },
    });

    const service = new PiWebPluginService({ roots: [{ path: join(tempDir, "plugins"), source: "test", scope: "local" }], packageProvider: false });

    const manifest = await service.manifest();
    expect(manifest.plugins.map((plugin) => plugin.id)).toEqual(["duplicate", "duplicate.2"]);
    await expect(service.readAsset("duplicate.2", "pi-web-plugin.js")).resolves.toBeDefined();
  });

  it("rejects unsafe plugin entries and asset traversal", async () => {
    const pluginDir = join(tempDir, "plugins", "safe");
    await writePlugin(pluginDir, {
      packageJson: { piWeb: { id: "safe", plugins: ["../escape.js", "pi-web-plugin.js"] } },
      files: { "pi-web-plugin.js": "export default {};" },
    });
    await writeFile(join(tempDir, "plugins", "escape.js"), "nope");

    const service = new PiWebPluginService({ roots: [{ path: join(tempDir, "plugins"), source: "test", scope: "local" }], packageProvider: false });

    const manifest = await service.manifest();
    expect(manifest.plugins).toHaveLength(1);
    expect(manifest.plugins[0]?.module).toContain("pi-web-plugin.js");
    await expect(service.readAsset("safe", "../escape.js")).resolves.toBeUndefined();
  });
});

async function writePlugin(root: string, options: { packageJson: unknown; files: Record<string, string> }): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "package.json"), `${JSON.stringify(options.packageJson, null, 2)}\n`);
  for (const [path, content] of Object.entries(options.files)) {
    const filePath = join(root, path);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, content);
  }
}
