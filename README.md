# Pixel

Pixel is an Electron desktop application that orchestrates a Frida-based
runtime-analysis pipeline against the Android title MilkChoco
(`com.gameparadiso.milkchoco`). It bundles a TypeScript main process, a Tailwind
styled renderer, a packaged Frida agent, an embedded Express + Socket.IO server
for a companion mobile controller, and an auto-updater wired to GitHub
releases.

The application is intended for personal research and analysis of the target
process. You are responsible for ensuring your use complies with the game's
Terms of Service and with the laws of your jurisdiction. Do not use this tool
to harm other players or services you do not own.

## Overview

Pixel attaches to a running (or freshly spawned) MilkChoco process on a
connected Android device or emulator and exposes a curated set of read/write
hooks through a desktop UI. The desktop side handles device discovery,
Frida server lifecycle, agent injection, hotkeys, mouse-and-keyboard mapping
for emulators, and configuration persistence. The Frida agent runs inside the
target process and performs the actual memory access, symbol resolution, and
event reporting.

A small HTTP service is also started locally so a phone on the same Wi-Fi
network can act as an auxiliary gyroscope/keypad source via Socket.IO.

## Repository layout

```
.
|-- src/                        TypeScript sources for the Electron app
|   |-- index.ts                Main process: lifecycle, IPC, frida glue
|   |-- main.ts                 Renderer entry point (cheat UI)
|   |-- layout.ts               Overlay window renderer
|   |-- login.ts                Renderer login screen (pixel-code-web)
|   |-- preload.ts              Preload bridge
|   |-- commander.ts            Console: alias, hook, call, read, write
|   |-- keymaps.ts              Mapping from global key names to nut-js keys
|   |-- offsets.ts              Symbols and offsets consumed by the agent
|   |-- type.d.ts               Global TS types (Cheats, Config, Keybinds...)
|   |-- core/server.ts          Express + Socket.IO companion server
|   |-- data/
|   |   |-- auth.ts             pixel-code-web login client
|   |   |-- frida.ts            ADB + frida-server install/attach helpers
|   |   `-- utils.ts            BrowserWindow factory
|   |-- scripts/
|   |   |-- agent.ts            Frida agent compiled into public/scripts
|   |   `-- inj.ts              Standalone CLI Frida script (spawn/attach)
|   `-- ui/
|       |-- devtools.ts         DevTools shortcut hook
|       `-- dom.ts              Small DOM helpers for the renderer
|-- public/
|   |-- main.html               Main renderer markup
|   |-- layout.html             Overlay window markup
|   |-- global.css              Tailwind source
|   |-- output.css              Tailwind build output (generated)
|   |-- renderer.js             Generated renderer bundle entry
|   |-- favicon.ico, icon.svg   App icons
|   |-- routes/
|   |   |-- main.html           Companion server landing page
|   |   `-- mobile_controller.html  Phone-side gyro/keypad UI
|   `-- scripts/                Compiled frida agent (agent.js / inj.js)
|-- scripts/
|   `-- inject-offsets.cjs      Postbuild step: substitutes offset placeholders
|                               inside public/scripts/inj.js
|-- .github/workflows/build.yml CI: build Windows EXE on `v*` tags
|-- .env.example                Documented environment variables
|-- package.json                Electron + electron-builder configuration
|-- tailwind.config.js          Tailwind setup
|-- tsconfig.json               TypeScript config for the Electron side
|-- tsconfig.scripts.json       TypeScript config for the Frida scripts
`-- For Claude/offset.txt       Raw offset reference data
```

## Features

- ADB device discovery, TCP/IP switchover, and remote attach
- Automatic detection of the on-device frida-server binary, with download URL
  helper that matches the device CPU ABI (`arm`, `arm64`, `x86`, `x86_64`)
- Spawn-or-attach flow into `com.gameparadiso.milkchoco` with both native and
  emulated realm support
- Per-feature toggles (cheats), per-feature configuration (config), and per
  feature global hotkeys (keybinds) routed through `node-global-key-listener`
- Mouse and keyboard automation for emulator clients through `@nut-tree-fork/nut-js`
- In-app console (`Commander`) for ad-hoc symbol interaction:
  `alias`, `list`, `search`, `hook`, `unhook`, `call`, `read`, `write`
- Transparent always-on-top overlay window for HUD elements
- Companion local HTTP server with a phone-friendly route at `/mobile` that
  streams gyroscope and key events back over Socket.IO
- Auto-update via `electron-updater` against the GitHub release feed
- Authentication against a separate web backend (`pixel-code-web`) before the
  cheat UI is revealed, with an optional dev bypass switch

## Requirements

Development host:

- Windows 10/11 (the application is shipped and tested as a Windows build).
  macOS/Linux can be used to run the TypeScript build and watch tasks but the
  `clean:win` script, NSIS packaging, and global key listener target Windows.
