package com.bnp.paribas.core.utils

import android.util.Patterns

object Validators {
    fun email(s: String): Boolean = Patterns.EMAIL_ADDRESS.matcher(s).matches()
}
