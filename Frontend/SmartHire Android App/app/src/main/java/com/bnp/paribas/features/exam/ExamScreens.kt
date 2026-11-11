package com.bnp.paribas.features.exam

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.ContextWrapper
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*

private fun Context.findActivity(): Activity? {
    var c: Context = this
    while (c is ContextWrapper) {
        if (c is Activity) return c
        c = c.baseContext
    }
    return null
}

private fun formatTime(ms: Long): String {
    val s = maxOf(0L, (ms + 999) / 1000)
    val h = s / 3600
    val m = (s % 3600) / 60
    val sec = s % 60
    return if (h > 0) String.format("%d:%02d:%02d", h, m, sec) else String.format("%02d:%02d", m, sec)
}

private fun humanStatus(s: String): String =
    if (s.isBlank()) "—" else s.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }

// ============================================================================ exam login

@Composable
fun ExamLoginScreen(onBack: () -> Unit, onSuccess: (examId: String) -> Unit, vm: ExamLoginViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var password by remember { mutableStateOf("") } // never saved

    LaunchedEffect(ui.done) { if (ui.done) onSuccess(vm.examId) }

    Column(Modifier.fillMaxSize().imePadding()) {
        BackHeader("Written assessment", onBack)
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            Text("Sign in to your exam", style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
            Spacer(Modifier.height(6.dp))
            Text(
                "The assessment uses its own secure session. Confirm your account password to continue.",
                style = MaterialTheme.typography.bodyMedium, color = Brand.Muted
            )
            Spacer(Modifier.height(20.dp))

            AppCard {
                InfoRow("Exam ID", vm.examId)
            }
            Spacer(Modifier.height(16.dp))

            if (ui.error != null) {
                Text(
                    ui.error!!,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Brand.ErrorBg)
                        .padding(14.dp),
                    style = MaterialTheme.typography.bodyMedium, color = Brand.Error
                )
                Spacer(Modifier.height(12.dp))
            }

            AppTextField(
                value = ui.email, onValueChange = vm::onEmailChange, label = "Email",
                keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
            )
            Spacer(Modifier.height(12.dp))
            AppTextField(
                value = password, onValueChange = { password = it }, label = "Password",
                password = true, imeAction = ImeAction.Done, onImeAction = { vm.submit(password) }
            )
            Spacer(Modifier.height(12.dp))
            Text(
                "This assessment is proctored. Leaving the app, copying and pasting are recorded.",
                style = MaterialTheme.typography.bodySmall, color = Brand.Muted
            )
        }
        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            PrimaryButton("Continue", onClick = { vm.submit(password) }, loading = ui.busy)
        }
    }
}

// ============================================================================ exam

