# Sub-Store Desktop

[Русский](README.md) | [English](README.en.md) | **简体中文**

Sub-Store 桌面客户端，安装后即可使用。应用通过 Electron 在本地运行官方 Sub-Store 前端和后端，用户无需安装 Node.js、Docker 或浏览器扩展。

## 与 shiteThings/sub-store-gui 的区别

- **优先使用局域网地址：** 应用首先监听当前网络接口可用的私有 IPv4 地址，使 Sub-Store 可以从局域网访问。如果没有可用的私有地址，则使用 `127.0.0.1`。
- **应用内组件更新：** 前端和后端可以独立于桌面应用进行更新。版本检查最多每 8 小时执行一次。
- **用户目录存储：** Sub-Store 数据，包括更新后的前端和后端组件，存储在用户目录中，而不是安装目录中。
- **完整性检查：** 下载的组件会通过 SHA-256 校验；安装后还会再次检查 manifest、后端以及前端文件树。
- **桌面集成：** fork 增加了系统菜单、独立的更新窗口以及安装完成后的重启功能。

## 当前功能

- 内置官方 Sub-Store GUI 和 Node.js 后端
- 优先监听当前局域网的私有 IPv4 地址；没有网络连接时回退到 `127.0.0.1`
- 使用随机 API 路径，并限制后端 CORS 来源
- 支持在应用内更新前端和后端，并将组件存储在用户目录中
- 将订阅、合并订阅、脚本、文件和同步设置保存到应用用户数据目录
- 支持构建 Windows、macOS 和 Linux 版本（x64 和 ARM64）
- 固定 upstream 组件版本，并通过 SHA-256 进行校验

当前固定版本：Sub-Store `2.38.2`，Sub-Store Front End `2.31.2`。详情请参阅 [`vendor-lock.json`](vendor-lock.json)。

## 架构

```text
Electron 主进程

  ├─ BrowserWindow（启用沙箱，无 Node.js 访问权限）
  │
  └─ Utility Process
       │
       └─ 官方 Sub-Store bundle
            ├─ 本地静态前端
            ├─ 本地 API
            └─ 用户数据目录
```

项目使用 electron-builder 支持的两个 `package.json` 文件：根目录负责开发和构建，`app/package.json` 是不包含开发依赖的最小运行时包。

前端和 API 在当前局域网的私有 IPv4 地址上使用同一个随机端口。如果没有可用地址，应用使用 `127.0.0.1`。API 还会使用首次启动时生成的随机路径。地址、端口和路径保存在 `desktop-runtime.json` 中，只有当前用户可读取。

## 开发

需要 Node.js 22 或更高版本。

```bash
npm install

npm run dev
```

首次运行 `npm run dev` 时，应用会下载并校验 `vendor-lock.json` 中固定的官方发行包。也可以分别执行以下命令：

```bash
npm run vendor:sync

npm run vendor:verify

npm test
```

## 构建

请在对应操作系统上执行：

```bash
npm run dist:win

npm run dist:mac

npm run dist:linux
```

构建产物位于 `release/` 目录。

GitHub Actions 会在三个原生操作系统上执行构建，并生成 x64 和 ARM64 安装包。

正式发布前，请将 `package.json` 中维护者的占位邮箱替换为项目邮箱，并配置 Windows 代码签名以及 macOS Apple Developer ID 签名和公证。未签名的安装包可能会触发操作系统安全警告。

## 用户数据

应用不会将订阅数据写入安装目录。默认使用 Electron 的 `userData` 目录：

- Windows：`%APPDATA%/Sub-Store Desktop/sub-store/data`
- macOS：`~/Library/Application Support/Sub-Store Desktop/sub-store/data`
- Linux：`~/.config/Sub-Store Desktop/sub-store/data`

通过 NSIS 卸载应用时，用户数据默认会保留。

日志位于 `userData/logs/sub-store.log`。日志超过 5 MiB 后，会保留一个轮换备份文件。

在 production 环境中，`vendor` 目录和 `vendor-lock.json` 也存储在 `userData/sub-store` 中，而不是安装目录中。因此无需管理员权限即可更新前端和后端。安装包中的内置副本仅用于首次初始化或恢复损坏的文件。

## 更新 upstream 版本

修改 `vendor-lock.json` 中的版本、URL 和校验和，然后执行：

```bash
npm run vendor:sync

npm run vendor:verify
```

不要将 `resources/vendor` 中的二进制发行文件加入 Git。CI 会根据 lock 文件重新下载并校验这些文件。

安装包还包含本项目的对应源代码以及 upstream 组件的许可证文本。用户可以通过应用的“帮助”菜单直接打开源代码目录。

## 许可证

本项目基于 GNU Affero General Public License v3.0 发布。

Sub-Store 后端基于 AGPL-3.0 发布，官方前端基于 GPL-3.0 发布。

完整信息请参阅 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
