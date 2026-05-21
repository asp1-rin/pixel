package com.pixel.mobile

import android.content.Context
import android.os.Build
import java.io.File

/**
 * On-device replacement for mobile/launch.sh. Extracts the bundled agent.js +
 * ABI-matched frida-inject from the APK assets, then (as root, via `su`) drops
 * them in /data/local/tmp/pixel, ensures MilkChoco is running, and injects the
 * agent. The agent then serves the control panel on http://127.0.0.1:27345,
 * which MainActivity loads. No GameGuardian, no adb, no manual launch.sh.
 *
 * Root is mandatory: injecting into another app is impossible inside the
 * Android sandbox without it (same constraint GameGuardian has).
 */
object Injector {
    const val PKG = "com.gameparadiso.milkchoco"
    private const val VER = "16.4.10"
    private const val WORK = "/data/local/tmp/pixel"

    enum class Result { INJECTED, ALREADY_RUNNING, NO_ROOT, GAME_NOT_FOUND, ASSET_MISSING, ERROR }

    private fun abi(): String {
        for (a in Build.SUPPORTED_ABIS) {
            when {
                a.startsWith("arm64") -> return "arm64"
                a.startsWith("armeabi") -> return "arm"
                a == "x86_64" -> return "x86_64"
                a == "x86" -> return "x86"
            }
        }
        return "arm64"
    }

    private fun copyAsset(ctx: Context, name: String, dest: File): Boolean = try {
        ctx.assets.open(name).use { input -> dest.outputStream().use { input.copyTo(it) } }
        true
    } catch (e: Exception) {
        false
    }

    fun run(ctx: Context, log: (String) -> Unit): Result {
        val injectName = "frida-inject-$VER-android-${abi()}"
        val agent = File(ctx.filesDir, "agent.js")
        val inject = File(ctx.filesDir, "frida-inject")

        if (!copyAsset(ctx, "agent.js", agent)) return Result.ASSET_MISSING
        if (!copyAsset(ctx, injectName, inject)) return Result.ASSET_MISSING

        // Mirror launch.sh: copy to /data/local/tmp (root-exec friendly SELinux
        // context), skip if already injected, spawn the game if needed, then
        // inject detached so `su` returns while the agent keeps running.
        val s = "\$"
        val script = """
            PKG="${PKG}"
            WORK="${WORK}"
            mkdir -p "${s}WORK" || exit 1
            cp "${agent.absolutePath}" "${s}WORK/agent.js" || exit 1
            cp "${inject.absolutePath}" "${s}WORK/frida-inject" || exit 1
            chmod 755 "${s}WORK/frida-inject" 2>/dev/null || true
            if pidof frida-inject >/dev/null 2>&1; then echo PIXEL_ALREADY; exit 0; fi
            PID=${s}(pidof "${s}PKG" 2>/dev/null || true)
            if [ -z "${s}PID" ]; then
              monkey -p "${s}PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || \
                am start -n "${s}PKG/com.unity3d.player.UnityPlayerActivity" >/dev/null 2>&1 || true
              i=0
              while [ -z "${s}PID" ] && [ ${s}i -lt 30 ]; do
                sleep 1; i=${s}((i+1)); PID=${s}(pidof "${s}PKG" 2>/dev/null || true)
              done
            fi
            [ -n "${s}PID" ] || { echo PIXEL_NOGAME; exit 0; }
            nohup "${s}WORK/frida-inject" -n "${s}PKG" -s "${s}WORK/agent.js" --runtime=qjs \
              >"${s}WORK/inject.log" 2>&1 &
            echo PIXEL_INJECTED
        """.trimIndent()

        return try {
            val p = ProcessBuilder("su", "-c", "sh").redirectErrorStream(true).start()
            p.outputStream.use { it.write(script.toByteArray()) }
            val out = p.inputStream.bufferedReader().readText()
            p.waitFor()
            log(out)
            when {
                out.contains("PIXEL_ALREADY") -> Result.ALREADY_RUNNING
                out.contains("PIXEL_INJECTED") -> Result.INJECTED
                out.contains("PIXEL_NOGAME") -> Result.GAME_NOT_FOUND
                else -> Result.ERROR
            }
        } catch (e: Exception) {
            log("su failed: ${e.message}")
            Result.NO_ROOT
        }
    }
}
