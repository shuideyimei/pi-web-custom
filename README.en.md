# PI WEB

Language: [中文](README.md) | English

<p align="center">
  <a href="display_video/pi-web-demo.mp4">
    <img src="display_video/pi-web-demo.gif" alt="PI WEB animated demo" width="100%" />
  </a>
</p>

<p align="center">
  <a href="display_video/pi-web-demo.mp4">▶ Watch the MP4 demo recording</a>
</p>

PI WEB is a web console for [Pi Coding Agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent). It starts, supervises, resumes, and manages persistent AI coding sessions in real workspaces. The browser is only the control surface; sessions, terminals, repositories, build caches, and long-running work stay owned by a runtime on your machine, workstation, or server.

Current npm package name: `@jmfederico/pi-web`.

![PI WEB](docs/assets/pi-web-banner.png)

## Use cases

PI WEB is intended for trusted users working in trusted repositories, especially when you need to:

- Supervise one or more Pi Coding Agent sessions from a browser.
- Reconnect to existing sessions after a browser disconnect, refresh, or Web/API restart.
- Inspect chat, files, Git state, terminals, and workspace activity in one UI.
- Manage projects, git worktrees, and sessions on local or remote machines.
- Extend the workspace UI with trusted plugins for panels, commands, labels, and themes.

