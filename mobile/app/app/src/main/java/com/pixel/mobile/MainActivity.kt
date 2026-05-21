package com.pixel.mobile

import android.annotation.SuppressLint
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

/**
 * Self-contained launcher: on start it injects the bundled Frida agent into
 * MilkChoco (via root — see Injector), which serves the control panel on
 * http://127.0.0.1:27345. This WebView shows that panel. No GameGuardian, no
 * adb, no manual launch.sh — install the APK, open it, grant root.
 */
class MainActivity : AppCompatActivity() {

    private val url = "http://127.0.0.1:27345/"
    private lateinit var web: WebView
    private val ui = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        web = WebView(this)
        web.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
        }
        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                v: WebView?, req: android.webkit.WebResourceRequest?,
                err: android.webkit.WebResourceError?
            ) {
                // Agent not up yet — show a hint and retry shortly.
                v?.loadData(WAITING_HTML, "text/html", "utf-8")
                ui.postDelayed({ web.loadUrl(url) }, 2500)
            }
        }
        setContentView(web)
        web.loadData(INJECTING_HTML, "text/html", "utf-8")

        // Inject off the UI thread (su + frida-inject can take a few seconds).
        Thread {
            val result = Injector.run(this) { line -> android.util.Log.i("Pixel", line) }
            ui.post {
                when (result) {
                    Injector.Result.NO_ROOT ->
                        web.loadData(err("Root required", "This tool reads the game's memory, which Android only allows with root. Grant the root (su) prompt and reopen, or use a rooted device / Magisk."), "text/html", "utf-8")
                    Injector.Result.ASSET_MISSING ->
                        web.loadData(err("Build incomplete", "The agent or frida-inject binary was not bundled into this APK. Rebuild after `npm run build` (it produces dist/agent.js + bin/frida-inject)."), "text/html", "utf-8")
                    Injector.Result.GAME_NOT_FOUND ->
                        web.loadData(err("MilkChoco not running", "Could not start ${Injector.PKG}. Open MilkChoco first, then reopen this app."), "text/html", "utf-8")
                    Injector.Result.ERROR ->
                        web.loadData(err("Injection failed", "frida-inject could not attach. Some ROMs block ptrace under SELinux; a permissive tweak may be needed. See /data/local/tmp/pixel/inject.log."), "text/html", "utf-8")
                    Injector.Result.INJECTED, Injector.Result.ALREADY_RUNNING ->
                        web.loadUrl(url)
                }
            }
        }.start()
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        private fun page(body: String) =
            "<html><body style='background:#0b0d12;color:#8b93ad;" +
            "font:16px system-ui;display:flex;align-items:center;" +
            "justify-content:center;height:100vh;margin:0;text-align:center'>" +
            "<div style='max-width:80%'>$body</div></body></html>"

        private fun err(title: String, msg: String) =
            page("<b style='color:#e06c75'>$title</b><br><br><small>$msg</small>")

        private val INJECTING_HTML =
            page("Injecting the Pixel agent into MilkChoco…<br><br><small>Grant the root (su) prompt if it appears.</small>")

        private val WAITING_HTML =
            page("Waiting for the Pixel agent…<br><br><small>The control panel appears once injection finishes.</small>")
    }
}
