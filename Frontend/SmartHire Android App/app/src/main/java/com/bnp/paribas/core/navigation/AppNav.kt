package com.bnp.paribas.core.navigation

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.bnp.paribas.core.ui.Brand
import com.bnp.paribas.core.ui.BrandMark
import com.bnp.paribas.core.ui.LocalSnackbar
import com.bnp.paribas.data.local.Graph
import com.bnp.paribas.features.applications.ApplicationDetailsScreen
import com.bnp.paribas.features.applications.ApplicationsScreen
import com.bnp.paribas.features.auth.LoginScreen
import com.bnp.paribas.features.auth.SignupScreen
import com.bnp.paribas.features.dashboard.HomeScreen
import com.bnp.paribas.features.exam.ExamLoginScreen
import com.bnp.paribas.features.exam.ExamResultScreen
import com.bnp.paribas.features.exam.ExamScreen
import com.bnp.paribas.features.jobs.JobDetailsScreen
import com.bnp.paribas.features.jobs.JobsScreen
import com.bnp.paribas.features.profile.ProfileScreen
import com.bnp.paribas.features.resume.ResumeScreen
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private data class Tab(val route: String, val label: String, val icon: ImageVector)

private val tabs = listOf(
    Tab(Routes.HOME, "Home", Icons.Filled.Home),
    Tab(Routes.JOBS, "Jobs", Icons.Filled.Search),
    Tab(Routes.APPLICATIONS, "Applications", Icons.Filled.DateRange),
    Tab(Routes.PROFILE, "Profile", Icons.Filled.Person)
)

