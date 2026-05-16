# Pixel Mobile — standalone, phone-only (rooted, no PC)

A **self-contained project**. Copy this folder into any empty repo and it
builds itself — GitHub Actions runs on push and produces ready-to-copy
bundles. Then a single **rooted phone** is all you need; no PC, no ADB, no
Termux Node, no Python.

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
2. GitHub Actions (`.github/workflows/build.yml`) builds automatically and
   attaches **`pixel-mobile-<abi>.zip`** as an artifact (and a Release if the
   commit message contains `[release]` or you push a `v*` tag).
3. Download the zip for your phone's ABI (almost always `arm64`).

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

## Run (on the phone, as root)

```sh
su
cd /data/local/tmp/pixel
sh launch.sh
```

It launches/attaches MilkChoco and injects the agent. Open
**http://127.0.0.1:27345** in the phone browser, or install the WebView app
(`app/`, build in Android Studio), or "Add to Home screen" (it's a PWA).

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
├── launch.sh               on-device root launcher
└── app/                    WebView APK project (Android Studio)
```

`agent/agent.ts`, `agent/offsets.ts`, `agent/type.d.ts` are copies of the
desktop Pixel sources, so this project stands alone. Re-copy them from the
parent repo when the desktop agent changes.

## Honest status

The binary pipeline and generated-script syntax are verified by the build.
On-device behavior (Frida `Socket`, `frida-inject` under root, SELinux) could
not be tested from the build environment and needs one real validation pass.
The panel ships a working core — status, EPOS lock, a toggle grid, and a
**raw-command box that exposes the full agent protocol** — with a clear path
to port the polished desktop UI (the hard part, the transport + agent, is
done).
