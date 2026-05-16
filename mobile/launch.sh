#!/system/bin/sh
# =============================================================================
#  Pixel Mobile — on-device launcher (NO PC)
#
#  Runs ON the rooted phone (Termux as root, or `adb shell` then `su`).
#  Injects mobile/dist/agent.js into MilkChoco using the bundled, ABI-matched
#  frida-inject. The agent then serves the control panel at
#  http://127.0.0.1:27345 — open it in the phone browser or the Pixel WebView
#  app (mobile/app).
#
#  One-time placement (push these onto the phone, e.g. via your file manager,
#  Termux, or `adb push` from any PC just once):
#      WORK/agent.js                                   <- mobile/dist/agent.js
#      WORK/frida-inject-16.4.10-android-<abi>         <- bin/frida-inject/...
#  Default WORK = /data/local/tmp/pixel
#
#  Usage (as root):
#      sh launch.sh            # attach if game running, else spawn it
#      WORK=/sdcard/pixel sh launch.sh
# =============================================================================
set -e

PKG="com.gameparadiso.milkchoco"
VER="16.4.10"
WORK="${WORK:-/data/local/tmp/pixel}"
AGENT="$WORK/agent.js"

if [ "$(id -u)" != "0" ]; then
  echo "[pixel] must run as root (su). Aborting." >&2
  exit 1
fi

# --- pick the frida-inject matching this device's ABI ---
ABI="$(getprop ro.product.cpu.abi 2>/dev/null || true)"
case "$ABI" in
  arm64*)  A="arm64" ;;
  armeabi*) A="arm" ;;
  x86_64)  A="x86_64" ;;
  x86)     A="x86" ;;
  *)
    M="$(uname -m 2>/dev/null || true)"
    case "$M" in
      aarch64) A="arm64" ;; armv7*|armv8*) A="arm" ;;
      x86_64) A="x86_64" ;; i*86) A="x86" ;;
      *) echo "[pixel] unknown ABI '$ABI'/'$M'." >&2; exit 1 ;;
    esac
esac
INJECT="$WORK/frida-inject-$VER-android-$A"

[ -f "$AGENT" ]  || { echo "[pixel] missing $AGENT" >&2; exit 1; }
[ -f "$INJECT" ] || { echo "[pixel] missing $INJECT (need frida-inject for $A)" >&2; exit 1; }
chmod 755 "$INJECT" 2>/dev/null || true

# --- ensure the game is running, then attach by process name ---
PID="$(pidof "$PKG" 2>/dev/null || true)"
if [ -z "$PID" ]; then
  echo "[pixel] launching $PKG ..."
  monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
    am start -n "$PKG/com.unity3d.player.UnityPlayerActivity" >/dev/null 2>&1 || true
  i=0
  while [ -z "$PID" ] && [ $i -lt 30 ]; do
    sleep 1; i=$((i+1)); PID="$(pidof "$PKG" 2>/dev/null || true)"
  done
  [ -n "$PID" ] || { echo "[pixel] game did not start." >&2; exit 1; }
fi

echo "[pixel] injecting into $PKG (pid $PID, abi $A)"
echo "[pixel] panel will be at http://127.0.0.1:27345  (Ctrl+C to detach)"
exec "$INJECT" -n "$PKG" -s "$AGENT" --runtime=qjs
