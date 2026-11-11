package com.bnp.paribas.data.repository

import android.content.Context
import android.net.Uri
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody
import okio.Buffer
import okio.BufferedSink
import okio.source

/** Streams a content:// Uri into a multipart request in 8 KB chunks and reports progress (0..1). */
class UriRequestBody(
    private val context: Context,
    private val uri: Uri,
    private val size: Long,
    private val onProgress: (Float) -> Unit
) : RequestBody() {

    override fun contentType(): MediaType? = "application/pdf".toMediaType()

    override fun contentLength(): Long = size

    override fun writeTo(sink: BufferedSink) {
        val input = context.contentResolver.openInputStream(uri)
            ?: throw java.io.IOException("Unable to open the selected file.")
        input.use { stream ->
            val source = stream.source()
            val buffer = Buffer()
            var sent = 0L
            while (true) {
                val n = source.read(buffer, 8192L)
                if (n == -1L) break
                sink.write(buffer, n)
                sent += n
                if (size > 0) onProgress((sent.toFloat() / size).coerceIn(0f, 1f))
            }
        }
    }
}