private fun NavHostController.goTab(route: String) {
    navigate(route) {
        popUpTo(Routes.HOME) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
fun AppRoot() {
    val nav = rememberNavController()
    val snackbar = remember { SnackbarHostState() }
    val ctx = LocalContext.current

    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route

    val loggedIn by remember { Graph.store.session.map { it != null } }.collectAsStateWithLifecycle(initialValue = false)
    val pending by DeepLinks.pending.collectAsStateWithLifecycle()

    // Session expiry / logout: the moment a live session disappears, go to Login.
    LaunchedEffect(Unit) {
        var hadSession = false
        Graph.store.session.collect { s ->
            if (s != null) {
                hadSession = true
            } else if (hadSession) {
                hadSession = false
                nav.navigate(Routes.LOGIN) { popUpTo(nav.graph.id) { inclusive = true } }
            }
        }
    }

    // Deep links wait until the user is signed in and the main shell is showing.
    LaunchedEffect(pending, loggedIn, route) {
        val target = pending
        if (target != null && loggedIn && route in Routes.mainTabs) {
            DeepLinks.consume()
            nav.navigate(target)
        }
    }

    // Notification permission (Android 13+), asked once after sign-in.
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(loggedIn) {
        if (loggedIn && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            permission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    CompositionLocalProvider(LocalSnackbar provides snackbar) {
        Scaffold(
            containerColor = Color.White,
            snackbarHost = { SnackbarHost(snackbar) },
            bottomBar = {
                if (route in Routes.mainTabs) {
                    Column {
                        HorizontalDivider(color = Brand.Border)
                        NavigationBar(containerColor = Color.White, tonalElevation = 0.dp) {
                            tabs.forEach { tab ->
                                NavigationBarItem(
                                    selected = route == tab.route,
                                    onClick = { if (route != tab.route) nav.goTab(tab.route) },
                                    icon = { Icon(tab.icon, contentDescription = tab.label) },
                                    label = { Text(tab.label) },
                                    colors = NavigationBarItemDefaults.colors(
                                        selectedIconColor = Brand.Primary,
                                        selectedTextColor = Brand.Primary,
                                        indicatorColor = Brand.PrimarySoft,
                                        unselectedIconColor = Brand.Muted,
                                        unselectedTextColor = Brand.Muted
                                    )
                                )
                            }
                        }
                    }
                }
            }
        ) { padding ->
            NavHost(
                navController = nav,
                startDestination = Routes.SPLASH,
                modifier = Modifier.padding(padding),
                enterTransition = { fadeIn(tween(180)) },
                exitTransition = { fadeOut(tween(120)) },
                popEnterTransition = { fadeIn(tween(180)) },
                popExitTransition = { fadeOut(tween(120)) }
            ) {
                composable(Routes.SPLASH) {
                    SplashScreen(
                        onLoggedIn = { nav.navigate(Routes.HOME) { popUpTo(Routes.SPLASH) { inclusive = true } } },
                        onLoggedOut = { nav.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) { inclusive = true } } }
                    )
                }

                composable(Routes.LOGIN) {
                    LoginScreen(
                        onSignup = { nav.navigate(Routes.SIGNUP) },
                        onDone = { nav.navigate(Routes.HOME) { popUpTo(nav.graph.id) { inclusive = true } } }
                    )
                }
                composable(Routes.SIGNUP) {
                    SignupScreen(
                        onLogin = { nav.popBackStack() },
                        onDone = { nav.navigate(Routes.HOME) { popUpTo(nav.graph.id) { inclusive = true } } }
                    )
                }

                composable(Routes.HOME) {
                    HomeScreen(
                        onOpenJob = { nav.navigate(Routes.job(it)) },
                        onOpenApplication = { nav.navigate(Routes.application(it)) },
                        onWriteExam = { nav.navigate(Routes.examLogin(it)) },
                        onFindJobs = { nav.goTab(Routes.JOBS) },
                        onSeeAllApplications = { nav.goTab(Routes.APPLICATIONS) }
                    )
                }

                composable(Routes.JOBS) {
                    JobsScreen(onOpenJob = { nav.navigate(Routes.job(it)) })
                }
                composable(Routes.JOB) {
                    JobDetailsScreen(
                        onBack = { nav.popBackStack() },
                        onApplied = { appId ->
                            nav.navigate(Routes.application(appId)) {
                                popUpTo(Routes.JOB) { inclusive = true }
                            }
                        }
                    )
                }

                composable(Routes.APPLICATIONS) {
                    ApplicationsScreen(
                        onOpenApplication = { nav.navigate(Routes.application(it)) },
                        onFindJobs = { nav.goTab(Routes.JOBS) }
                    )
                }
                composable(Routes.APPLICATION) {
                    ApplicationDetailsScreen(
                        onBack = { nav.popBackStack() },
                        onWriteExam = { nav.navigate(Routes.examLogin(it)) }
                    )
                }

                composable(Routes.PROFILE) {
                    ProfileScreen(onOpenResume = { nav.navigate(Routes.RESUME) })
                }
                composable(Routes.RESUME) {
                    ResumeScreen(onBack = { nav.popBackStack() })
                }

                // ---- exam ----
                composable(Routes.EXAM_LOGIN) {
                    ExamLoginScreen(
                        onBack = { nav.popBackStack() },
                        onSuccess = { examId ->
                            nav.navigate(Routes.exam(examId)) { popUpTo(Routes.EXAM_LOGIN) { inclusive = true } }
                        }
                    )
                }
                composable(Routes.EXAM) { entry ->
                    val examId = entry.arguments?.getString("examId").orEmpty()
                    ExamScreen(
                        onExit = { nav.popBackStack() },
                        onSubmitted = {
                            nav.navigate(Routes.examResult(examId)) { popUpTo(Routes.EXAM) { inclusive = true } }
                        },
                        onSessionExpired = {
                            nav.navigate(Routes.examLogin(examId)) { popUpTo(Routes.EXAM) { inclusive = true } }
                        }
                    )
                }
                composable(Routes.EXAM_RESULT) {
                    ExamResultScreen(onDone = { nav.goTab(Routes.APPLICATIONS) })
                }
            }
        }
    }
}

@Composable
private fun SplashScreen(onLoggedIn: () -> Unit, onLoggedOut: () -> Unit) {
    LaunchedEffect(Unit) {
        val session = Graph.store.session.first()
        delay(350)
        if (session != null && session.role == "candidate") onLoggedIn() else onLoggedOut()
    }
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            BrandMark(64.dp)
            Spacer(Modifier.height(16.dp))
            Text("SmartHire", style = MaterialTheme.typography.headlineSmall, color = Brand.Ink)
        }
    }
}
