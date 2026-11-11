package com.bnp.paribas.features.resume

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*
import com.bnp.paribas.core.utils.AppScope
import com.bnp.paribas.core.utils.Dates
import com.bnp.paribas.features.profile.ResumeViewModel
import kotlinx.coroutines.launch

private data class PickedMeta(val name: String, val size: Long, val mime: String?)

private fun queryMeta(ctx: Context, uri: Uri): PickedMeta {
    var name = "resume.pdf"
    var size = -1L
    ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
        if (c.moveToFirst()) {
            val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val si = c.getColumnIndex(OpenableColumns.SIZE)
            if (ni >= 0) c.getString(ni)?.let { name = it }
            if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
        }
    }
    return PickedMeta(name, size, ctx.contentResolver.getType(uri))
}

private fun humanSize(bytes: Long): String =
    if (bytes >= 1024 * 1024) String.format("%.1f MB", bytes / (1024.0 * 1024.0)) else "${maxOf(1L, bytes / 1024)} KB"

@Composable
fun ResumeScreen(onBack: () -> Unit, vm: ResumeViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val ctx = LocalContext.current
    val snackbar = LocalSnackbar.current

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            val m = queryMeta(ctx, uri)
            vm.onPicked(uri, m.name, m.size, m.mime)
        }
    }

    LaunchedEffect(ui.done) {
        if (ui.done) {
            vm.consumeDone()
            AppScope.launch { snackbar.showSnackbar("Resume uploaded") }
            onBack()
        }
    }

    Column(Modifier.fillMaxSize()) {
        BackHeader("Resume", onBack)
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            val p = ui.profile
            AppCard {
                Text("Current resume", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                Spacer(Modifier.height(6.dp))
                if (p != null && p.resumeUploaded) {
                    InfoRow("File", p.resumeFilename ?: "Resume.pdf")
                    Dates.full(p.resumeUploadedAt)?.let {
                        Hairline()
                        InfoRow("Uploaded", it)
                    }
                } else {
                    Text("No resume uploaded", style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
                    Text("Upload your resume to start applying.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("Upload a new resume", style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
            Spacer(Modifier.height(4.dp))
            Text("PDF only, up to 5 MB.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
            Spacer(Modifier.height(12.dp))

            SecondaryButton(
                if (ui.pickedName == null) "Choose PDF" else "Choose a different PDF",
                onClick = { picker.launch(arrayOf("application/pdf")) },
                enabled = !ui.uploading
            )

            if (ui.pickedName != null) {
                Spacer(Modifier.height(12.dp))
                AppCard {
                    Text(ui.pickedName!!, style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                    if (ui.pickedSize > 0) {
                        Text(humanSize(ui.pickedSize), style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
                    }
                    if (ui.uploading) {
                        Spacer(Modifier.height(12.dp))
                        LinearProgressIndicator(
                            progress = { ui.progress },
                            modifier = Modifier.fillMaxWidth(),
                            color = Brand.Primary,
                            trackColor = Brand.Border
                        )
                        Spacer(Modifier.height(4.dp))
                        Text("Uploading… ${(ui.progress * 100).toInt()}%", style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
                    }
                }
            }

            if (ui.error != null) {
                Spacer(Modifier.height(12.dp))
                Text(
                    ui.error!!,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Brand.ErrorBg)
                        .padding(14.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = Brand.Error
                )
            }
        }

        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            PrimaryButton(
                "Upload",
                onClick = vm::upload,
                enabled = ui.pickedUri != null,
                loading = ui.uploading
            )
        }
    }
}
