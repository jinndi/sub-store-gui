# Sub-Store Desktop

一个安装后即可使用的 Sub-Store 桌面客户端。应用通过 Electron 在本机启动官方 Sub-Store 前后端，不要求用户安装 Node.js、Docker 或浏览器扩展。

## 当前能力

- 内置官方 Sub-Store GUI 与 Node 后端
- 仅监听 `127.0.0.1`，不暴露到局域网
- 使用随机 API 路径，并限制后端 CORS 来源
- 订阅、组合订阅、脚本、文件和同步配置持久化到系统应用数据目录
- Windows、macOS、Linux 打包配置（x64 与 ARM64）
- 固定上游版本并进行 SHA-256 校验

当前固定版本：Sub-Store `2.36.55`，Sub-Store Front End `2.29.10`。详见 [`vendor-lock.json`](vendor-lock.json)。

## 架构

```text
Electron 主进程
  ├─ BrowserWindow（沙箱开启、无 Node 权限）
  └─ Utility Process
       └─ Sub-Store 官方 bundle
            ├─ 本地静态前端
            ├─ 本地 API
            └─ 用户数据目录
```

项目采用 electron-builder 的双 `package.json` 结构：根目录负责开发与打包，`app/package.json` 是不带开发依赖的最小运行时包。

前端与 API 共用一个随机本机端口。API 另外放在首次启动生成的随机路径下；端口和路径记录在仅供当前用户读取的 `desktop-runtime.json` 中。

## 开发

需要 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

`npm run dev` 首次执行时会下载 `vendor-lock.json` 中固定的官方发行物并校验。也可以单独执行：

```bash
npm run vendor:sync
npm run vendor:verify
npm test
```

## 打包

在对应操作系统上执行：

```bash
npm run dist:win
npm run dist:mac
npm run dist:linux
```

产物位于 `release/`。GitHub Actions 会在三个原生系统上分别构建 x64 与 ARM64 安装包。正式分发前应把 `package.json` 中的占位维护者邮箱替换为项目邮箱，并配置 Windows 代码签名和 Apple Developer ID/公证；未签名安装包会触发系统安全提示。

## 用户数据

应用不会把订阅数据写入安装目录。默认位置由 Electron 的 `userData` 目录决定：

- Windows：`%APPDATA%/Sub-Store Desktop/sub-store/data`
- macOS：`~/Library/Application Support/Sub-Store Desktop/sub-store/data`
- Linux：`~/.config/Sub-Store Desktop/sub-store/data`

NSIS 卸载默认保留用户数据。日志位于同一 `userData` 目录下的 `logs/sub-store.log`，超过 5 MiB 时保留一份轮转日志。

## 更新上游版本

修改 `vendor-lock.json` 中的版本、URL 与校验值，再执行：

```bash
npm run vendor:sync
npm run vendor:verify
```

不要提交 `resources/vendor` 下的发行二进制；CI 会从锁文件重新获取并校验。安装包会同时附带本项目的对应源代码与上游许可证文本，用户可从应用的“帮助”菜单直接打开源代码目录。

## 许可证

本项目使用 GNU Affero General Public License v3.0。Sub-Store 后端为 AGPL-3.0，官方前端为 GPL-3.0；完整说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
