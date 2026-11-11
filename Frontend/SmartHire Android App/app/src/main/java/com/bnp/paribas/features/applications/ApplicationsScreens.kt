package com.bnp.paribas.features.applications
import com.bnp.paribas.data.models.Rejection
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*
import com.bnp.paribas.core.utils.Dates
import com.bnp.paribas.data.models.ApplicationItem

// ------------------------------------------------------------------ list

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApplicationsScreen(
    onOpenApplication: (String) -> Unit,
    onFindJobs: () -> Unit,
    vm: ApplicationsViewModel = viewModel()
) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    OnLifecycle(onStart = { vm.refresh() })

    Column(Modifier.fillMaxSize()) {
        ScreenTitle("My Applications", "Track every step of your hiring journey.")
        PullToRefreshBox(
            isRefreshing = ui.refreshing,
            onRefresh = vm::refresh,
            modifier = Modifier.weight(1f)
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (ui.offline) item { OfflineBanner() }
                when {
                    ui.apps.isNotEmpty() -> items(ui.apps, key = { it.appId }) { app ->
                        ApplicationCard(app, onClick = { onOpenApplication(app.appId) })
                    }
                    !ui.loaded || ui.refreshing -> items(3) { SkeletonCard() }
                    ui.error != null -> item { ErrorState("We couldn't load your applications.", onRetry = vm::refresh) }
                    ui.offline -> item { ErrorState("Internet connection required.", onRetry = vm::refresh, title = "You're offline") }
                    else -> item {
                        EmptyState(
                            "No applications yet",
                            "Explore open positions and apply to your next opportunity.",
                            actionText = "Find Jobs",
                            onAction = onFindJobs
                        )
                    }
                }
            }
        }
    }
}

// ------------------------------------------------------------------ details

private enum class StepState { DONE, CURRENT, FAILED, HOLD, UPCOMING }

private data class Step(val label: String, val state: StepState)

