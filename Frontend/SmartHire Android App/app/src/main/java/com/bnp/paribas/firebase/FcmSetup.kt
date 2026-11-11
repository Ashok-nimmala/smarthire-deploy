package com.bnp.paribas.firebase

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import com.bnp.paribas.R
import com.bnp.paribas.data.local.Graph
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Initialises Firebase + FCM. The registration token is kept locally only: the SmartHire
 * backend has no device-registration endpoint, so nothing is ever sent to it.
 * The token is never logged.
 */
object FcmSetup {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun init(context: Context) {
        createChannel(context)

        // No google-services.json => Firebase is not configured; the app still runs without FCM.
        val configured = try {
            FirebaseApp.getApps(context).isNotEmpty() || FirebaseApp.initializeApp(context) != null
        } catch (e: Exception) {
            false
        }
        if (!configured) return

        try {
            FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
                if (!token.isNullOrEmpty()) scope.launch { Graph.store.saveFcmToken(token) }
            }
        } catch (e: Exception) {
            // FCM unavailable on this device; ignore.
        }
    }

    fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val id = context.getString(R.string.notification_channel_id)
        if (nm.getNotificationChannel(id) == null) {
            nm.createNotificationChannel(
                NotificationChannel(
                    id,
                    context.getString(R.string.notification_channel_name),
                    NotificationManager.IMPORTANCE_DEFAULT
                )
            )
        }
    }
}