- Node.js 20.x (matches the version pinned in CI).
- npm (bun is supported too: a `bun.lock` is checked in).
- Python and build tools as required by `node-global-key-listener` and other
  native dependencies on first install.

Target device:

- Android device or emulator reachable over ADB (USB or TCP/IP).
- Root access on the device, since `frida-server` is launched with `su -c`.
- MilkChoco installed on the device (`com.gameparadiso.milkchoco`).
- A matching `frida-server` binary for the device ABI placed at
  `/data/local/tmp/`. The application can open the correct download URL for
  you; see "Frida server" below.

The pinned Frida version is `16.4.10`. The Electron prebuilt is `electron-v125`
on `win32-x64`; the helper script `download:binding` opens the matching binding
archive from the Frida releases page.

## Installation

```
npm install
```

If `node-global-key-listener` or other native modules fail to build, install
the platform's build prerequisites (Visual Studio Build Tools on Windows) and
re-run `npm install`.

A pre-built Windows installer is also published as a GitHub release on every
`v*` tag (`pixel-Setup-<version>.exe`), built by `.github/workflows/build.yml`.

## Configuration

Pixel reads its runtime configuration from environment variables, loaded from
`.env` either next to the executable (when packaged) or at the repository root
(when running from source). See `.env.example` for the canonical list:

| Variable                  | Default                                  | Purpose                                                                 |
|---------------------------|------------------------------------------|-------------------------------------------------------------------------|
| `PIXEL_WEB_URL`           | `https://pixel-code-web.vercel.app`      | Base URL of the `pixel-code-web` backend used by the login screen.      |
| `PIXEL_DEV_BYPASS_AUTH`   | unset                                    | When set to `true`, the renderer skips the login form and enters the    |
|                           |                                          | cheat UI directly. Intended for local development only.                 |

Per-user runtime state (selected cheats, key bindings, layout bounds,
configuration values) is exchanged between the main and renderer processes
through Electron IPC at startup; persistence is handled on the renderer side.

## Frida server

The desktop app expects a working `frida-server` binary on the connected
device under `/data/local/tmp/`. Pixel will:

1. Read `ro.product.cpu.abi` / `ro.product.cpu.abilist` to determine the ABI.
2. Look for a file named one of `frida`, `frida-server`,
   `frida-server-16.4.10-android-<abi>`, or
   `frida-server-16.4.10-freebsd-<abi>`.
3. Chmod the binary to `777` if it is not already world-executable.
4. Launch it through `su -c`.

You can fetch a matching binary from the Frida releases page; the in-app
"Download Server" action opens that URL for you. The standalone CLI mode
(`npm run spawn` / `npm run attach`) talks to Frida directly through `frida-tools`
and assumes the server is already running on the device.

## Build and run

Common scripts (from `package.json`):

| Command                      | Description                                                                 |
|------------------------------|-----------------------------------------------------------------------------|
| `npm run start`              | Launch Electron against the current working tree.                           |
| `npm run watch`              | Run `tsc -w`, the Tailwind watcher, and the scripts `tsc -w` concurrently.  |
| `npm run build`              | Compile TypeScript, build Tailwind CSS, compile the Frida scripts, and run  |
|                              | `inject-offsets` to embed offsets into `public/scripts/inj.js`.             |
| `npm run inject-offsets`     | Re-run only the offset substitution step.                                   |
| `npm run dist`               | Produce a Windows NSIS installer through `electron-builder` (no publish).   |
| `npm run clean:win`          | Remove `dist`, `build`, and the generated Tailwind output (Windows shell).  |
| `npm run clean:linux`        | Same cleanup using POSIX `rm`.                                              |
| `npm run download:binding`   | Open the Frida 16.4.10 Electron-v125 win32-x64 binding archive in the       |
|                              | default browser.                                                            |
| `npm run spawn`              | `frida -Uf com.gameparadiso.milkchoco -l public/scripts/inj.js` — spawn     |
|                              | MilkChoco fresh with the standalone script attached.                        |
| `npm run attach`             | `frida -UN com.gameparadiso.milkchoco -l public/scripts/inj.js` — attach    |
|                              | to a running MilkChoco process.                                             |

A typical first-time flow is:

```
npm install
npm run build
npm run start
```

When iterating, run `npm run watch` in one terminal and `npm run start` in
another; only the renderer and Frida agent need a rebuild between changes
to their respective sources.

## Packaging

`electron-builder` is configured in `package.json` under the `build` key:

- App ID: `com.necpition205.pixel`
- Product name: `pixel`
- Windows target: NSIS one-click installer named
  `pixel-Setup-<version>.exe`, output to `build/`
- Bundled files: everything under `dist/` and `public/` (with
  `global.css`, `main.html`, and `layout.html` filtered out of the
  extracted `extraResources` because they are only used at build time)
