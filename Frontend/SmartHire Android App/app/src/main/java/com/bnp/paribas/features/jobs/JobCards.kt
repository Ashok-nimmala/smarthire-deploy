package com.bnp.paribas.features.jobs

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
import com.bnp.paribas.core.utils.Dates
import com.bnp.paribas.data.models.Job

@Composable
fun JobCard(job: Job, onClick: () -> Unit, compact: Boolean = false, modifier: Modifier = Modifier) {
    AppCard(modifier = modifier, onClick = onClick) {
        Text(job.title, style = MaterialTheme.typography.titleMedium, color = Brand.Ink, maxLines = 2, overflow = TextOverflow.Ellipsis)
        if (job.org.isNotBlank()) {
            Spacer(Modifier.height(2.dp))
            Text(job.org, style = MaterialTheme.typography.bodyMedium, color = Brand.Muted)
        }
        if (!compact && job.description.isNotBlank()) {
            Spacer(Modifier.height(10.dp))
            Text(
                job.description,
                style = MaterialTheme.typography.bodyMedium,
                color = Brand.Ink,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            val posted = Dates.short(job.postedAt)
            val expires = Dates.short(job.expiresAt)
            Column(Modifier.weight(1f)) {
                if (!compact && posted != null) Text("Posted $posted", style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
                if (!compact && expires != null) Text("Expires $expires", style = MaterialTheme.typography.bodySmall, color = Brand.Muted)
            }
            Text("View →", style = MaterialTheme.typography.labelLarge, color = Brand.Primary)
        }
    }
}
