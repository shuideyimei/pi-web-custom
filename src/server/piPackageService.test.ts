import { describe, expect, it } from "vitest";
import { normalizePiPackageInstallSource, PiPackageService } from "./piPackageService.js";

const configuredPackages = [{ source: "npm:pi-web-access", scope: "project" as const, filtered: false, installedPath: "/tmp/pi-web-access" }];

describe("PiPackageService", () => {
  it("normalizes package names and pasted install commands", () => {
    expect(normalizePiPackageInstallSource("pi-mcp-adapter")).toEqual({ source: "npm:pi-mcp-adapter" });
    expect(normalizePiPackageInstallSource("$ pi install npm:pi-mcp-adapter")).toEqual({ source: "npm:pi-mcp-adapter" });
    expect(normalizePiPackageInstallSource("pi install npm:bigpowers -l")).toEqual({ source: "npm:bigpowers", scopeHint: "project" });
    expect(normalizePiPackageInstallSource("https://github.com/user/repo")).toEqual({ source: "https://github.com/user/repo" });
  });

  it("installs through the package manager and returns the refreshed list", async () => {
    const installed: { source: string; local?: boolean }[] = [];
    const service = new PiPackageService({
      cwd: "/workspace",
      agentDir: "/agent",
      packageManagerFactory: (cwd, agentDir) => {
        expect(cwd).toBe("/project");
        expect(agentDir).toBe("/agent");
        return {
          installAndPersist(source, options) {
            installed.push({ source, ...(options?.local === undefined ? {} : { local: options.local }) });
            return Promise.resolve();
          },
          listConfiguredPackages: () => configuredPackages,
        };
      },
    });

    await expect(service.install({ source: "pi install npm:pi-web-access", scope: "project", cwd: "/project" })).resolves.toEqual({
      package: { source: "npm:pi-web-access", scope: "project", filtered: false, installedPath: "/tmp/pi-web-access" },
      packages: configuredPackages,
    });
    expect(installed).toEqual([{ source: "npm:pi-web-access", local: true }]);
  });
});
