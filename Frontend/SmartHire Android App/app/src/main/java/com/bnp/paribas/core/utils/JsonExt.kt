package com.bnp.paribas.core.utils

import org.json.JSONArray
import org.json.JSONObject

/** First non-blank scalar value among the given keys, as a string. */
fun JSONObject.str(vararg keys: String): String? {
    for (k in keys) {
        if (!has(k) || isNull(k)) continue
        val v = opt(k)
        if (v is JSONObject || v is JSONArray) continue
        val s = v.toString()
        if (s.isNotBlank()) return s
    }
    return null
}

fun JSONObject.obj(vararg keys: String): JSONObject? {
    for (k in keys) {
        val o = optJSONObject(k)
        if (o != null) return o
    }
    return null
}

fun JSONObject.arr(vararg keys: String): JSONArray? {
    for (k in keys) {
        val a = optJSONArray(k)
        if (a != null) return a
    }
    return null
}

fun JSONObject.int(vararg keys: String): Int? = str(*keys)?.toDoubleOrNull()?.toInt()

fun JSONObject.bool(vararg keys: String): Boolean? {
    val s = str(*keys) ?: return null
    return when (s.lowercase()) {
        "true", "1", "yes" -> true
        "false", "0", "no" -> false
        else -> null
    }
}

fun JSONArray.objects(): List<JSONObject> {
    val out = ArrayList<JSONObject>(length())
    for (i in 0 until length()) {
        val o = optJSONObject(i)
        if (o != null) out.add(o)
    }
    return out
}

/** "96.0" -> "96", "96.50" -> "96.5" */
fun tidyNumber(s: String?): String? {
    if (s == null) return null
    return if (s.contains('.')) s.trimEnd('0').trimEnd('.') else s
}
