# PI WEB

语言：中文 | [English](README.en.md)

<p align="center">
  <a href="display_video/pi-web-demo.mp4">
    <img src="display_video/pi-web-demo.gif" alt="PI WEB 演示动图" width="100%" />
  </a>
</p>

<p align="center">
  <a href="display_video/pi-web-demo.mp4">▶ 查看 MP4 演示录屏</a>
</p>

PI WEB 是一个面向 [Pi Coding Agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) 的 Web 控制台，用于在真实工作区中启动、监督、恢复和管理持久化 AI 编码会话。浏览器只作为控制界面；会话、终端、仓库、构建缓存和长时间任务由本机、工作站或服务器上的运行时继续持有。

当前 npm 包名：`@jmfederico/pi-web`。

![PI WEB](docs/assets/pi-web-banner.png)

## 适用场景

PI WEB 适合可信用户在可信代码库中运行长时间编码任务，例如：

- 从浏览器监督一个或多个 Pi Coding Agent 会话。
- 在浏览器断开、刷新或 Web/API 服务重启后继续查看已有会话。
- 在同一个界面中查看聊天、文件、Git 状态、终端和 workspace 活动。
- 在本机或远程机器上管理项目、git worktree 和会话。
- 使用可信插件扩展 workspace 面板、命令、标签和主题。