PI WEB is not a sandbox, permission system, or multi-tenant platform. See [Security and trust model](#security-and-trust-model).

## Core concepts

```text
Machine     a local or remote PI WEB runtime endpoint
Project     a folder on that machine
Workspace   a git worktree, or the project folder for non-git projects
Session     a Pi Coding Agent chat running inside a workspace
```

Typical flow: add a project → choose a workspace or git worktree → start a session → let the agent work in the real environment → return later from a browser to inspect or continue.

## Features

- Persistent Pi Coding Agent sessions: sessions remain managed by the session daemon after browser disconnects.
- Project and workspace management: local projects, remote machines, and git worktrees.
- File tools: inspect the file tree and file contents in the right workspace sidebar, with actions for copying paths, renaming files, and permanently deleting files.
- Git and terminal tools: inspect workspace state, review changes, and proxy terminals through the session daemon.
- Settings and usage: categorized settings, shortcuts, plugin toggles, package installation, and token usage views.
- Plugin system: trusted browser-side ES module plugins can contribute actions, workspace panels, labels, themes, and related UI.
- CLI service management: install, start, stop, restart, inspect status, view logs, and run diagnostics.
- Pi integration: the package includes a Pi extension entry point and agent skill materials.

## Installation

### Requirements

- Node.js 24.18.0 LTS, or a newer Node 24 patch release.
- npm.
- Pi Coding Agent configured for the current user.
- git and any build/test tools needed by your target projects.

### Install from npm

```bash
npm install -g @jmfederico/pi-web
pi-web install
pi-web doctor
```

Default local URL:

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

For more installation details, see the repository-local static docs: [`docs/install.html`](docs/install.html).

## Development from source

```bash
npm install
npm run dev
```

Default frontend development URL:

```text
http://localhost:8006
```

Split development processes:

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

Build and package checks:

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
6. Use the UI to inspect chat, files, Git state, terminals, workspace activity, and plugin panels.
7. If the browser disconnects, reopen it later to continue with the session managed by the session daemon.

## Configuration

PI WEB combines global configuration, project-local configuration, and environment variables.

### Global config

Default paths include:

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

PI WEB-managed runtime state defaults to:

```text
$PI_WEB_DATA_DIR
~/.pi-web
```

This directory may contain `projects.json`, `machines.json`, logs, plugin directories, and other runtime state. It is not the recommended user-editable configuration API.

### Common config keys

- `host`, `port`: Web/API bind host and port.
- `allowedHosts`: allowed hosts for the development service.
- `pathAccess.allowedPaths`: extra roots the Web UI may read outside a workspace.
- `uploads.defaultFolder`: workspace-relative default folder for manual uploads.
- `maxUploadBytes`: HTTP body/upload size limit.
- `plugins`: plugin enablement and plugin settings.
- `shortcuts`: keyboard shortcut configuration.
- `spawnSessions`: whether agents may use `spawn_session`.
- `subsessions`: whether beta tracked subsession tools are enabled.

Common environment overrides:

```text
PI_WEB_HOST
PI_WEB_PORT / PORT
PI_WEB_ALLOWED_HOSTS
PI_WEB_MAX_UPLOAD_BYTES
PI_WEB_CONFIG
PI_WEB_DATA_DIR
PI_WEB_SESSIOND_SOCKET
PI_WEB_SESSIOND_PORT
PI_WEB_SESSIOND_HOST
PI_WEB_SESSIOND_URL
PI_WEB_SPAWN_SESSIONS
PI_WEB_SUBSESSIONS
```

Full configuration reference: [`docs/config.md`](docs/config.md).

## Plugins, extension, and skills

PI WEB plugins are trusted browser-side ES modules. Bundled plugin sources live in `pi-web-plugins/`. The public plugin API types live in `src/plugin-api.ts`, and the published package type entry points are `plugin-api.d.ts` and `plugin-api/unstable.d.ts`.

Plugin docs: [`docs/plugins.md`](docs/plugins.md)

Pi-related entry points:

- Pi extension: `extensions/pi-web.ts`
- Distributed skills: `skills/`

## Directory structure

```text
.
├── display_video/              # Demo image, GIF, and recording used by the READMEs
├── docs/                       # User docs, static site files, and image assets
├── extensions/                 # Pi Coding Agent extension entry point
├── pi-web-plugins/             # Bundled PI WEB plugin sources and tests
├── plugin-api.d.ts             # Published package root plugin API type entry
├── plugin-api/                 # Published package subpath plugin API type entry
├── scripts/                    # Build, screenshot, and development helper scripts
├── skills/                     # Agent skills distributed with the package
├── src/
│   ├── cli.ts                  # `pi-web` CLI
│   ├── client/                 # Vite/Lit frontend app and static resources
│   ├── config.ts               # Config loading, merging, and validation
│   ├── plugin-api.ts           # Stable plugin API type definitions
│   ├── plugin-api/             # Unstable plugin API type definitions
│   ├── server/                 # Web/API, routes, proxying, terminals, and sessiond communication
│   ├── sessiond/               # Client config used by Web/API to connect to the session daemon
│   └── shared/                 # Frontend/backend shared types and pure logic
├── install.sh                  # Script that installs globally and runs `pi-web install`
├── LICENSE                     # Full MIT license text
├── package.json                # npm metadata, scripts, dependencies, and published file allowlist
├── README.en.md                # English README
├── tsconfig*.json              # TypeScript configuration
├── vite.config.ts              # Frontend build and development proxy configuration
└── vitest.config.ts            # Test configuration
```

Generated local directories are normally not edited by hand:

```text
node_modules/   # npm dependencies
dist/           # build output
.pi/            # local pi/pi-web session or task state
.codegraph/     # local CodeGraph index
.pi-web/        # workspace-local uploads and related runtime output
```

## Security and trust model

- PI WEB assumes trusted users, repositories, plugins, and server paths.
- Do not expose it directly to the public internet without a VPN, SSH tunnel, firewall, or trusted authenticated reverse proxy.
- Plugins run trusted JavaScript in the browser. They can call browser APIs, read workspace files through public helpers, and start terminal commands through public helpers.
- The session daemon is a long-lived runtime; Web/API or browser restarts should not interrupt active sessions.
- Changes to session daemon code, or code loaded only by the session daemon, require restarting the session daemon.
- Changes to Web/API/UI code usually only need the corresponding development service to restart or autoreload.

## License and MIT compliance

This project is distributed under the MIT License. The MIT License permits use, copy, modification, merge, publication, distribution, sublicensing, and sale of copies of the software, provided that the copyright notice and permission notice are included in copies or substantial portions of the software.

See the full license text in [`LICENSE`](LICENSE). When distributing this project or a substantial portion of it, keep that license file or an equivalent copyright and license notice with the distribution.
