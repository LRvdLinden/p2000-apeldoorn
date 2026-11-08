package nl.lrvdlinden.aalerts.ui

import androidx.compose.ui.draw.shadow

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nl.lrvdlinden.aalerts.Fmt
import nl.lrvdlinden.aalerts.data.Dienst
import nl.lrvdlinden.aalerts.data.Melding
import nl.lrvdlinden.aalerts.data.Settings
import nl.lrvdlinden.aalerts.data.Waarschuwing
import nl.lrvdlinden.aalerts.tr

@Composable
fun SectionCard(title: String? = null, icon: ImageVector? = null, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp, shadowElevation = 0.dp) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (title != null) Row(verticalAlignment = Alignment.CenterVertically) {
                icon?.let { Icon(it, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)) }
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            }
            content()
        }
    }
}

@Composable
fun DienstIcon(d: Dienst, size: Dp = 40.dp) {
    val res = d.icon
    if (res != null) Image(painterResource(res), null, Modifier.size(size))
    else Box(Modifier.size(size).clip(CircleShape).background(d.color), contentAlignment = Alignment.Center) {
        Text(d.label.take(1), color = Color.White, fontWeight = FontWeight.Bold)
    }
}

/** Station icon, same as the web meldkamer and the Apple apps: white rounded square, border in the service colour. */
@Composable
fun KazerneIcon(d: Dienst, size: Dp = 30.dp) {
    val shape = RoundedCornerShape(size * 0.28f)
    Box(Modifier.size(size).shadow(2.dp, shape).clip(shape).background(Color.White).border(maxOf(2.dp, size * 0.07f), d.color, shape),
        contentAlignment = Alignment.Center) {
        d.icon?.let { Image(painterResource(it), null, Modifier.size(size * 0.72f)) }
    }
}

@Composable
fun Tag(text: String, bg: Color, fg: Color = Color.White, modifier: Modifier = Modifier) {
    Text(text, color = fg, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1,
        modifier = modifier.clip(RoundedCornerShape(6.dp)).background(bg).padding(horizontal = 6.dp, vertical = 2.dp))
}

@Composable
fun PrioBadge(m: Melding) {
    val p = m.prioriteit?.takeIf { it.isNotBlank() && it.lowercase() != "onbekend" } ?: return
    val urgent = m.isUrgent
    Tag(p.uppercase(), if (urgent) Color(0xFFE3001B) else MaterialTheme.colorScheme.surfaceVariant, if (urgent) Color.White else MaterialTheme.colorScheme.onSurface)
}

@Composable
fun LiveBadge() = Tag("LIVE", Color(0xFFE3001B))

@Composable
fun MeldingRow(m: Melding, onClick: () -> Unit) {
    val read = m.guid in Settings.gelezen
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp).alpha(if (read) 0.55f else 1f),
        verticalAlignment = Alignment.Top,
    ) {
        DienstIcon(m.soort, 40.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(m.soort.label, color = m.soort.textColor, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                PrioBadge(m)
                if (m.isRecent) LiveBadge()
                if (!m.grip.isNullOrBlank()) Tag("GRIP ${m.grip}", Color(0xFF7C3AED))
                Spacer(Modifier.weight(1f))
                if (m.guid in Settings.bewaard) Icon(Icons.Filled.Bookmark, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(14.dp))
                Text(Fmt.time(m.datum), color = Muted, fontSize = 12.sp)
            }
            Text(m.title, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(m.plaatsText, color = Muted, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
fun WaarschuwingIcon(w: Waarschuwing, size: Dp = 40.dp) {
    Image(painterResource(w.icon), null, Modifier.size(size).alpha(if (w.isBeeindigd) 0.5f else 1f))
}

/** Time of the warning ("13:15", "5 nov 13:15"), with the end time once ended – never "x min ago". */
fun wTijd(w: Waarschuwing): String {
    val begin = Fmt.dayTime(w.startAt)
    val e = w.eindeAt
    return if (w.isBeeindigd && e != null && e.isAfter(w.startAt)) "$begin–${Fmt.time(e)}" else begin
}

@Composable
fun WaarschuwingRow(w: Waarschuwing, onClick: () -> Unit) {
    val ended = w.isBeeindigd
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.Top) {
        WaarschuwingIcon(w)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f).alpha(if (ended) (if (w.isOpgeheven) 0.85f else 0.6f) else 1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Tag(w.kop, if (ended && !w.isOpgeheven) Color.Gray else w.color, if (ended && !w.isOpgeheven) Color.White else w.onColor)
                Tag(w.statusLabel, if (w.isOpgeheven) Color(0xFF2E9E44) else if (ended) MaterialTheme.colorScheme.surfaceVariant else Color(0xFF16A34A), if (ended && !w.isOpgeheven) MaterialTheme.colorScheme.onSurface else Color.White)
                Spacer(Modifier.weight(1f))
                Text(wTijd(w), color = Muted, fontSize = 12.sp)
            }
            Text(w.titel, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            (w.plaats ?: w.tekstLokaal)?.let { Text(it, color = Muted, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis) }
        }
    }
}

/** Active KNMI codes above the list. */
@Composable
fun KnmiBar(list: List<Waarschuwing>, onClick: (Waarschuwing) -> Unit) {
    if (list.isEmpty()) return
    Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        list.forEach { w ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(w.color).clickable { onClick(w) }.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Image(painterResource(nl.lrvdlinden.aalerts.R.drawable.icon_knmi), null, Modifier.size(22.dp))
                Spacer(Modifier.width(8.dp))
                Column(Modifier.weight(1f)) {
                    Text(w.kop, color = w.onColor, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Text("${w.statusLabel} · ${wTijd(w)}" + (w.eindeAt?.let { tr(" tot ", " until ") + Fmt.dayTime(it) } ?: ""), color = w.onColor.copy(alpha = 0.85f), fontSize = 12.sp)
                }
                Icon(Icons.Filled.ChevronRight, null, tint = w.onColor)
            }
        }
    }
}

@Composable
fun InfoRow(label: String, value: String?) {
    if (value.isNullOrBlank()) return
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Muted, fontSize = 14.sp)
        Spacer(Modifier.width(12.dp))
        Text(value, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun EmptyState(title: String, text: String, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(text, color = Muted, fontSize = 14.sp)
    }
}

@Composable
fun SelectChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(selected = selected, onClick = onClick, label = { Text(label, fontSize = 13.sp) },
        colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f), selectedLabelColor = MaterialTheme.colorScheme.primary))
}

@Composable
fun NavRow(title: String, sub: String? = null, icon: ImageVector? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable(onClick = onClick).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        icon?.let { Icon(it, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(22.dp)); Spacer(Modifier.width(12.dp)) }
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp)
            sub?.let { Text(it, color = Muted, fontSize = 12.sp) }
        }
        Icon(Icons.Filled.ChevronRight, null, tint = Muted)
    }
}

@Composable
fun SwitchRow(title: String, sub: String? = null, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(enabled = enabled) { onChange(!checked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, fontSize = 15.sp)
            sub?.let { Text(it, color = Muted, fontSize = 12.sp) }
        }
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}

@Composable
fun Pill(text: String, color: Color, modifier: Modifier = Modifier) {
    Text(text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = color,
        modifier = modifier.clip(RoundedCornerShape(50)).border(1.dp, color.copy(alpha = 0.4f), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp))
}
