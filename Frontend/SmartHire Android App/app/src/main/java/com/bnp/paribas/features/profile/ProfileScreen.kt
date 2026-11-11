package com.bnp.paribas.features.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.bnp.paribas.core.ui.*
import com.bnp.paribas.core.utils.Dates
import java.text.NumberFormat

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(onOpenResume: () -> Unit, vm: ProfileViewModel = viewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    OnLifecycle(onStart = { vm.refresh() })

    var showEdit by remember { mutableStateOf(false) }
    var showLogout by remember { mutableStateOf(false) }
    var nameDraft by remember { mutableStateOf("") }

    LaunchedEffect(ui.nameSaved) {
        if (ui.nameSaved) {
            showEdit = false
            vm.clearNameState()
        }
    }

    if (showEdit) {
        AlertDialog(
            onDismissRequest = { showEdit = false; vm.clearNameState() },
            title = { Text("Edit name") },
            text = {
                AppTextField(
                    value = nameDraft, onValueChange = { nameDraft = it }, label = "Full name",
                    error = ui.nameError, imeAction = ImeAction.Done, onImeAction = { vm.saveName(nameDraft) }
                )
            },
            confirmButton = {
                TextButton(onClick = { vm.saveName(nameDraft) }, enabled = !ui.savingName) {
                    Text(if (ui.savingName) "Saving…" else "Save", color = Brand.Primary)
                }
            },
            dismissButton = {
                TextButton(onClick = { showEdit = false; vm.clearNameState() }) { Text("Cancel", color = Brand.Muted) }
            },
            containerColor = Color.White
        )
    }

    if (showLogout) {
        AlertDialog(
            onDismissRequest = { showLogout = false },
            title = { Text("Sign out?") },
            text = { Text("You'll need to sign in again to see your applications.") },
            confirmButton = {
                TextButton(onClick = { showLogout = false; vm.logout() }) { Text("Sign out", color = Brand.Error) }
            },
            dismissButton = {
                TextButton(onClick = { showLogout = false }) { Text("Cancel", color = Brand.Muted) }
            },
            containerColor = Color.White
        )
    }

    Column(Modifier.fillMaxSize()) {
        ScreenTitle("Profile")
        PullToRefreshBox(
            isRefreshing = ui.refreshing,
            onRefresh = vm::refresh,
            modifier = Modifier.weight(1f)
        ) {
            val p = ui.profile
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 8.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (ui.offline) item { OfflineBanner() }

                when {
                    p == null && (!ui.loaded || ui.refreshing) -> items(2) { SkeletonCard() }
                    p == null && ui.offline -> item { ErrorState("Internet connection required.", onRetry = vm::refresh, title = "You're offline") }
                    p == null -> item { ErrorState(ui.error ?: "We couldn't load your profile.", onRetry = vm::refresh) }
                    else -> {
                        item {
                            AppCard {
                                InfoRow("Name", p.name.ifBlank { "—" })
                                Hairline()
                                InfoRow("Email", p.email.ifBlank { "—" })
                            }
                        }
                        item {
                            AppCard {
                                Text("Resume", style = MaterialTheme.typography.titleSmall, color = Brand.Ink)
                                if (p.resumeUploaded) {
                                    Spacer(Modifier.height(4.dp))
                                    InfoRow("File", p.resumeFilename ?: "Resume.pdf")
                                    val up = Dates.full(p.resumeUploadedAt)
                                    if (up != null) {
                                        Hairline()
                                        InfoRow("Uploaded", up)
                                    }
                                    if (p.resumeCharacters != null) {
                                        Hairline()
                                        InfoRow("Readable text", NumberFormat.getIntegerInstance().format(p.resumeCharacters.toLong()) + " characters")
                                    }
                                    Spacer(Modifier.height(12.dp))
                                    SecondaryButton("Update Resume", onOpenResume)
                                } else {
                                    Spacer(Modifier.height(6.dp))
                                    Text("No resume uploaded", style = MaterialTheme.typography.bodyMedium, color = Brand.Ink)
                                    Text("Upload your resume to start applying.", style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                                    Spacer(Modifier.height(12.dp))
                                    PrimaryButton("Upload Resume", onOpenResume)
                                }
                            }
                        }
                        item {
                            SecondaryButton("Edit Name", onClick = { nameDraft = p.name; showEdit = true })
                        }
                    }
                }

                item {
                    TextButton(onClick = { showLogout = true }, modifier = Modifier.fillMaxWidth()) {
                        Text("Sign out", color = Brand.Error, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}
