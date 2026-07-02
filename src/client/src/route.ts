import type { QualifiedContributionId } from "./plugins/types";

export interface AppRoute {
  machineId: string | undefined;
  projectId: string | undefined;
  workspaceId: string | undefined;
  sessionId: string | undefined;
  tool: QualifiedContributionId | undefined;
  view: "chat" | "home" | QualifiedContributionId | undefined;
}

export function readRoute(): AppRoute {
  const params = new URLSearchParams(window.location.search);
  const usageRoute = isUsageRoute(window.location.pathname);
  return {
    machineId: params.get("machine") ?? undefined,
    projectId: params.get("project") ?? undefined,
    workspaceId: params.get("workspace") ?? undefined,
    sessionId: usageRoute ? undefined : params.get("session") ?? undefined,
    tool: usageRoute ? undefined : parseTool(params.get("tool")),
    view: usageRoute ? "home" : parseView(params.get("view")),
  };
}

export function writeRoute(route: AppRoute, options?: { replace?: boolean | undefined }): void {
  const url = new URL(window.location.href);
  if (route.view === "home") url.pathname = "/usage";
  else if (isUsageRoute(url.pathname)) url.pathname = "/";
  url.searchParams.delete("machine");
  url.searchParams.delete("project");
  url.searchParams.delete("workspace");
  url.searchParams.delete("session");
  url.searchParams.delete("tool");
  url.searchParams.delete("view");
  if (route.machineId !== undefined && route.machineId !== "" && route.machineId !== "local") url.searchParams.set("machine", route.machineId);
  if (route.projectId !== undefined && route.projectId !== "") url.searchParams.set("project", route.projectId);
  if (route.workspaceId !== undefined && route.workspaceId !== "") url.searchParams.set("workspace", route.workspaceId);
  if (route.view !== "home" && route.sessionId !== undefined && route.sessionId !== "") url.searchParams.set("session", route.sessionId);
  if (route.view !== "home" && route.tool !== undefined) url.searchParams.set("tool", route.tool);
  if (route.view !== undefined && route.view !== "home") url.searchParams.set("view", route.view);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (options?.replace === true) window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}

function isUsageRoute(pathname: string): boolean {
  return pathname.replace(/\/+$/u, "") === "/usage";
}

function parseTool(value: string | null): QualifiedContributionId | undefined {
  if (value === "files") return "core:workspace.files";
  if (value === "git") return "core:workspace.git";
  return isQualifiedId(value) ? value : undefined;
}

function parseView(value: string | null): "chat" | "home" | QualifiedContributionId | undefined {
  if (value === "chat") return "chat";
  if (value === "home") return "home";
  if (value === "files") return "core:workspace.files";
  if (value === "git") return "core:workspace.git";
  return isQualifiedId(value) ? value : undefined;
}

function isQualifiedId(value: string | null): value is QualifiedContributionId {
  return value !== null && /^[a-z][a-z0-9.-]*:[a-z][a-z0-9.-]*$/u.test(value);
}
