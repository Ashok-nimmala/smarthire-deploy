package com.bnp.paribas.features.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*

@Composable
private fun ErrorBanner(text: String) {
    Text(
        text,
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Brand.ErrorBg)
            .padding(14.dp),
        style = MaterialTheme.typography.bodyMedium,
        color = Brand.Error
    )
}

@Composable
fun LoginScreen(onSignup: () -> Unit, onDone: () -> Unit, vm: LoginViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") } // never saved to state/bundle
    val focus = LocalFocusManager.current

    LaunchedEffect(ui.done) { if (ui.done) onDone() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.Top
    ) {
        Spacer(Modifier.height(56.dp))
        BrandMark()
        Spacer(Modifier.height(28.dp))
        Text("Welcome back", style = MaterialTheme.typography.headlineMedium, color = Brand.Ink)
        Spacer(Modifier.height(6.dp))
        Text("Sign in to continue with your applications.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        Spacer(Modifier.height(32.dp))

        if (ui.error != null) {
            ErrorBanner(ui.error!!)
            Spacer(Modifier.height(16.dp))
        }

        AppTextField(
            value = email, onValueChange = { email = it }, label = "Email",
            error = ui.emailError, keyboardType = KeyboardType.Email,
            onImeAction = { focus.moveFocus(FocusDirection.Down) }
        )
        Spacer(Modifier.height(12.dp))
        AppTextField(
            value = password, onValueChange = { password = it }, label = "Password",
            error = ui.passwordError, password = true, imeAction = ImeAction.Done,
            onImeAction = { focus.clearFocus(); vm.submit(email, password) }
        )
        Spacer(Modifier.height(24.dp))
        PrimaryButton("Sign In", onClick = { focus.clearFocus(); vm.submit(email, password) }, loading = ui.busy)

        Spacer(Modifier.height(24.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Text("Don't have an account?", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
            TextButton(onClick = onSignup) { Text("Create account", color = Brand.Primary, style = MaterialTheme.typography.labelLarge) }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
fun SignupScreen(onLogin: () -> Unit, onDone: () -> Unit, vm: SignupViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    val focus = LocalFocusManager.current

    LaunchedEffect(ui.done) { if (ui.done) onDone() }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 24.dp)
    ) {
        Spacer(Modifier.height(40.dp))
        BrandMark()
        Spacer(Modifier.height(24.dp))
        Text("Create your account", style = MaterialTheme.typography.headlineMedium, color = Brand.Ink)
        Spacer(Modifier.height(6.dp))
        Text("Apply to open roles and track every step.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        Spacer(Modifier.height(28.dp))

        if (ui.error != null) {
            ErrorBanner(ui.error!!)
            Spacer(Modifier.height(16.dp))
        }

        AppTextField(
            value = name, onValueChange = { name = it }, label = "Full name",
            error = ui.nameError, onImeAction = { focus.moveFocus(FocusDirection.Down) }
        )
        Spacer(Modifier.height(12.dp))
        AppTextField(
            value = email, onValueChange = { email = it }, label = "Email",
            error = ui.emailError, keyboardType = KeyboardType.Email,
            onImeAction = { focus.moveFocus(FocusDirection.Down) }
        )
        Spacer(Modifier.height(12.dp))
        AppTextField(
            value = password, onValueChange = { password = it }, label = "Password",
            error = ui.passwordError, password = true,
            onImeAction = { focus.moveFocus(FocusDirection.Down) }
        )
        Spacer(Modifier.height(12.dp))
        AppTextField(
            value = confirm, onValueChange = { confirm = it }, label = "Confirm password",
            error = ui.confirmError, password = true, imeAction = ImeAction.Done,
            onImeAction = { focus.clearFocus(); vm.submit(name, email, password, confirm) }
        )
        Spacer(Modifier.height(24.dp))
        PrimaryButton(
            "Create Account",
            onClick = { focus.clearFocus(); vm.submit(name, email, password, confirm) },
            loading = ui.busy
        )

        Spacer(Modifier.height(20.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            Text("Already have an account?", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
            TextButton(onClick = onLogin) { Text("Sign In", color = Brand.Primary, style = MaterialTheme.typography.labelLarge) }
        }
        Spacer(Modifier.height(24.dp))
    }
}
