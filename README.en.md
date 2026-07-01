# PI WEB

[![CI](https://github.com/jmfederico/pi-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jmfederico/pi-web/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@jmfederico/pi-web)](https://www.npmjs.com/package/@jmfederico/pi-web)
[![Node.js](https://img.shields.io/node/v/@jmfederico/pi-web)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Language: [中文](README.md) | English

<p align="center">
  <img src="display_video/pi-web-demo.png" alt="PI WEB interface screenshot" width="100%" />
</p>

<video controls muted playsinline width="100%" src="display_video/pi-web-demo.mov"></video>

<p align="center">
  <a href="display_video/pi-web-demo.mov">▶ Watch the demo recording if it does not play inline</a>
</p>

PI WEB is a web UI for [Pi Coding Agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent). It runs, manages, and resumes persistent Pi Coding Agent sessions in real workspaces. Your browser is the control surface while sessions, terminals, repositories, and build caches stay on your machine, workstation, or server.

- Website and docs: <https://pi-web.dev/>
- npm package: <https://www.npmjs.com/package/@jmfederico/pi-web>
- Repository: <https://github.com/jmfederico/pi-web>

![PI WEB](docs/assets/pi-web-banner.png)

## Project purpose

PI WEB is designed for trusted users and trusted repositories that need long-running browser-supervised AI coding sessions. It organizes work as:

```text
Machine     a local or remote PI WEB runtime endpoint
Project     a folder on that machine
Workspace   a git worktree, or the project folder for non-git projects
Session     a Pi Coding Agent chat running inside a workspace
```

Typical flow: add a project → choose a workspace or git worktree → start a session → let the agent work in the real environment → return later from a browser to inspect or continue.

## Features

Confirmed from the current source, configuration, and documentation:

- Manage persistent Pi Coding Agent sessions that can continue after browser disconnects.
- Manage local projects, git worktrees, and workspaces.
- Inspect file trees, file contents, git state, and workspace activity from the Web UI.
- Proxy agent sessions and terminals through a long-lived session daemon.
- Install, start, stop, restart, inspect status, view logs, and run diagnostics through the CLI.
- Support local and remote PI WEB machines/fleets for projects, files, sessions, terminals, activity, and plugin proxying.
- Support trusted browser-side plugins: action commands, workspace panels, workspace labels, themes, and related UI contributions.
- Ship a Pi extension command and agent skill materials with the package.
- Include npm release metadata, Changesets, CI, and GitHub Actions configuration.

Product roadmap, commercial support, or hosted-service capabilities not confirmed from the current files: to be added.

## Technology stack

- Runtime: Node.js `>=22`, npm.
- Language: TypeScript (ESM).
- Backend/API: Fastify, `@fastify/static`, `@fastify/websocket`.
- Frontend: Vite, Lit, Web Components.
- Editor/terminal UI: CodeMirror, xterm.js, `node-pty`.
- Pi integration: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`.
- Plugins: browser-side ES module plugin API; bundled plugin sources for `info`, `updates`, and `workspace-tasks`.
- Testing and quality: Vitest, ESLint, Knip, TypeScript type checking.
- Release and changelog: Changesets, GitHub Actions, npm package `files` allowlist.

## Directory structure

```text
.
├── .agents/                    # Repository-maintenance agent skills and evaluation data
├── .changeset/                 # Changesets release-note fragments
├── .github/workflows/          # CI and publishing workflows
├── .githooks/                  # Local git hooks
├── display_video/              # Demo screenshot and recording referenced at the top of the READMEs
├── docs/                       # Static website and user-facing docs; docs/assets stores image assets
├── extensions/                 # Pi Coding Agent extension entry point
├── pi-web-plugins/             # Bundled PI WEB plugin sources and tests
├── plugin-api.d.ts             # Published package root plugin API type re-export
├── plugin-api/                 # Published package subpath plugin API type re-exports
├── scripts/                    # Plugin build, screenshot capture, git hook install scripts, and more
├── skills/                     # Agent skills distributed with the package
├── src/
│   ├── cli.ts                  # `pi-web` CLI
│   ├── client/                 # Vite/Lit frontend app and static resources
│   ├── config.ts               # Global PI WEB config loading, merging, and validation
│   ├── plugin-api.ts           # Stable plugin API type definitions
│   ├── plugin-api/             # Unstable plugin API type definitions
│   ├── server/                 # Web/API service, routes, machine proxying, session proxying, terminal proxying, and more
│   ├── sessiond/               # Client config used by Web/API to connect to the session daemon
│   └── shared/                 # Frontend/backend shared types and pure logic
├── install.sh                  # Short script that installs globally and runs `pi-web install`
├── package.json                # npm metadata, scripts, dependencies, and published file allowlist
├── README.en.md                # English README
├── tsconfig*.json              # TypeScript configuration
├── vite.config.ts              # Frontend build and development proxy configuration
└── vitest.config.ts            # Test configuration
```

Generated or local tool/runtime directories are intentionally ignored and are not source organization targets:

```text
node_modules/   # npm dependencies
dist/           # build output; generated and included in the npm package during packaging
.pi/            # local pi/pi-web session or task state
.codegraph/     # local CodeGraph index and daemon state
.pi-web/        # workspace-local runtime uploads and related state
```

## Installation and running

### Requirements

- Node.js 22 or newer.
- npm.
- Pi Coding Agent configured for the current user.
- git and any build/test tools your agents need in target projects.

### Install from npm as user services

```bash
npm install -g @jmfederico/pi-web
pi-web install
pi-web doctor
```

Then open:

```text
http://127.0.0.1:8504
```

Useful CLI commands:

```bash
pi-web status
pi-web logs
pi-web start
pi-web stop
pi-web restart
pi-web websession restart
pi-web doctor
pi-web version
pi-web uninstall
```

For more installation options, see <https://pi-web.dev/install>.

### Run from source for development

```bash
npm install
npm run dev
```

The Vite frontend development port is defined in `vite.config.ts`:

```text
http://localhost:8006
```

For split development, run these in separate terminals:

```bash
npm run dev:sessiond
npm run dev:web
npm run dev:client
```

Recommended validation commands:

```bash
npm run typecheck
npm run lint
npm test
npm run verify
```

Build release artifacts:

```bash
npm run build
npm run pack:dry
```

## Usage

1. Install and start PI WEB.
2. Open PI WEB in a browser.
3. Add a project directory on a local or remote machine.
4. Select the project directory or a git worktree as the workspace.
5. Start a Pi Coding Agent session.
6. Use the UI to inspect files, git state, terminals, workspace activity, and plugin panels.
7. If the browser disconnects, the session remains managed by the session daemon; reopen the browser to continue.

### Plugins

PI WEB plugins are trusted browser-side ES modules. Bundled plugin sources live in `pi-web-plugins/`. The public plugin API types live in `src/plugin-api.ts`, and the published package type entry points are `plugin-api.d.ts` and `plugin-api/unstable.d.ts`.

Plugin documentation:

- <https://pi-web.dev/plugins>
- [`docs/plugins.md`](docs/plugins.md)

### Pi extension and skills

- Pi extension entry point: `extensions/pi-web.ts`
- Distributed skills: `skills/`

## Configuration

PI WEB combines global configuration, project-local configuration, and environment variables.

### Global config

Default paths:

```text
$PI_WEB_CONFIG
$XDG_CONFIG_HOME/pi-web/config.json
~/.config/pi-web/config.json
```

### Project-local config

Commit-able project config:

```text
<project>/.pi-web/config.json
```

Plugins may own separate project files. For example, the bundled Workspace Tasks plugin uses `.pi-web/tasks.json`.

### Managed state directory

PI WEB-managed machine state defaults to:

```text
$PI_WEB_DATA_DIR
~/.pi-web
```

This directory may contain runtime state such as `projects.json`, `machines.json`, logs, and plugin directories. It is not the recommended user-editable configuration API.

### Common config keys

Confirmed core configuration keys include:

- `host`, `port`: Web/API bind host and port.
- `allowedHosts`: allowed hosts for the development service.
- `pathAccess.allowedPaths`: extra roots that the Web UI may read outside a workspace.
- `uploads.defaultFolder`: workspace-relative default folder for manual uploads.
- `maxUploadBytes`: HTTP body/upload size limit.
- `plugins`: plugin enablement and plugin settings.
- `shortcuts`: keyboard shortcut configuration.
- `spawnSessions`: whether agents may use `spawn_session`.
- `subsessions`: whether beta tracked subsession tools are enabled.

Common environment overrides:

- `PI_WEB_HOST`
- `PI_WEB_PORT` / `PORT`
- `PI_WEB_ALLOWED_HOSTS`
- `PI_WEB_MAX_UPLOAD_BYTES`
- `PI_WEB_CONFIG`
- `PI_WEB_DATA_DIR`
- `PI_WEB_SESSIOND_SOCKET`
- `PI_WEB_SESSIOND_PORT`
- `PI_WEB_SESSIOND_HOST`
- `PI_WEB_SESSIOND_URL`
- `PI_WEB_SPAWN_SESSIONS`
- `PI_WEB_SUBSESSIONS`

Full reference: [`docs/config.md`](docs/config.md) or <https://pi-web.dev/config>.

## Notes and cautions

- PI WEB assumes trusted users, repositories, plugins, and server paths.
- It is not a sandbox, permission system, or multi-tenant platform. Do not expose it directly to the public internet without a VPN, SSH tunnel, firewall, or trusted authenticated reverse proxy.
- Plugins run trusted JavaScript in the browser. They can call browser APIs, read workspace files through public helpers, and start terminal commands through public helpers.
- The session daemon is a long-lived runtime; Web/API or browser restarts should not interrupt active sessions.
- Changes to session daemon code or session-daemon-only configuration require restarting the session daemon.
- Changes to Web/API/UI code usually only need the corresponding development service to restart or autoreload.
- `dist/` is generated output. Source changes should happen in `src/`, `pi-web-plugins/`, `extensions/`, `skills/`, `docs/`, and related source directories.
- No `REAME.md` file was found in this repository; the current README file name is correct.

## Original author, maintainer, and this cleanup

- Original author: Federico Jaramillo Martinez (see `package.json` and `LICENSE`).
- Current organizer/maintainer: shuideyimei.
- This update:
  - Reviewed the project structure, key entry points, configuration, plugin boundaries, and documentation boundaries.
  - Removed the root macOS temporary file `.DS_Store`.
  - Added the demo screenshot and recording from `display_video/` to the top of the READMEs.
  - Prepared both the Chinese README and this English `README.en.md`.
  - Expanded the README content with project overview, features, directory structure, installation, usage, technology stack, configuration notes, cautions, and copyright information.
  - Marked unconfirmed information as “to be added”.

## License

MIT © 2026 Federico Jaramillo Martinez. See [`LICENSE`](LICENSE).
