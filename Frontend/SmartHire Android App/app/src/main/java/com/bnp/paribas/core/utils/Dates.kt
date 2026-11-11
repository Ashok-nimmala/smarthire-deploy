package com.bnp.paribas.core.utils

import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Tolerant date formatting: accepts ISO-8601 strings or epoch seconds/millis. */
object Dates {

    private fun toInstant(raw: String?): Instant? {
        if (raw.isNullOrBlank()) return null
        raw.toDoubleOrNull()?.let { d ->
            val ms = if (d > 1e11) d.toLong() else (d * 1000).toLong()
            return Instant.ofEpochMilli(ms)
        }
        val zone = ZoneId.systemDefault()
        return try {
            Instant.parse(raw)
        } catch (e: Exception) {
            try {
                OffsetDateTime.parse(raw).toInstant()
            } catch (e2: Exception) {
                try {
                    LocalDateTime.parse(raw).atZone(zone).toInstant()
                } catch (e3: Exception) {
                    try {
                        LocalDate.parse(raw).atStartOfDay(zone).toInstant()
                    } catch (e4: Exception) {
                        null
                    }
                }
            }
        }
    }

    private fun format(raw: String?, pattern: String): String? {
        val i = toInstant(raw) ?: return null
        return DateTimeFormatter.ofPattern(pattern, Locale.getDefault())
            .withZone(ZoneId.systemDefault())
            .format(i)
    }

    fun short(raw: String?): String? = format(raw, "MMM d")

    fun full(raw: String?): String? = format(raw, "MMM d, yyyy")

    fun relative(raw: String?): String? {
        val i = toInstant(raw) ?: return null
        val mins = Duration.between(i, Instant.now()).toMinutes()
        return when {
            mins < 1 -> "Just now"
            mins < 60 -> "$mins min ago"
            mins < 60 * 24 -> "${mins / 60} h ago"
            mins < 60 * 24 * 2 -> "Yesterday"
            mins < 60 * 24 * 30 -> "${mins / (60 * 24)} days ago"
            else -> short(raw)
        }
    }
}
