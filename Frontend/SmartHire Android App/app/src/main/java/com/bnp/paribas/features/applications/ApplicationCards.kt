package com.bnp.paribas.features.applications

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.bnp.paribas.core.ui.AppCard
import com.bnp.paribas.core.ui.Brand
import com.bnp.paribas.core.ui.StatusChip
import com.bnp.paribas.core.ui.statusStyle
import com.bnp.paribas.core.utils.Dates
import com.bnp.paribas.data.models.ApplicationItem

/** What the candidate sees as the one-line status text. HOLD never shows internal criteria. */
fun statusText(app: ApplicationItem): String =
    if (app.status == "HOLD") statusStyle("HOLD").defaultMessage
    else app.statusMessage ?: statusStyle(app.status).defaultMessage

@Composable
fun ApplicationCard(app: ApplicationItem, onClick: () -> Unit, modifier: Modifier = Modifier, showDateRelative: Boolean = false) {
    AppCard(modifier = modifier, onClick = onClick) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(app.title, style = MaterialTheme.typography.titleMedium, color = Brand.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
                if (app.org.isNotBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(app.org, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
                }
            }
            Spacer(Modifier.width(8.dp))
            StatusChip(app.status)
        }
        val text = statusText(app)
        if (text.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Text(text, style = MaterialTheme.typography.bodyMedium, color = Brand.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        val date = if (showDateRelative) Dates.relative(app.createdAt) else Dates.short(app.createdAt)
        if (date != null) {
            Spacer(Modifier.height(8.dp))
            Text(date, style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
        }
    }
}
