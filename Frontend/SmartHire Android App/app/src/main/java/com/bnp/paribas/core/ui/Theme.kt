package com.bnp.paribas.core.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** One brand colour (a deep green), soft tints, and small semantic status colours. */
object Brand {
    val Primary = Color(0xFF007A4D)
    val PrimaryDark = Color(0xFF00603C)
    val PrimarySoft = Color(0xFFE3F4EC)

    val Ink = Color(0xFF10201A)
    val Muted = Color(0xFF5B6B64)
    val Border = Color(0xFFE3E8E5)
    val Surface = Color(0xFFF6F8F7)

    val Success = Color(0xFF1B7F52)
    val SuccessBg = Color(0xFFE3F4EC)
    val Warning = Color(0xFFB36B00)
    val WarningBg = Color(0xFFFFF3DC)
    val Error = Color(0xFFC0392B)
    val ErrorBg = Color(0xFFFDECEA)
    val Info = Color(0xFF2457D6)
    val InfoBg = Color(0xFFE9EFFD)
    val Neutral = Color(0xFF55605B)
    val NeutralBg = Color(0xFFEEF1F0)
}

private val LightScheme = lightColorScheme(
    primary = Brand.Primary,
    onPrimary = Color.White,
    primaryContainer = Brand.PrimarySoft,
    onPrimaryContainer = Brand.PrimaryDark,
    secondary = Brand.Muted,
    onSecondary = Color.White,
    background = Color.White,
    onBackground = Brand.Ink,
    surface = Color.White,
    onSurface = Brand.Ink,
    surfaceVariant = Brand.Surface,
    onSurfaceVariant = Brand.Muted,
    outline = Brand.Border,
    outlineVariant = Brand.Border,
    error = Brand.Error,
    onError = Color.White,
    errorContainer = Brand.ErrorBg,
    onErrorContainer = Brand.Error
)

private val AppTypography = Typography(
    headlineMedium = TextStyle(fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.3).sp),
    headlineSmall = TextStyle(fontSize = 22.sp, lineHeight = 28.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.2).sp),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 26.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
    titleSmall = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
    labelMedium = TextStyle(fontSize = 12.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium),
    labelSmall = TextStyle(fontSize = 11.sp, lineHeight = 14.sp, fontWeight = FontWeight.Medium, letterSpacing = 0.3.sp)
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(6.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(20.dp)
)

/** Light mode only, always. */
@Composable
fun SmartHireTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = LightScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}