@Composable
fun ExamScreen(
    onExit: () -> Unit,
    onSubmitted: () -> Unit,
    onSessionExpired: () -> Unit,
    vm: ExamViewModel = viewModel()
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    val snackbar = LocalSnackbar.current
    val ctx = LocalContext.current
    var showLeave by remember { mutableStateOf(false) }

    LaunchedEffect(ui.submitted) { if (ui.submitted) onSubmitted() }
    LaunchedEffect(ui.sessionExpired) { if (ui.sessionExpired) onSessionExpired() }
    LaunchedEffect(ui.toast) {
        val t = ui.toast
        if (t != null) {
            snackbar.showSnackbar(t)
            vm.consumeToast()
        }
    }

    // Leaving the foreground during the exam is reported as a tab switch.
    val owner = LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) vm.onBackgrounded() }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs) }
    }

    // Distraction-free: immersive mode + no screenshots while the paper is open.
    val active = ui.stage == ExamStage.ACTIVE || ui.stage == ExamStage.SUBMITTING
    DisposableEffect(active) {
        val window = ctx.findActivity()?.window
        if (active && window != null) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            val c = WindowCompat.getInsetsController(window, window.decorView)
            c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            c.hide(WindowInsetsCompat.Type.systemBars())
        }
        onDispose {
            if (window != null) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                WindowCompat.getInsetsController(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
            }
        }
    }

    // Back never submits and never silently discards work.
    BackHandler(enabled = ui.stage == ExamStage.ACTIVE || ui.stage == ExamStage.STARTING || ui.stage == ExamStage.SUBMITTING) {
        if (ui.stage == ExamStage.ACTIVE) showLeave = true
    }

    if (showLeave) {
        AlertDialog(
            onDismissRequest = { showLeave = false },
            title = { Text("Leave assessment?") },
            text = { Text("Your current answers are saved locally, but leaving the assessment may interrupt your session.") },
            confirmButton = {
                TextButton(onClick = { showLeave = false; vm.leave(); onExit() }) { Text("Leave", color = Brand.Error) }
            },
            dismissButton = {
                TextButton(onClick = { showLeave = false }) { Text("Stay", color = Brand.Primary) }
            },
            containerColor = Color.White
        )
    }

    if (ui.stage == ExamStage.ACTIVE && ui.showConfirm) {
        AlertDialog(
            onDismissRequest = vm::cancelSubmit,
            title = { Text("Submit assessment?") },
            text = { Text("You won't be able to change your answers after submission.") },
            confirmButton = { TextButton(onClick = vm::confirmSubmit) { Text("Submit", color = Brand.Primary) } },
            dismissButton = { TextButton(onClick = vm::cancelSubmit) { Text("Continue Exam", color = Brand.Muted) } },
            containerColor = Color.White
        )
    }

    when (ui.stage) {
        ExamStage.LOADING -> FullScreenLoader()
        ExamStage.ERROR -> Column(Modifier.fillMaxSize()) {
            BackHeader("Written assessment", onExit)
            ErrorState(ui.error ?: "We couldn't load this examination.", onRetry = vm::load)
        }
        ExamStage.OVERVIEW -> OverviewContent(ui, vm, onExit)
        ExamStage.STARTING -> Column(
            Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(color = Brand.Primary)
            Spacer(Modifier.height(16.dp))
            Text("Starting your assessment…", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        }
        ExamStage.ACTIVE -> {
            // Questions stay hidden until the ID popup has been dismissed.
            if (!ui.showIdPopup) ActiveExam(ui, vm)
            else Box(Modifier.fillMaxSize().background(Color.White))
        }
        ExamStage.SUBMITTING -> Column(
            Modifier.fillMaxSize(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            CircularProgressIndicator(color = Brand.Primary)
            Spacer(Modifier.height(16.dp))
            Text("Submitting…", style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
            Text("Please don't close the app.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        }
    }

    if (ui.stage == ExamStage.ACTIVE && ui.showIdPopup) {
        ExamIdDialog(
            examId = ui.examIdShown,
            onCopied = vm::onIdCopied,
            onContinue = vm::continueToExam
        )
    }
}

@Composable
private fun OverviewContent(ui: ExamUi, vm: ExamViewModel, onExit: () -> Unit) {
    val ov = ui.overview
    Column(Modifier.fillMaxSize()) {
        BackHeader("Written assessment", onExit)
        if (ov == null) {
            FullScreenLoader()
            return@Column
        }
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp)
        ) {
            Text(ov.jobTitle, style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
            if (ov.organization.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(ov.organization, style = MaterialTheme.typography.bodyLarge, color = Brand.Muted)
            }
            Spacer(Modifier.height(16.dp))

            val resumable = ov.started && !ov.submitted
            val blocked = !ov.canStart && !resumable
            val msg = ui.note ?: if (blocked) (ov.message ?: "This assessment can't be started right now.") else null
            if (msg != null) {
                Text(
                    msg,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Brand.WarningBg)
                        .padding(14.dp),
                    style = MaterialTheme.typography.bodyMedium, color = Brand.Warning
                )
                Spacer(Modifier.height(12.dp))
            }

            AppCard {
                if (ov.candidate.isNotBlank()) {
                    InfoRow("Candidate", ov.candidate)
                    Hairline()
                }
                InfoRow("Questions", ov.questionCount)
                Hairline()
                InfoRow("Total marks", ov.totalMarks)
                if (ov.integrity != null) {
                    Hairline()
                    InfoRow("Integrity score", ov.integrity)
                }
                Hairline()
                InfoRow("Status", if (resumable) "In progress" else if (blocked) humanStatus(ov.status) else "Ready to start")
            }

            Spacer(Modifier.height(16.dp))
            AppCard {
                Text("Before you begin", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                Spacer(Modifier.height(6.dp))
                Text(
                    "• Stay in the app until you submit.\n• Leaving the app, copying and pasting are recorded.\n• Unanswered questions still count towards the total.\n• Your answers are saved on this device as you type.",
                    style = MaterialTheme.typography.bodyMedium, color = Brand.Muted
                )
            }
            Spacer(Modifier.height(16.dp))
        }
        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            val resumable = ov.started && !ov.submitted
            PrimaryButton(
                if (resumable) "Resume Exam" else "Start Exam",
                onClick = vm::start,
                enabled = ov.canStart || resumable
            )
        }
    }
}

@Composable
private fun ExamIdDialog(examId: String, onCopied: () -> Unit, onContinue: () -> Unit) {
    val ctx = LocalContext.current
    var copied by remember { mutableStateOf(false) }

    Dialog(
        onDismissRequest = {},
        properties = DialogProperties(dismissOnBackPress = false, dismissOnClickOutside = false)
    ) {
        Surface(shape = RoundedCornerShape(20.dp), color = Color.White) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                BrandMark(48.dp)
                Spacer(Modifier.height(16.dp))
                Text("Exam Started", style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Copy the ID below before continuing to the assessment.",
                    style = MaterialTheme.typography.bodyMedium, color = Brand.Muted, textAlign = TextAlign.Center
                )
                Spacer(Modifier.height(20.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(Brand.Surface)
                        .border(1.dp, Brand.Border, RoundedCornerShape(12.dp))
                        .padding(start = 16.dp, top = 4.dp, bottom = 4.dp, end = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        examId,
                        modifier = Modifier.weight(1f),
                        style = MaterialTheme.typography.titleSmall.copy(fontFamily = FontFamily.Monospace),
                        color = Brand.Ink,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    TextButton(onClick = {
                        // Only the exam ID is copied — never a token or credential.
                        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newPlainText("Exam ID", examId))
                        copied = true
                        onCopied()
                    }) {
                        Text(if (copied) "Copied" else "Copy", color = Brand.Primary, style = MaterialTheme.typography.labelLarge)
                    }
                }
                if (copied) {
                    Spacer(Modifier.height(8.dp))
                    Text("Exam ID copied", style = MaterialTheme.typography.bodySmall, color = Brand.Success)
                }
                Spacer(Modifier.height(24.dp))
                PrimaryButton("Continue to Exam", onContinue)
            }
        }
    }
}

@Composable
private fun ActiveExam(ui: ExamUi, vm: ExamViewModel) {
    val q = ui.questions.getOrNull(ui.current) ?: return
    val total = ui.questions.size
    val answered = ui.questions.count { !ui.answers[it.id].isNullOrBlank() }
    val editable = ui.stage == ExamStage.ACTIVE

    Column(Modifier.fillMaxSize().imePadding()) {
        // ---- header ----
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    if (ui.jobTitle.isNotBlank()) "${ui.jobTitle} Assessment" else "Assessment",
                    style = MaterialTheme.typography.titleSmall, color = Brand.Ink, maxLines = 1, overflow = TextOverflow.Ellipsis
                )
                if (ui.integrity != null) {
                    Text("Integrity ${ui.integrity}", style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
                }
            }
            if (ui.hasTimer) {
                val low = ui.remainingMs <= 5 * 60_000L
                Text(
                    formatTime(ui.remainingMs),
                    style = MaterialTheme.typography.titleMedium.copy(fontFamily = FontFamily.Monospace),
                    color = if (low) Brand.Error else Brand.Ink
                )
            }
        }
        LinearProgressIndicator(
            progress = { if (total == 0) 0f else answered.toFloat() / total },
            modifier = Modifier.fillMaxWidth(),
            color = Brand.Primary,
            trackColor = Brand.Border
        )

        // ---- question ----
        Column(
            Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 16.dp)
        ) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "Question ${ui.current + 1} of $total",
                    style = MaterialTheme.typography.labelLarge, color = Brand.Muted, modifier = Modifier.weight(1f)
                )
                Text(
                    "${q.marks} ${if (q.marks == "1") "mark" else "marks"}",
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(Brand.PrimarySoft)
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    style = MaterialTheme.typography.labelMedium, color = Brand.PrimaryDark
                )
            }
            Spacer(Modifier.height(14.dp))
            Text(q.text, style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
            Spacer(Modifier.height(16.dp))

            key(q.id) {
                OutlinedTextField(
                    value = ui.answers[q.id].orEmpty(),
                    onValueChange = vm::onAnswerChanged,
                    enabled = editable,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 260.dp),
                    placeholder = { Text("Type your answer here…") },
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Brand.Primary,
                        unfocusedBorderColor = Brand.Border,
                        cursorColor = Brand.Primary
                    )
                )
            }
            Spacer(Modifier.height(8.dp))
            Text("$answered of $total answered", style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
        }

        // ---- footer ----
        Column(Modifier.padding(horizontal = 20.dp, vertical = 12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryButton("Previous", onClick = { vm.goTo(ui.current - 1) }, modifier = Modifier.weight(1f), enabled = editable && ui.current > 0)
                SecondaryButton("Next", onClick = { vm.goTo(ui.current + 1) }, modifier = Modifier.weight(1f), enabled = editable && ui.current < total - 1)
            }
            Spacer(Modifier.height(10.dp))
            PrimaryButton("Submit", onClick = vm::requestSubmit, enabled = editable)
        }
    }
}

