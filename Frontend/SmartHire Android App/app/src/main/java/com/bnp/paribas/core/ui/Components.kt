package com.bnp.paribas.core.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver

val LocalSnackbar = staticCompositionLocalOf<SnackbarHostState> { error("SnackbarHostState not provided") }

// ---------------------------------------------------------------- lifecycle helper

/** Runs [onStart] when the screen becomes visible and [onStop] when it leaves the foreground. */
@Composable
fun OnLifecycle(onStart: () -> Unit, onStop: () -> Unit = {}) {
    val owner = LocalLifecycleOwner.current
    val start by rememberUpdatedState(onStart)
    val stop by rememberUpdatedState(onStop)
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> start()
                Lifecycle.Event.ON_STOP -> stop()
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(obs)
        onDispose {
            owner.lifecycle.removeObserver(obs)
            stop()
        }
    }
}

// ---------------------------------------------------------------- cards & text

@Composable
fun AppCard(
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit
) {
    val shape = RoundedCornerShape(14.dp)
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clip(shape)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier),
        shape = shape,
        color = Color.White,
        border = BorderStroke(1.dp, Brand.Border)
    ) {
        Column(modifier = Modifier.padding(16.dp), content = content)
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, action: String? = null, onAction: () -> Unit = {}) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text, style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
        if (action != null) {
            TextButton(onClick = onAction) { Text(action, style = MaterialTheme.typography.labelLarge) }
        }
    }
}

@Composable
fun ScreenTitle(title: String, subtitle: String? = null, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(title, style = MaterialTheme.typography.headlineMedium, color = Brand.Ink)
        if (subtitle != null) {
            Spacer(Modifier.height(4.dp))
            Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        }
    }
}

@Composable
fun BackHeader(title: String, onBack: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 4.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = Brand.Ink)
        }
        Text(title, style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
    }
}

@Composable
fun InfoRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(color = Brand.Ink), textAlign = TextAlign.End)
    }
}

@Composable
fun Hairline() {
    HorizontalDivider(color = Brand.Border, thickness = 1.dp)
}

// ---------------------------------------------------------------- buttons

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false
) {
    Button(
        onClick = onClick,
        enabled = enabled && !loading,
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Brand.Primary,
            contentColor = Color.White,
            disabledContainerColor = if (loading) Brand.Primary else Brand.Border,
            disabledContentColor = if (loading) Color.White else Brand.Muted
        )
    ) {
        if (loading) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
        } else {
            Text(text, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun SecondaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier
            .fillMaxWidth()
            .height(52.dp),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, Brand.Border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = Brand.Ink)
    ) {
        Text(text, style = MaterialTheme.typography.labelLarge)
    }
}

// ---------------------------------------------------------------- text field

@Composable
fun AppTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    error: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onImeAction: () -> Unit = {},
    password: Boolean = false,
    enabled: Boolean = true,
    singleLine: Boolean = true
) {
    var visible by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        singleLine = singleLine,
        isError = error != null,
        supportingText = if (error != null) ({ Text(error) }) else null,
        visualTransformation = if (password && !visible) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = if (password) KeyboardType.Password else keyboardType, imeAction = imeAction),
        keyboardActions = KeyboardActions(onNext = { onImeAction() }, onDone = { onImeAction() }, onGo = { onImeAction() }, onSearch = { onImeAction() }),
        trailingIcon = if (password) ({
            TextButton(onClick = { visible = !visible }) {
                Text(if (visible) "Hide" else "Show", color = Brand.Primary, style = MaterialTheme.typography.labelLarge)
            }
        }) else null,
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = Brand.Primary,
            unfocusedBorderColor = Brand.Border,
            focusedLabelColor = Brand.Primary,
            cursorColor = Brand.Primary
        )
    )
}

// ---------------------------------------------------------------- status chips

data class StatusStyle(val label: String, val fg: Color, val bg: Color, val defaultMessage: String)

