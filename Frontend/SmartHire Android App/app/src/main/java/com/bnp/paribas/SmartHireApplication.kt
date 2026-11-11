package com.bnp.paribas

import android.app.Application
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.firebase.FcmSetup

class SmartHireApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
        FcmSetup.init(this)
    }
}
