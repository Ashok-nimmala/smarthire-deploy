package com.bnp.paribas.core.utils

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Long-lived scope for UI feedback that must survive navigation (e.g. a snackbar shown after a screen closes). */
object AppScope : CoroutineScope by CoroutineScope(SupervisorJob() + Dispatchers.Main)
