# PI WEB

[![CI](https://github.com/jmfederico/pi-web/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/jmfederico/pi-web/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@jmfederico/pi-web)](https://www.npmjs.com/package/@jmfederico/pi-web)
[![Node.js](https://img.shields.io/node/v/@jmfederico/pi-web)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

语言：中文 | [English](README.en.md)

<p align="center">
  <img src="display_video/pi-web-demo.png" alt="PI WEB 界面截图" width="100%" />
</p>

<video controls muted playsinline width="100%" src="display_video/pi-web-demo.mp4"></video>

<p align="center">
  <a href="display_video/pi-web-demo.mp4">▶ 无法直接播放时，点击查看演示录屏</a>
</p>

PI WEB 是 [Pi Coding Agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) 的 Web UI，用于在真实工作区中运行、管理和恢复持久化的 Pi Coding Agent 会话。它让浏览器成为控制界面，而会话、终端、仓库和构建缓存留在本机、工作站或服务器上持续运行。

- 网站与文档：<https://pi-web.dev/>
- npm 包：<https://www.npmjs.com/package/@jmfederico/pi-web>
- 仓库：<https://github.com/jmfederico/pi-web>

![PI WEB](docs/assets/pi-web-banner.png)

## 项目用途

PI WEB 面向可信用户和可信代码库，解决在浏览器中长期监督 AI 编码会话的问题。它将工作组织为：

```text
Machine     本地或远程 PI WEB 运行端点
Project     该机器上的项目目录
Workspace   git worktree；非 git 项目则为项目目录本身
Session     在某个 workspace 中运行的 Pi Coding Agent 聊天会话
```

典型流程：添加项目 → 选择 workspace 或 git worktree → 启动会话 → 让 agent 在真实环境中工作 → 稍后从浏览器继续查看或接管。

## 功能

根据当前源码、配置和文档可确认的功能包括：

- 管理 Pi Coding Agent 持久会话，支持浏览器断开后继续运行。
- 管理本地项目、git worktree 和工作区。
- 在 Web UI 中查看文件树、文件内容、git 状态和工作区活动。
- 通过会话守护进程（session daemon）代理 agent 会话和终端。
- 通过 CLI 安装、启动、停止、重启、查看状态、查看日志和诊断服务。
- 支持本地和远程 PI WEB machine/fleet 的项目、文件、会话、终端与插件代理。
- 支持可信浏览器侧插件：动作命令、workspace 面板、workspace 标签和主题等。
- 随包提供 Pi 扩展命令与 agent skill 资料。
- 提供 npm 发布所需的构建产物声明、Changesets、CI 和 GitHub Actions 配置。

未从当前文件确认的产品规划、商业支持或托管服务能力：待补充。

## 技术栈

- 运行时：Node.js `>=22`、npm。
- 语言：TypeScript（ESM）。
- 后端/API：Fastify、`@fastify/static`、`@fastify/websocket`。
- 前端：Vite、Lit、Web Components。
- 编辑器/终端 UI：CodeMirror、xterm.js、`node-pty`。
- Pi 集成：`@earendil-works/pi-coding-agent`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`。
- 插件：浏览器侧 ES module 插件 API，仓库内置 `info`、`updates`、`workspace-tasks` 插件源码。
- 测试与质量：Vitest、ESLint、Knip、TypeScript typecheck。
- 发布与变更：Changesets、GitHub Actions、npm package `files` 白名单。

## 目录结构

```text
.
├── .agents/                    # 仓库维护用 agent skill 与评测资料
├── .changeset/                 # Changesets 变更记录片段
├── .github/workflows/          # CI 与发布工作流
├── .githooks/                  # 本地 git hooks
├── display_video/              # README 顶部引用的演示截图与录屏
├── docs/                       # 静态网站与发布给用户的文档；docs/assets 存放图片资源
├── extensions/                 # Pi Coding Agent 扩展入口
├── pi-web-plugins/             # 内置 PI WEB 插件源码与测试
├── plugin-api.d.ts             # 发布包根级插件 API 类型转发入口
├── plugin-api/                 # 发布包子路径插件 API 类型转发入口
├── scripts/                    # 构建插件、截图、安装 git hooks 等脚本
├── skills/                     # 随包分发的 agent skills
├── src/
│   ├── cli.ts                  # `pi-web` CLI
│   ├── client/                 # Vite/Lit 前端应用与静态资源
│   ├── config.ts               # 全局 PI WEB 配置读取、合并与校验
│   ├── plugin-api.ts           # 稳定插件 API 类型定义
│   ├── plugin-api/             # 不稳定插件 API 类型定义
│   ├── server/                 # Web/API 服务、路由、机器代理、会话代理、终端代理等
│   ├── sessiond/               # Web/API 连接 session daemon 的客户端配置
│   └── shared/                 # 前后端共享类型与纯逻辑
├── install.sh                  # 全局安装并执行 `pi-web install` 的简短脚本
├── package.json                # npm 包元数据、脚本、依赖与发布文件白名单
├── README.en.md                # 英文 README
├── tsconfig*.json              # TypeScript 配置
├── vite.config.ts              # 前端构建和开发代理配置
└── vitest.config.ts            # 测试配置
```

本地生成或工具状态目录不属于源码整理目标，默认被忽略：

```text
node_modules/   # npm 依赖
dist/           # 构建产物；发布打包时生成并纳入 npm 包
.pi/            # pi/pi-web 本地会话或任务状态
.codegraph/     # CodeGraph 本地索引与守护进程状态
.pi-web/        # 工作区内上传等本地运行产物
```

## 安装与运行

### 前置条件

- Node.js 22 或更新版本。
- npm。
- 已为当前用户配置 Pi Coding Agent。
- git，以及 agent 在目标项目中需要使用的构建/测试工具。

### 从 npm 安装为用户服务

```bash
npm install -g @jmfederico/pi-web
pi-web install
pi-web doctor
```

然后打开：

```text
http://127.0.0.1:8504
```

常用 CLI：

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

更多安装方式见：<https://pi-web.dev/install>

### 从源码开发运行

```bash
npm install
npm run dev
```

开发模式下 Vite 前端默认端口来自 `vite.config.ts`：

```text
http://localhost:8006
```

分拆运行时可在独立终端中执行：

```bash
npm run dev:sessiond
npm run dev:web
npm run dev:client
```

建议验证命令：

```bash
npm run typecheck
npm run lint
npm test
npm run verify
```

构建发布产物：

```bash
npm run build
npm run pack:dry
```

## 使用方法

1. 安装并启动 PI WEB。
2. 在浏览器中打开 PI WEB。
3. 添加一个本机或远程 machine 上的项目目录。
4. 选择项目主目录或 git worktree 作为 workspace。
5. 启动 Pi Coding Agent session。
6. 根据需要查看文件、git 状态、终端、workspace 活动和插件面板。
7. 浏览器断开后，会话仍由 session daemon 管理；重新打开浏览器后继续查看。

### 插件

PI WEB 插件是可信浏览器侧 ES module。内置插件源码位于 `pi-web-plugins/`，公共插件 API 类型位于 `src/plugin-api.ts`，发布包类型入口为 `plugin-api.d.ts` 和 `plugin-api/unstable.d.ts`。

插件文档：

- <https://pi-web.dev/plugins>
- [`docs/plugins.md`](docs/plugins.md)

### Pi 扩展与 skills

- Pi 扩展入口：`extensions/pi-web.ts`
- 随包 skills：`skills/`

## 配置说明

PI WEB 使用全局配置、项目本地配置和环境变量共同决定运行行为。

### 全局配置

默认路径：

```text
$PI_WEB_CONFIG
$XDG_CONFIG_HOME/pi-web/config.json
~/.config/pi-web/config.json
```

### 项目本地配置

可提交到仓库的项目级配置：

```text
<project>/.pi-web/config.json
```

插件可以拥有独立项目文件，例如内置 Workspace Tasks 插件使用 `.pi-web/tasks.json`。

### 管理状态目录

PI WEB 管理的机器状态默认位于：

```text
$PI_WEB_DATA_DIR
~/.pi-web
```

该目录可能包含 `projects.json`、`machines.json`、日志、插件目录等运行状态；它不是推荐给用户直接编辑的配置 API。

### 常用配置键

可确认的核心配置项包括：

- `host`、`port`：Web/API 监听地址与端口。
- `allowedHosts`：开发服务允许访问的 host。
- `pathAccess.allowedPaths`：允许 Web UI 在 workspace 外读取的额外根路径。
- `uploads.defaultFolder`：手动上传的 workspace 相对默认目录。
- `maxUploadBytes`：HTTP 请求体/上传大小限制。
- `plugins`：插件启用状态和插件设置。
- `shortcuts`：键盘快捷键配置。
- `spawnSessions`：是否允许 agent 使用 `spawn_session`。
- `subsessions`：是否启用 beta tracked subsession 工具。

常用环境变量覆盖：

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

完整参考见 [`docs/config.md`](docs/config.md) 或 <https://pi-web.dev/config>。

## 注意事项

- PI WEB 假设用户、代码库、插件和服务器路径都是可信的。
- 它不是沙箱、权限系统或多租户平台；不要在没有 VPN、SSH 隧道、防火墙或可信反向代理保护的情况下直接暴露到公网。
- 插件在浏览器中运行可信 JavaScript，可以调用浏览器 API、读取 workspace 文件并通过公开 helper 启动终端命令。
- session daemon 是长生命周期运行时；Web/API 或浏览器重启不应中断活跃会话。
- 修改 session daemon 相关代码或配置后，需要重启 session daemon 才会生效。
- 修改 Web/API/UI 侧代码通常只需要重启或等待对应开发服务自动重载。
- `dist/` 是生成目录；源码改动应发生在 `src/`、`pi-web-plugins/`、`extensions/`、`skills/`、`docs/` 等源目录。
- 当前仓库中没有发现 `REAME.md`；现有 README 文件名正确。

## 原作者、维护者与本次整理

- 原作者：Federico Jaramillo Martinez（见 `package.json` 与 `LICENSE`）。
- 当前整理/维护者：shuideyimei。
- 本次修改内容：
  - 检查项目结构、关键入口、配置、插件与文档边界。
  - 清理根目录 macOS 临时文件 `.DS_Store`。
  - 将 `display_video/` 中的演示截图和录屏放到 README 开头。
  - 准备中文 README 与英文 `README.en.md`。
  - 补全 README 的项目简介、功能、目录结构、安装运行、使用方法、技术栈、配置说明、注意事项和版权信息。
  - 明确记录未能确认的信息为“待补充”。

## 版权信息

MIT © 2026 Federico Jaramillo Martinez。详见 [`LICENSE`](LICENSE)。
