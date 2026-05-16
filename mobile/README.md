# Pixel Mobile — phone-standalone build (no PC)

Run the **full existing Frida agent on a rooted phone**, with the control
panel served as an installable app. No PC, no ADB-from-PC, no Termux Node,
no Python.

```
 frida-inject (root, on phone)            ┌─ phone browser / Pixel WebView app
        │ injects                          │   http://127.0.0.1:27345
        ▼                                  ▼
 com.gameparadiso.milkchoco  ──►  in-process HTTP/SSE server (mobile/src/server.js)
        ▲                                  │  shadows Frida send()/recv()
        └──────────── unmodified desktop agent (public/scripts/agent.js)
```

The desktop agent talks to its host **only** through the Frida globals
`send()` / `recv()`. `mobile/src/server.js` shadows those globals and runs a
tiny web server *inside the game process* (Frida `Socket` API), so the exact
same agent code is driven by the phone instead of the Electron app. Feature
coverage therefore tracks the desktop agent automatically.

> ⚠️ **Root is mandatory.** A non-rooted phone cannot inject into another
> app — this is the Android sandbox, not a limitation we can code around.
> Educational / research use only.

---

## Build (on a PC, once)

```bash
npm install
npm run build          # compiles agent + offsets, fetches bundled binaries
node mobile/build.cjs   # -> mobile/dist/agent.js
```

`mobile/dist/agent.js` = web assets + server shim + offset-injected agent,
all in one injectable script.

The matching injector lives at
`bin/frida-inject/frida-inject-16.4.10-android-<abi>` (downloaded by
`npm run build`).

## Put files on the phone (once)

Copy these into `/data/local/tmp/pixel/` on the phone (any method — file
manager, Termux, or a one-time `adb push`):

| From (repo) | To (phone) |
| --- | --- |
| `mobile/dist/agent.js` | `/data/local/tmp/pixel/agent.js` |
| `bin/frida-inject/frida-inject-16.4.10-android-<abi>` | `/data/local/tmp/pixel/` |
| `mobile/launch.sh` | `/data/local/tmp/pixel/launch.sh` |

`<abi>`: `arm64` for almost all modern phones (check `getprop ro.product.cpu.abi`).

## Run (on the phone, as root)

In Termux (with `tsu`/`su`) or any root shell:

```sh
su
cd /data/local/tmp/pixel
sh launch.sh
```

It launches/attaches MilkChoco and injects the agent. Then open
**http://127.0.0.1:27345** in the phone browser — or install the WebView
app below so it feels like a normal app.

> SELinux on some ROMs blocks ptrace even for root. If injection fails,
> a permissive policy for the shell domain may be required (ROM-specific).

## Optional: the "app" (WebView APK)

`mobile/app/` is an Android Studio project — a fullscreen WebView pointing at
the agent's panel, with auto-retry until the agent is up.

```
Open mobile/app/ in Android Studio  →  Run/Build APK  →  install on the phone
```

(The APK is **not** prebuilt here; building it needs the Android SDK.)
You can also just "Add to Home screen" from the browser — the panel is a PWA
(manifest + service worker) so it installs standalone without the APK.

---

## What is and isn't done

**Done & self-contained:** injection path (bundled `frida-inject`), the
in-agent HTTP/SSE bridge, the `send`/`recv` shim (so the *entire* desktop
agent runs unchanged), an installable mobile panel, and the WebView app
scaffold.

**Honest status:** this could not be tested on a real rooted phone from the
build environment. The binary pipeline and script syntax are verified; the
on-device runtime needs one real validation pass. The web panel ships a
working core (status, EPOS lock, toggle grid, **raw-command box giving full
protocol access**) plus a clear path to port the polished desktop UI — the
transport and agent are the hard part and are complete.

## Files

```
mobile/
├── src/server.js     in-agent HTTP/SSE server + Frida send/recv shim
├── web/              installable PWA panel (index.html, manifest, sw, icon)
├── build.cjs         agent.js + server + web -> mobile/dist/agent.js
├── launch.sh         on-device root launcher (bundled frida-inject)
├── app/              Android WebView APK project (build in Android Studio)
└── dist/agent.js     generated injectable script
```