// ============================================================================ exam result

@Composable
fun ExamResultScreen(onDone: () -> Unit, vm: ExamResultViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    OnLifecycle(onStart = { vm.startPolling() }, onStop = { vm.stopPolling() })

    val r = ui.result
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        when {
            r != null && r.scored -> {
                Text("Assessment Result", style = MaterialTheme.typography.titleMedium, color = Brand.Muted)
                Spacer(Modifier.height(16.dp))
                Text(
                    (r.scorePercent ?: "—") + if (r.scorePercent != null) "%" else "",
                    style = MaterialTheme.typography.displayMedium, color = Brand.Ink
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    "${r.marksAwarded ?: "—"} / ${r.marksPossible ?: "—"}",
                    style = MaterialTheme.typography.titleLarge, color = Brand.Muted
                )
                Spacer(Modifier.height(20.dp))
                when (r.passed) {
                    true -> ResultPill("Passed", Brand.Success, Brand.SuccessBg)
                    false -> ResultPill("Not passed", Brand.Error, Brand.ErrorBg)
                    null -> Unit
                }
                if (r.integrity != null) {
                    Spacer(Modifier.height(20.dp))
                    Text("Integrity score: ${r.integrity}", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
                Spacer(Modifier.height(32.dp))
                PrimaryButton("Back to applications", onDone)
            }
            ui.error != null -> {
                ErrorState(ui.error!!, onRetry = if (ui.expired) onDone else vm::retry)
            }
            else -> {
                CircularProgressIndicator(color = Brand.Primary)
                Spacer(Modifier.height(24.dp))
                Text("Assessment submitted", style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Your answers are being evaluated.\nThis may take a few moments.",
                    style = MaterialTheme.typography.bodyMedium, color = Brand.Muted, textAlign = TextAlign.Center
                )
                if (ui.note != null) {
                    Spacer(Modifier.height(12.dp))
                    Text(ui.note!!, style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
                }
            }
        }
    }
}

@Composable
private fun ResultPill(text: String, fg: Color, bg: Color) {
    Text(
        text,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(bg)
            .padding(horizontal = 16.dp, vertical = 6.dp),
        style = MaterialTheme.typography.titleSmall,
        color = fg
    )
}