PI WEB 不是沙箱、权限系统或多租户平台；安全边界见[安全与信任模型](#安全与信任模型)。

## 核心概念

```text
Machine     本地或远程 PI WEB 运行端点
Project     某台 machine 上的项目目录
Workspace   git worktree；非 git 项目则为项目目录本身
Session     在某个 workspace 中运行的 Pi Coding Agent 聊天会话
```

典型流程：添加项目 → 选择 workspace 或 git worktree → 启动 session → 让 agent 在真实环境中工作 → 稍后从浏览器继续查看或接管。

## 功能概览

- 持久化 Pi Coding Agent 会话：浏览器断开后，会话仍由 session daemon 管理。
- 项目与 workspace 管理：支持本地项目、远程 machine 和 git worktree。
- 文件工具：在右侧 workspace sidebar 中查看文件树和文件内容，支持复制路径、重命名和永久删除文件。
- Git 与终端：查看工作区状态、审阅变更，并通过 session daemon 代理终端。
- 设置与使用量：提供分类设置面板、快捷键配置、插件开关、包安装入口和 token 使用量视图。
- 插件系统：支持可信浏览器侧 ES module 插件贡献 action、workspace panel、label、theme 等能力。
- CLI 服务管理：安装、启动、停止、重启、查看状态、查看日志和运行诊断。
- Pi 集成：随包提供 Pi extension 入口和 agent skill 资料。

## 安装

### 前置条件

- Node.js 24.18.0 LTS（Node 24）或更新的 Node 24 补丁版本。
- npm。
- 当前用户已配置 Pi Coding Agent。
- git，以及目标项目需要的构建/测试工具。

### 从 npm 安装

```bash
npm install -g @jmfederico/pi-web
pi-web install
pi-web doctor
```

默认本机访问地址：

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

更多安装细节也可以查看仓库内静态文档：[`docs/install.html`](docs/install.html)。

## 从源码开发

```bash
npm install
npm run dev
```

开发模式下前端默认地址：

```text
http://localhost:8006
```

分拆运行：

```bash
npm run dev:sessiond
npm run dev:web
npm run dev:client
```

常用验证命令：

```bash
npm run typecheck
npm run lint
npm test
npm run verify
```

构建和打包预检：

```bash
npm run build
npm run pack:dry
```

## 使用方法

1. 安装并启动 PI WEB。
2. 在浏览器中打开 PI WEB。
3. 添加本机或远程 machine 上的项目目录。
4. 选择项目目录或 git worktree 作为 workspace。
5. 启动 Pi Coding Agent session。
6. 使用 UI 查看聊天、文件、Git 状态、终端、workspace 活动和插件面板。
7. 浏览器断开后，重新打开即可继续查看由 session daemon 管理的会话。

## 配置

PI WEB 组合读取全局配置、项目本地配置和环境变量。

### 全局配置

默认读取顺序包括：

```text
$PI_WEB_CONFIG
$XDG_CONFIG_HOME/pi-web/config.json
~/.config/pi-web/config.json
```

### 项目本地配置

可提交到项目仓库的配置文件：

```text
<project>/.pi-web/config.json
```

插件可以拥有独立项目配置文件，例如内置 Workspace Tasks 插件使用 `.pi-web/tasks.json`。

### 管理状态目录

PI WEB 管理的运行状态默认位于：

```text
$PI_WEB_DATA_DIR
~/.pi-web
```

该目录可能包含 `projects.json`、`machines.json`、日志和插件目录等运行状态；它不是推荐给用户直接编辑的配置 API。

### 常用配置项

- `host`、`port`：Web/API 监听地址和端口。
- `allowedHosts`：开发服务允许访问的 host。
- `pathAccess.allowedPaths`：允许 Web UI 在 workspace 外读取的额外根路径。
- `uploads.defaultFolder`：手动上传时的 workspace 相对默认目录。
- `maxUploadBytes`：HTTP 请求体/上传大小限制。
- `plugins`：插件启用状态和插件设置。
- `shortcuts`：键盘快捷键配置。
- `spawnSessions`：是否允许 agent 使用 `spawn_session`。
- `subsessions`：是否启用 beta tracked subsession 工具。

常用环境变量覆盖：

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

完整配置参考：[`docs/config.md`](docs/config.md)。

## 插件、扩展与 skills

PI WEB 插件是可信浏览器侧 ES module。内置插件源码位于 `pi-web-plugins/`，公共插件 API 类型位于 `src/plugin-api.ts`，发布包类型入口为 `plugin-api.d.ts` 和 `plugin-api/unstable.d.ts`。

插件文档：[`docs/plugins.md`](docs/plugins.md)

Pi 相关入口：

- Pi extension：`extensions/pi-web.ts`
- 随包分发的 skills：`skills/`

## 目录结构

```text
.
├── display_video/              # README 使用的演示图片、GIF 和录屏
├── docs/                       # 用户文档、静态站点文件和图片资源
├── extensions/                 # Pi Coding Agent extension 入口
├── pi-web-plugins/             # 内置 PI WEB 插件源码与测试
├── plugin-api.d.ts             # 发布包根级插件 API 类型入口
├── plugin-api/                 # 发布包子路径插件 API 类型入口
├── scripts/                    # 构建、截图和开发辅助脚本
├── skills/                     # 随包分发的 agent skills
├── src/
│   ├── cli.ts                  # `pi-web` CLI
│   ├── client/                 # Vite/Lit 前端应用与静态资源
│   ├── config.ts               # 配置读取、合并与校验
│   ├── plugin-api.ts           # 稳定插件 API 类型定义
│   ├── plugin-api/             # 不稳定插件 API 类型定义
│   ├── server/                 # Web/API、路由、代理、终端和 sessiond 通信
│   ├── sessiond/               # Web/API 连接 session daemon 的客户端配置
│   └── shared/                 # 前后端共享类型与纯逻辑
├── install.sh                  # 全局安装并执行 `pi-web install` 的脚本
├── LICENSE                     # MIT 许可全文
├── package.json                # npm 元数据、脚本、依赖与发布文件白名单
├── README.en.md                # 英文 README
├── tsconfig*.json              # TypeScript 配置
├── vite.config.ts              # 前端构建和开发代理配置
└── vitest.config.ts            # 测试配置
```

本地生成目录通常不应手动维护：

```text
node_modules/   # npm 依赖
dist/           # 构建产物
.pi/            # pi/pi-web 本地会话或任务状态
.codegraph/     # CodeGraph 本地索引
.pi-web/        # workspace 内上传等运行产物
```

## 安全与信任模型

- PI WEB 假设用户、代码库、插件和服务器路径都是可信的。
- 不要在没有 VPN、SSH 隧道、防火墙或可信认证反向代理保护的情况下直接暴露到公网。
- 插件在浏览器中运行可信 JavaScript，可以调用浏览器 API、读取 workspace 文件，并通过公开 helper 启动终端命令。
- session daemon 是长生命周期运行时；Web/API 或浏览器重启不应中断活跃会话。
- 修改 session daemon 相关代码或只由 session daemon 加载的代码后，需要重启 session daemon 才会生效。
- 修改 Web/API/UI 侧代码通常只需要重启或等待对应开发服务自动重载。

## 许可与 MIT 合规说明

本项目按 MIT License 发布。MIT License 允许任何人使用、复制、修改、合并、发布、分发、再许可和销售本软件副本，但要求在软件副本或其实质部分中保留版权声明和许可声明。

完整许可文本见 [`LICENSE`](LICENSE)。分发本项目或其重要部分时，请一并保留该许可文件或等效的版权与许可声明。