fun statusStyle(status: String): StatusStyle = when (status.uppercase()) {
    "NEW" -> StatusStyle("Submitted", Brand.Info, Brand.InfoBg, "Your application has been received.")
    "SCREENING" -> StatusStyle("Screening", Brand.Info, Brand.InfoBg, "Your resume is being reviewed.")
    "SCREENING_PASSED" -> StatusStyle("Eligible", Brand.Success, Brand.SuccessBg, "You're eligible for the written assessment.")
    "HOLD" -> StatusStyle("Under review", Brand.Warning, Brand.WarningBg, "Your application needs additional review.")
    "REJECTED" -> StatusStyle("Not selected", Brand.Error, Brand.ErrorBg, "Your application was not selected for this role.")
    "EXAM_IN_PROGRESS" -> StatusStyle("Exam in progress", Brand.Info, Brand.InfoBg, "Your assessment is in progress.")
    "EXAM_SCORING" -> StatusStyle("Scoring", Brand.Info, Brand.InfoBg, "Your assessment is being evaluated.")
    "EXAM_PASSED" -> StatusStyle("Exam passed", Brand.Success, Brand.SuccessBg, "You passed the written assessment.")
    "EXAM_REJECTED" -> StatusStyle("Not selected", Brand.Error, Brand.ErrorBg, "Your application was not selected to continue.")
    "INTERVIEW_PENDING" -> StatusStyle("Interview", Brand.Info, Brand.InfoBg, "Your interview is pending.")
    "ACCEPTED" -> StatusStyle("Accepted", Brand.Success, Brand.SuccessBg, "Congratulations — you've been accepted.")
    "FINAL_REJECTED" -> StatusStyle("Not selected", Brand.Error, Brand.ErrorBg, "Your application was not selected.")
    else -> StatusStyle(status.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }, Brand.Neutral, Brand.NeutralBg, "")
}

@Composable
fun StatusChip(status: String, modifier: Modifier = Modifier) {
    val s = statusStyle(status)
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(999.dp))
            .background(s.bg)
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .clip(CircleShape)
                .background(s.fg)
        )
        Spacer(Modifier.size(6.dp))
        Text(s.label, style = MaterialTheme.typography.labelMedium, color = s.fg)
    }
}

// ---------------------------------------------------------------- states

@Composable
fun ErrorState(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier,
    title: String = "Something went wrong"
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Brand.ErrorBg),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = Brand.Error)
        }
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted, textAlign = TextAlign.Center)
        Spacer(Modifier.height(20.dp))
        SecondaryButton("Try Again", onRetry, modifier = Modifier.padding(horizontal = 40.dp))
    }
}

@Composable
fun EmptyState(
    title: String,
    message: String,
    modifier: Modifier = Modifier,
    actionText: String? = null,
    onAction: () -> Unit = {}
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(Brand.PrimarySoft),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = Brand.Primary)
        }
        Spacer(Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.titleMedium, color = Brand.Ink)
        Spacer(Modifier.height(6.dp))
        Text(message, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted, textAlign = TextAlign.Center)
        if (actionText != null) {
            Spacer(Modifier.height(20.dp))
            PrimaryButton(actionText, onAction, modifier = Modifier.padding(horizontal = 40.dp))
        }
    }
}

@Composable
fun OfflineBanner(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Brand.WarningBg)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = Brand.Warning, modifier = Modifier.size(18.dp))
        Spacer(Modifier.size(10.dp))
        Column {
            Text("You're offline", style = MaterialTheme.typography.labelLarge, color = Brand.Warning)
            Text("Showing your last saved information.", style = MaterialTheme.typography.bodySmall, color = Brand.Warning)
        }
    }
}

// ---------------------------------------------------------------- skeletons

@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 16.dp) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val a by transition.animateFloat(
        initialValue = 0.45f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(800), RepeatMode.Reverse),
        label = "alpha"
    )
    Box(
        modifier = modifier
            .height(height)
            .alpha(a)
            .clip(RoundedCornerShape(8.dp))
            .background(Brand.NeutralBg)
    )
}

@Composable
fun SkeletonCard(modifier: Modifier = Modifier) {
    AppCard(modifier = modifier) {
        Skeleton(Modifier.fillMaxWidth(0.6f), 18.dp)
        Spacer(Modifier.height(10.dp))
        Skeleton(Modifier.fillMaxWidth(0.4f), 14.dp)
        Spacer(Modifier.height(14.dp))
        Skeleton(Modifier.fillMaxWidth(), 12.dp)
        Spacer(Modifier.height(6.dp))
        Skeleton(Modifier.fillMaxWidth(0.8f), 12.dp)
    }
}

@Composable
fun SkeletonList(count: Int = 4, modifier: Modifier = Modifier) {
    Column(modifier = modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        repeat(count) { SkeletonCard() }
    }
}

@Composable
fun FullScreenLoader(modifier: Modifier = Modifier) {
    Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = Brand.Primary, strokeWidth = 3.dp)
    }
}
