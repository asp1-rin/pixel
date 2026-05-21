# Pixel Mobile — standalone, phone-only (rooted, no PC)

A **self-contained project**. Copy this folder into any empty repo and it
builds itself — GitHub Actions runs on push and produces ready-to-copy
bundles. Then a single **rooted phone** is all you need; no PC, no ADB, no
Termux Node, no Python.

**Install-and-go:** the built `pixel-mobile.apk` bundles the agent and the
frida-inject binaries for every ABI. On launch it requests root, injects into
MilkChoco itself (the job `launch.sh` used to do by hand), and opens the panel.
No GameGuardian, no terminal — install the APK, open it, grant the `su` prompt.
The zip bundle + `launch.sh` remain available as a manual fallback.

```
 frida-inject (root, on phone)            ┌─ phone browser / Pixel WebView app
        │ injects                          │   http://127.0.0.1:27345
        ▼                                  ▼
 com.gameparadiso.milkchoco  ──►  in-process HTTP/SSE server (src/server.js)
        ▲                                  │  shadows Frida send()/recv()
        └──────────── unmodified Pixel agent (agent/agent.ts, compiled)
```

The Pixel agent talks to its host **only** through the Frida globals
`send()`/`recv()`. `src/server.js` shadows them and runs a tiny web server
*inside the game process* (Frida `Socket` API), so the **entire agent runs
unchanged** — feature coverage tracks the agent automatically.

> ⚠️ **Root is mandatory.** A non-rooted phone cannot inject into another
> app (Android sandbox — not something code can bypass). Research/education
> only.

---

## Option A — let CI build it (zero local setup)

1. Copy everything in this folder into a new repo, push to `main`.
2. GitHub Actions (`.github/workflows/build.yml`) automatically builds **both**:
   - **`pixel-mobile-<abi>.zip`** — agent.js + frida-inject + launch.sh
   - **`pixel-mobile.apk`** — the installable WebView app
   (and a GitHub Release if the commit message contains `[release]` or you
   push a `v*` tag).
3. Download the zip for your phone's ABI (almost always `arm64`) and the APK.

## Option B — build locally

```bash
npm install
npm run build      # fetches frida-inject, compiles agent, bundles everything
```

Either way you get, per ABI:

```
dist/pixel-mobile-arm64.zip   ->  { agent.js, frida-inject-…-arm64, launch.sh }
```

## Put it on the phone (once)

Unzip the bundle for your ABI into `/data/local/tmp/pixel/` on the phone
(file manager / Termux / a one-time `adb push` — anything). Check ABI with
`getprop ro.product.cpu.abi`.

## Run

**Recommended — the APK does everything.** Install `pixel-mobile.apk`
(CI artifact / release, or build `app/` in Android Studio), open it, and grant
the root (`su`) prompt. `MainActivity` → `Injector.kt` extracts the bundled
agent + ABI-matched frida-inject to `/data/local/tmp/pixel`, launches/attaches
MilkChoco, injects, and loads the panel from `http://127.0.0.1:27345`. Nothing
to push, no `launch.sh`. (The APK carries all four ABIs and picks the match at
runtime, so one APK works on any device.)

**Manual fallback** (zip bundle), as root:

```sh
su
cd /data/local/tmp/pixel
sh launch.sh
```

Either way the panel is at **http://127.0.0.1:27345** — also openable in the
phone browser or "Add to Home screen" (it's a PWA).

> Some ROMs' SELinux blocks ptrace even for root; a ROM-specific permissive
> tweak may be needed if injection fails.

---

## Layout

```
mobile/
├── package.json            self-contained (npm install && npm run build)
├── tsconfig.json
├── .github/workflows/      auto-build on push (Option A)
├── agent/                  agent.ts + offsets.ts + type.d.ts (Pixel agent)
├── src/server.js           in-agent HTTP/SSE bridge + send/recv shim
├── web/                    installable PWA panel
├── scripts/fetch-frida-inject.cjs
├── build.cjs               -> dist/agent.js + dist/pixel-mobile-<abi>.zip
├── launch.sh               on-device root launcher (manual fallback)
└── app/                    install-and-go WebView APK (auto-injects via root)
                            app/.../Injector.kt = launch.sh's job, in-app;
                            build.gradle bundles dist/agent.js + bin/frida-inject-*
```

`agent/agent.ts`, `agent/offsets.ts`, `agent/type.d.ts` are copies of the
desktop Pixel sources, so this project stands alone. Re-copy them from the
parent repo when the desktop agent changes.

## UI

The **full desktop UI** runs as-is. `web-src/{main,login,ui}` are the
unmodified desktop renderer; at bundle time `electron` is aliased to
`web-src/electron-shim.ts`, which maps `ipcRenderer.send/on/invoke` onto the
in-agent SSE/POST bridge. Because `src/index.ts` is a 1:1 pass-through for
agent-facing channels, every cheat, the teleport grid, kicker, changer,
resource tools and settings work; PC-only tabs (ADB/Frida) are inert no-ops.
Login is bypassed (no web backend on a phone you physically hold).

> Re-copy `agent/` and `web-src/{main,login,ui,output.css,main.html}` from the
> parent repo whenever the desktop app changes, then rebuild.

## Honest status

Verified by the build: binary pipeline, agent + renderer bundling, and
generated-script syntax. **Not** verifiable from the build environment and
needing one real pass: on-device runtime (Frida `Socket`, `frida-inject`
under root, SELinux), the in-app root injection (`Injector.kt` running `su` +
the `nohup` detach), and the APK Gradle build / asset bundling (standard CI
recipe, but no Android SDK here). Some renderer lifecycle nuances (macro editor
persistence, finder data) may need device iteration.
