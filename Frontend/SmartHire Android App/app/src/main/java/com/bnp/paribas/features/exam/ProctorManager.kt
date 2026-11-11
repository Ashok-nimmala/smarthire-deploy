package com.bnp.paribas.features.exam

import android.content.ClipboardManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.SystemClock
import com.bnp.paribas.core.network.ApiException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Device-side proctoring signals. These are signals, not security boundaries.
 * The backend records events, applies penalties and owns the integrity score.
 *
 * Mapping from the web spec to Android:
 *  - tab_switch  -> the app left the foreground (Activity.onStop / multi-window entered)
 *  - copy        -> the primary clipboard changed while the exam is active
 *  - paste       -> a single text change that inserts a large block (heuristic)
 *  - network_drop-> connectivity lost then restored (sent on restore, with duration in seconds)
 *  Not implemented (no camera/vision pipeline, no upload endpoint): no_face, multiple_faces.
 *  Not applicable on Android: right_click, devtools_open. fullscreen_exit is not reported.
 *
 * Events are NOT idempotent: a failed send is dropped, never retried.
 */
class ProctorManager(
    private val context: Context,
    private val scope: CoroutineScope,
    private val send: suspend (type: String, timestamp: String, duration: Long?, details: String?) -> String?,
    private val onScore: (String) -> Unit,
    private val onRecorded: () -> Unit,
    private val onExpired: () -> Unit
) {
    private class Event(val type: String, val timestamp: String, val duration: Long?, val details: String?)

    private val cooldownMs = mapOf(
        "copy" to 2000L,
        "paste" to 2000L,
        "tab_switch" to 1000L,
        "network_drop" to 1000L
    )

    @Volatile private var active = false
    private var channel: Channel<Event>? = null
    private var pump: Job? = null
    private val lastSent = HashMap<String, Long>()

    private var clipboard: ClipboardManager? = null
    private var clipListener: ClipboardManager.OnPrimaryClipChangedListener? = null
    private var connectivity: ConnectivityManager? = null
    private var netCallback: ConnectivityManager.NetworkCallback? = null
    private var lostAtElapsed: Long? = null

    fun start() {
        if (active) return
        active = true
        lastSent.clear()
        lostAtElapsed = null

        val ch = Channel<Event>(capacity = 20, onBufferOverflow = BufferOverflow.DROP_LATEST)
        channel = ch
        pump = scope.launch {
            for (ev in ch) {
                try {
                    val score = send(ev.type, ev.timestamp, ev.duration, ev.details)
                    if (score != null) onScore(score)
                    onRecorded()
                } catch (e: ApiException) {
                    // No retry. 401 ends the session; anything else (incl. 429) is dropped.
                    if (e.status == 401) onExpired()
                } catch (e: Exception) {
                    // dropped
                }
                delay(MIN_GAP_MS)
            }
        }

        registerClipboard()
        registerNetwork()
    }

    fun stop() {
        if (!active) return
        active = false
        clipListener?.let { clipboard?.removePrimaryClipChangedListener(it) }
        clipListener = null
        netCallback?.let {
            try { connectivity?.unregisterNetworkCallback(it) } catch (e: Exception) { /* ignore */ }
        }
        netCallback = null
        channel?.close()
        channel = null
        pump?.cancel()
        pump = null
    }

    /** Report a signal. Applies a per-type cooldown so a burst becomes one event. */
    fun report(type: String, duration: Long? = null, details: String? = null) {
        if (!active) return
        val now = SystemClock.elapsedRealtime()
        val cd = cooldownMs[type] ?: 1000L
        val last = lastSent[type]
        if (last != null && now - last < cd) return
        lastSent[type] = now
        channel?.trySend(Event(type, isoNow(), duration, details))
    }

    private fun registerClipboard() {
        val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        val l = ClipboardManager.OnPrimaryClipChangedListener { report("copy") }
        cm.addPrimaryClipChangedListener(l)
        clipboard = cm
        clipListener = l
    }

    private fun registerNetwork() {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onLost(network: Network) {
                if (lostAtElapsed == null) lostAtElapsed = SystemClock.elapsedRealtime()
            }

            override fun onAvailable(network: Network) {
                val lostAt = lostAtElapsed ?: return
                lostAtElapsed = null
                val secs = (SystemClock.elapsedRealtime() - lostAt) / 1000
                // Can only be sent once the connection is back.
                report("network_drop", duration = secs)
            }
        }
        try {
            cm.registerDefaultNetworkCallback(cb)
            connectivity = cm
            netCallback = cb
        } catch (e: Exception) {
            // ignore: network signal is best-effort
        }
    }

    private fun isoNow(): String {
        val f = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date())
    }

    private companion object {
        /** Backend allows at most 5 events/second; stay well under. */
        const val MIN_GAP_MS = 300L
    }
}
