# Sub-Store Desktop

[Русский](README.md) | **English** | [简体中文](README.zh-CN.md)

A desktop client for Sub-Store, ready to use immediately after installation. The application runs the official Sub-Store frontend and backend locally through Electron and does not require Node.js, Docker, or browser extensions to be installed by the user.

## Differences from shiteThings/sub-store-gui

- **Local network priority:** the application first listens on an available private IPv4 address of the current network interface, making Sub-Store accessible from the local network. If no such address is available, it uses `127.0.0.1`.
- **In-app component updates:** the frontend and backend can be updated separately from the desktop application. Version checks run no more than once every 8 hours.
- **User-local storage:** Sub-Store data, including updated frontend/backend components, is stored in the user's directory rather than the installation directory.
- **Integrity checks:** downloaded components are verified with SHA-256; after installation, the manifest, backend, and frontend file tree are checked again.
- **Desktop integration:** the fork adds a system menu and a separate update window with a restart after installation.

## Current Features

- Bundled official Sub-Store GUI and Node.js backend
- Listens on a private IPv4 address of the current local network, falling back to `127.0.0.1` when no network connection is available
- Uses a random API path and restricts backend CORS origins
- Supports updating the frontend and backend from the application while storing components in the user's directory
- Stores subscriptions, merged subscriptions, scripts, files, and synchronization settings in the application's user data directory
- Builds for Windows, macOS, and Linux (x64 and ARM64)
- Pins upstream component versions and verifies them with SHA-256

Pinned versions: Sub-Store `2.38.2`, Sub-Store Front End `2.31.2`. See [`vendor-lock.json`](vendor-lock.json) for details.

## Architecture

```text
Electron Main Process

  ├─ BrowserWindow (sandbox enabled, no Node.js access)
  │
  └─ Utility Process
       │
       └─ Official Sub-Store bundle
            ├─ Local static frontend
            ├─ Local API
            └─ User data directory
```

The project uses two `package.json` files supported by electron-builder: the root directory is responsible for development and builds, while `app/package.json` is a minimal runtime package without development dependencies.

The frontend and API use one random port on a private IPv4 address of the current local network. If no such address is available, the application uses `127.0.0.1`. The API is also placed behind a random path generated on first launch. The address, port, and path are stored in `desktop-runtime.json`, readable only by the current user.

## Development

Node.js 22 or newer is required.

```bash
npm install

npm run dev
```

On the first `npm run dev` launch, the application downloads and verifies the official distributions pinned in `vendor-lock.json`. The commands can also be run separately:

```bash
npm run vendor:sync

npm run vendor:verify

npm test
```

## Building

Run the command for the target operating system:

```bash
npm run dist:win

npm run dist:mac

npm run dist:linux
```

Build artifacts are written to `release/`.

GitHub Actions builds on all three native operating systems and creates installers for x64 and ARM64.

Before official distribution, replace the maintainer placeholder email in `package.json` with the project's email address and configure code signing for Windows and Apple Developer ID signing/notarization for macOS. Unsigned installers may trigger operating system security warnings.

## User Data

The application does not write subscription data to the installation directory. By default, it uses Electron's `userData` directory:

- Windows: `%APPDATA%/Sub-Store Desktop/sub-store/data`
- macOS: `~/Library/Application Support/Sub-Store Desktop/sub-store/data`
- Linux: `~/.config/Sub-Store Desktop/sub-store/data`

User data is preserved by default when the application is uninstalled through NSIS.

Logs are stored in `userData/logs/sub-store.log`. When the log exceeds 5 MiB, one rotated backup copy is retained.

In production, the `vendor` directory and `vendor-lock.json` are also stored inside `userData/sub-store`, rather than in the installation directory. This allows frontend and backend updates without administrator privileges. The bundled copy from the installer is used only for initial setup or recovery of damaged files.

## Updating Upstream Versions

Change the versions, URLs, and checksums in `vendor-lock.json`, then run:

```bash
npm run vendor:sync

npm run vendor:verify
```

Do not add binary distributions from `resources/vendor` to Git. CI downloads them again from the lock file and verifies them.

The installer also contains the corresponding source code for this project and the upstream license texts. Users can open the source directory directly through the Help menu in the application.

## License

This project is distributed under the GNU Affero General Public License v3.0.

The Sub-Store backend is distributed under AGPL-3.0, and the official frontend under GPL-3.0.

See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) for complete information.