/** Timeline derived purely from the backend status. */
private fun timeline(status: String): List<Step> {
    val labels = listOf("Applied", "Screening", "Exam", "Interview", "Final decision")
    val states: List<StepState> = when (status) {
        "NEW", "SCREENING" ->
            listOf(StepState.DONE, StepState.CURRENT, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING)
        "HOLD" ->
            listOf(StepState.DONE, StepState.HOLD, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING)
        "REJECTED" ->
            listOf(StepState.DONE, StepState.FAILED, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING)
        "SCREENING_PASSED", "EXAM_IN_PROGRESS", "EXAM_SCORING" ->
            listOf(StepState.DONE, StepState.DONE, StepState.CURRENT, StepState.UPCOMING, StepState.UPCOMING)
        "EXAM_REJECTED" ->
            listOf(StepState.DONE, StepState.DONE, StepState.FAILED, StepState.UPCOMING, StepState.UPCOMING)
        "EXAM_PASSED", "INTERVIEW_PENDING" ->
            listOf(StepState.DONE, StepState.DONE, StepState.DONE, StepState.CURRENT, StepState.UPCOMING)
        "ACCEPTED" ->
            listOf(StepState.DONE, StepState.DONE, StepState.DONE, StepState.DONE, StepState.DONE)
        "FINAL_REJECTED" ->
            listOf(StepState.DONE, StepState.DONE, StepState.DONE, StepState.DONE, StepState.FAILED)
        else ->
            listOf(StepState.DONE, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING, StepState.UPCOMING)
    }
    return labels.mapIndexed { i, l -> Step(l, states[i]) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ApplicationDetailsScreen(
    onBack: () -> Unit,
    onWriteExam: (examId: String) -> Unit,
    vm: ApplicationDetailsViewModel = viewModel()
) {
    val ui by vm.ui.collectAsStateWithLifecycle()

    // Network first while this screen is active; polling stops when it leaves the foreground.
    OnLifecycle(onStart = { vm.startPolling() }, onStop = { vm.stopPolling() })

    Column(Modifier.fillMaxSize()) {
        BackHeader("Application", onBack)
        val app = ui.app
        PullToRefreshBox(
            isRefreshing = ui.refreshing && app != null,
            onRefresh = vm::pullRefresh,
            modifier = Modifier.weight(1f)
        ) {
            when {
                app == null && (!ui.loaded || ui.refreshing) -> SkeletonList(2)
                app == null && ui.offline -> ErrorState("Internet connection required.", onRetry = vm::pullRefresh, title = "You're offline")
                app == null -> ErrorState(ui.error ?: "We couldn't load this application.", onRetry = vm::pullRefresh)
                else -> DetailsContent(app, ui, onWriteExam)
            }
        }
    }
}

@Composable
private fun DetailsContent(app: ApplicationItem, ui: ApplicationDetailsUi, onWriteExam: (String) -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 8.dp)
    ) {
        if (ui.offline) {
            OfflineBanner()
            Spacer(Modifier.height(12.dp))
        }

        Text(app.title, style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
        if (app.org.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(app.org, style = MaterialTheme.typography.bodyLarge, color = Brand.Muted)
        }
        val applied = Dates.full(app.createdAt)
        if (applied != null) {
            Spacer(Modifier.height(2.dp))
            Text("Applied $applied", style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
        }
        Spacer(Modifier.height(16.dp))

        // ---- status card ----
        AppCard {
            Text("Application status", style = MaterialTheme.typography.labelMedium, color = Brand.Muted)
            Spacer(Modifier.height(8.dp))
            StatusChip(app.status)
            Spacer(Modifier.height(12.dp))
            val rej = app.rejection
            if (rej != null) {
                RejectionSection(rej)
            } else when (app.status) {
                "NEW", "SCREENING" -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        CircularProgressIndicator(Modifier.size(18.dp), color = Brand.Primary, strokeWidth = 2.dp)
                        Spacer(Modifier.width(10.dp))
                        Text("We're reviewing your application", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                    }
                    Spacer(Modifier.height(6.dp))
                    Text("Your resume is currently being evaluated.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
                "HOLD" -> {
                    Text("Application under review", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                    Spacer(Modifier.height(6.dp))
                    Text(
                        "Your application needs additional review.\nWe'll update your status when the review is complete.",
                        style = MaterialTheme.typography.bodyMedium, color = Brand.Muted
                    )
                }
                "SCREENING_PASSED" -> {
                    Text("You're eligible!", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                    Spacer(Modifier.height(6.dp))
                    Text("You can now take the written assessment.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
                else -> {
                    val msg = app.statusMessage ?: statusStyle(app.status).defaultMessage
                    if (msg.isNotBlank()) {
                        Text(msg, style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
                    }
                }
            }

            val canExam = app.examId != null && (app.status == "SCREENING_PASSED" || app.status == "EXAM_IN_PROGRESS")
            if (canExam) {
                Spacer(Modifier.height(16.dp))
                PrimaryButton(
                    if (app.status == "EXAM_IN_PROGRESS") "Resume Exam" else "Write Exam",
                    onClick = { onWriteExam(app.examId!!) }
                )
            }
        }

        Spacer(Modifier.height(20.dp))
        Text("Progress", style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
        Spacer(Modifier.height(12.dp))
        Timeline(timeline(app.status))
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun Timeline(steps: List<Step>) {
    Column {
        steps.forEachIndexed { i, step ->
            Row(Modifier.fillMaxWidth()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(28.dp)) {
                    StepDot(step.state)
                    if (i != steps.lastIndex) {
                        Box(
                            Modifier
                                .width(2.dp)
                                .height(24.dp)
                                .background(if (step.state == StepState.DONE) Brand.Primary else Brand.Border)
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                val (color, weightText) = when (step.state) {
                    StepState.DONE -> Brand.Ink to null
                    StepState.CURRENT -> Brand.Primary to "In progress"
                    StepState.HOLD -> Brand.Warning to "On hold"
                    StepState.FAILED -> Brand.Error to "Not selected"
                    StepState.UPCOMING -> Brand.Muted to null
                }
                Column(Modifier.padding(top = 3.dp)) {
                    Text(step.label, style = MaterialTheme.typography.titleSmall, color = color)
                    if (weightText != null) {
                        Text(weightText, style = MaterialTheme.typography.bodySmall, color = color)
                    }
                }
            }
        }
    }
}

@Composable
private fun StepDot(state: StepState) {
    val (bg, border) = when (state) {
        StepState.DONE -> Brand.Primary to Brand.Primary
        StepState.CURRENT -> Color.White to Brand.Primary
        StepState.HOLD -> Brand.WarningBg to Brand.Warning
        StepState.FAILED -> Brand.Error to Brand.Error
        StepState.UPCOMING -> Color.White to Brand.Border
    }
    Box(
        modifier = Modifier
            .size(24.dp)
            .clip(CircleShape)
            .background(bg)
            .border(2.dp, border, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        when (state) {
            StepState.DONE -> Icon(Icons.Filled.Check, null, tint = Color.White, modifier = Modifier.size(14.dp))
            StepState.FAILED -> Icon(Icons.Filled.Close, null, tint = Color.White, modifier = Modifier.size(14.dp))
            StepState.CURRENT -> Box(Modifier.size(8.dp).clip(CircleShape).background(Brand.Primary))
            StepState.HOLD -> Box(Modifier.size(8.dp).clip(CircleShape).background(Brand.Warning))
            StepState.UPCOMING -> Unit
        }
    }
}
@Composable
private fun RejectionSection(r: Rejection) {
    when (r.stage) {
        "EXAM" -> {
            Text("Assessment Result", style = MaterialTheme.typography.titleSmall, color = Brand.Muted)
            Spacer(Modifier.height(10.dp))
            if (r.scorePercent != null) {
                Text("${r.scorePercent}%", style = MaterialTheme.typography.displaySmall, color = Brand.Ink)
            }
            if (r.marksAwarded != null && r.marksPossible != null) {
                Text("${r.marksAwarded} / ${r.marksPossible}", style = MaterialTheme.typography.titleMedium, color = Brand.Muted)
            }
            Spacer(Modifier.height(10.dp))
            Text("Not Passed", style = MaterialTheme.typography.titleSmall, color = Brand.Error)
            Spacer(Modifier.height(8.dp))
            Text(
                r.reason.ifBlank { "Your written exam score was below what this role requires." },
                style = MaterialTheme.typography.bodyMedium, color = Brand.Ink
            )
        }
        "INTERVIEW" -> {
            Text("Application Update", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
            Spacer(Modifier.height(6.dp))
            Text(
                r.reason.ifBlank { "The hiring team decided not to move forward with your application." },
                style = MaterialTheme.typography.bodyMedium, color = Brand.Ink
            )
            val date = Dates.full(r.decidedAt)
            if (date != null) {
                Spacer(Modifier.height(10.dp))
                Text("Decision date", style = MaterialTheme.typography.labelMedium, color = Brand.Muted)
                Text(date, style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
            }
        }
        else -> { // SCREENING
            Text("Application Update", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
            Spacer(Modifier.height(6.dp))
            Text("We're not moving forward with this application.", style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
            Spacer(Modifier.height(10.dp))
            Text("Why?", style = MaterialTheme.typography.labelMedium, color = Brand.Muted)
            Text(
                r.reason.ifBlank { "Your resume did not show enough of the requirements for this role." },
                style = MaterialTheme.typography.bodyMedium, color = Brand.Ink
            )
            if (r.missingRequirements.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Text("Requirements not evidenced:", style = MaterialTheme.typography.labelMedium, color = Brand.Muted)
                r.missingRequirements.forEach {
                    Text("• $it", style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
                }
            }
        }
    }
}