- Publish provider: GitHub (private), `necpition205/pixel`

The CI workflow `.github/workflows/build.yml` runs on every pushed tag that
matches `v*`, builds the EXE on `windows-latest`, sets the icon to
`./public/favicon.ico`, and uploads the resulting installer as a GitHub
release asset using `softprops/action-gh-release`.

## Authentication and the companion web service

The login screen in `src/login.ts` posts the entered ID and password to
`POST <PIXEL_WEB_URL>/api/pixel/login`. A successful response (`{ ok: true,
pixelId, admin }`) unhides the cheat UI; failures are surfaced inline. The
"Request account" link opens `PIXEL_WEB_URL` in the system browser via
`shell.openExternal`. The pixel-code-web project is not part of this
repository.

Once authenticated, `src/core/server.ts` starts an Express server with
Socket.IO. It serves `public/routes/main.html` at `/` and gates the
`/mobile` controller behind the `plugin-server-mobile-controller` config
flag. The mobile page emits `gyro` events that are forwarded into the main
process event emitter when the `gyro-scope` config flag is enabled.

## Frida agent and offsets

`src/scripts/agent.ts` is the in-process Frida script bundled into
`public/scripts/agent.js`. The main process reads that file, strips
everything up to a sentinel line containing the literal string `"cut";` (to
keep helper/type declarations out of the injected payload), and feeds the
remainder to `session.createScript`.

The standalone script `src/scripts/inj.ts` (compiled to
`public/scripts/inj.js`) is consumed by the `spawn`/`attach` npm scripts. Its
offsets, symbols, and patch payloads are substituted at build time by
`scripts/inject-offsets.cjs`, which reads the compiled `dist/offsets.js`
module and replaces placeholder comments such as `/*eposOffsets*/`,
`/*symbols*/`, `/*injXaOffset*/`, `/*injXaPatch*/`, `/*injAnOffset*/`,
`/*libName*/`, and so on. The Electron-side `agent.js` is substituted at
runtime by the main process and therefore does not require a build-time
pass.

If you regenerate offsets, run `npm run build` (or, at minimum,
`tsc && npm run inject-offsets`) so the standalone script picks them up.

## Commander console

The renderer exposes an interactive console backed by `src/commander.ts`.
Available verbs:

| Verb           | Usage                                       | Notes                                                                        |
|----------------|---------------------------------------------|------------------------------------------------------------------------------|
| `alias`        | `alias <name> <target>`                     | Adds a name -> target rewrite that is applied to subsequent commands.        |
| `list`         | `list alias` / `list hook`                  | Lists current aliases or active hooks.                                       |
| `search`       | `search <pattern>`                          | Forwards a search request to the agent.                                      |
| `rem`          | `rem alias <name> [<name>...]`              | Removes aliases.                                                             |
| `hook`         | `hook <symbol>`                             | Installs a Frida hook on `<symbol>`.                                         |
| `unhook`       | `unhook`                                    | Removes every hook installed via the console.                                |
| `call`         | `call <symbol> [args...] [--silent|-s]`     | Calls `<symbol>` through the agent. `--silent` suppresses return-value logs. |
| `read`         | `read <symbol> [<type=uint32>]`             | Reads a typed value from `<symbol>`.                                         |
| `write`        | `write <symbol> <value> [<type=uint32>]`    | Writes `<value>` to `<symbol>` as the given type.                            |

All commands are routed to the active agent script through `script.post`.

## Troubleshooting

- "Failed to open agent file" on startup means `public/scripts/agent.js`
  was not produced; run `npm run build`.
- "Agent sentinel cut not found" is a warning that the `"cut";` marker is
  missing from the compiled agent. The full script is used as a fallback.
- "ADB not connected" indicates `connectAdbDevice` could not reach the
  given serial. Verify `adb devices` resolves the device and that the
  Android side has accepted the RSA prompt.
- "Frida server not found" means none of the recognized binary names exist
  under `/data/local/tmp/`. Push a `frida-server-16.4.10-android-<abi>`
  binary, then retry. The in-app "Download Server" action opens the right
  URL for your device.
- If the standalone `spawn`/`attach` scripts cannot find offsets, make sure
  `npm run build` was run after the most recent edit to `src/offsets.ts`,
  so `inject-offsets.cjs` had a chance to substitute the placeholders.

## Versioning and releases

The application version comes from `package.json` (`version`). Tagging a
release as `v<version>` and pushing the tag triggers the GitHub Actions
workflow, which produces and uploads `build/pixel-Setup-<version>.exe`.
The desktop app then sees the new release through `electron-updater` and
prompts the user.

## License

The repository declares `ISC` in `package.json` but does not yet ship a
top-level `LICENSE` file. Treat the code as ISC-licensed for the purposes
of contributing, and add a `LICENSE` file before publishing if you fork the
project.
