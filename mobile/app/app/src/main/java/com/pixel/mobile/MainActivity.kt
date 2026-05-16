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
 * Thin WebView shell around the panel the Frida agent serves on
 * http://127.0.0.1:27345. The server only exists while the agent is injected
 * (see mobile/launch.sh), so on a connection failure we just keep retrying.
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
                // Agent not injected yet — show a hint and retry shortly.
                v?.loadData(WAITING_HTML, "text/html", "utf-8")
                ui.postDelayed({ web.loadUrl(url) }, 2500)
            }
        }
        setContentView(web)
        web.loadUrl(url)
    }

    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    companion object {
        private const val WAITING_HTML =
            "<html><body style='background:#0b0d12;color:#8b93ad;" +
            "font:16px system-ui;display:flex;align-items:center;" +
            "justify-content:center;height:100vh;margin:0;text-align:center'>" +
            "<div>Waiting for the Pixel agent…<br><br>" +
            "<small>Run launch.sh as root, then this connects automatically.</small>" +
            "</div></body></html>"
    }
}
