package nl.lrvdlinden.aalerts.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.*
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point
import org.maplibre.geojson.Polygon

/** A pin on the map. [image] is a drawable; [widthDp] its drawn width. */
data class MapPoint(
    val id: String, val lat: Double, val lon: Double, val image: Int, val widthDp: Int = 34,
    val label: String? = null, val flip: Boolean = false, val dim: Boolean = false, val anchorBottom: Boolean = true,
    /** Station style (like the web meldkamer): white rounded square with a border in this colour around the icon. */
    val kazerne: Long? = null,
)
/** An area of rings of [lon, lat]. */
data class MapArea(val id: String, val rings: List<List<List<Double>>>, val color: Long, val fill: Double = 0.18, val dashed: Boolean = false, val width: Double = 2.0)
/** A line: dashed (station or helicopter → alert) or solid (a helicopter's route). */
data class MapLine(val id: String, val points: List<Pair<Double, Double>>, val color: Long, val dashed: Boolean = true, val width: Double = 3.5)

/** What the camera should show: a point with zoom, or the bounds around a set of points. */
data class MapCamera(val lat: Double, val lon: Double, val zoom: Double = 12.0, val fit: List<Pair<Double, Double>> = emptyList(), val key: Any? = null)

private const val STYLE_LIGHT = "https://tiles.openfreemap.org/styles/liberty"
private const val STYLE_DARK = "https://tiles.openfreemap.org/styles/dark"
private const val STYLE_MUTED = "https://tiles.openfreemap.org/styles/positron"
val APELDOORN = MapCamera(52.2112, 5.9699, 10.6)

private fun hex(c: Long) = String.format("#%06X", c and 0xFFFFFF)

/**
 * MapLibre map with OpenFreeMap tiles (© OpenMapTiles, © OpenStreetMap). Pins, areas and lines are GeoJSON layers,
 * so hundreds of alerts stay smooth.
 */
@Composable
fun AMap(
    modifier: Modifier = Modifier,
    points: List<MapPoint> = emptyList(),
    areas: List<MapArea> = emptyList(),
    lines: List<MapLine> = emptyList(),
    camera: MapCamera = APELDOORN,
    interactive: Boolean = true,
    onPointClick: (String) -> Unit = {},
    onMapClick: () -> Unit = {},
    /** Long press: the spot that was pressed (lat, lon). */
    onLongPress: ((Double, Double) -> Unit)? = null,
    /** Called when the map stops moving, with the centre (lat, lon). */
    onCameraIdle: ((Double, Double) -> Unit)? = null,
    /** Rain radar tile URL ({z}/{x}/{y}); null = off. */
    radarTiles: String? = null,
) {
    val ctx = LocalContext.current
    // Map colours (light by default, dark or automatic) and "Rustige kaartkleuren" (Kaart en helikopters).
    val dark = when (nl.lrvdlinden.aalerts.data.Settings.kaartThema) {
        "donker" -> true
        "auto" -> LocalDark.current
        else -> false
    }
    val muted = !dark && nl.lrvdlinden.aalerts.data.Settings.gedemptKaart
    val longPress = rememberUpdatedState(onLongPress)
    val idle = rememberUpdatedState(onCameraIdle)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val mapView = remember { MapView(ctx).also { it.onCreate(null) } }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var style by remember { mutableStateOf<Style?>(null) }
    val click = rememberUpdatedState(onPointClick)
    val mapClick = rememberUpdatedState(onMapClick)

    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> {}
            }
        }
        lifecycle.addObserver(obs)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStart()
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose {
            lifecycle.removeObserver(obs)
            mapView.onPause(); mapView.onStop(); mapView.onDestroy()
        }
    }

    LaunchedEffect(dark, muted) {
        mapView.getMapAsync { m ->
            map = m
            m.uiSettings.apply {
                isRotateGesturesEnabled = false
                isTiltGesturesEnabled = false
                isCompassEnabled = false
                isScrollGesturesEnabled = interactive
                isZoomGesturesEnabled = interactive
                isDoubleTapGesturesEnabled = interactive
                isLogoEnabled = false
            }
            m.addOnMapClickListener { ll ->
                val p = m.projection.toScreenLocation(ll)
                val hit = m.queryRenderedFeatures(android.graphics.RectF(p.x - 24, p.y - 24, p.x + 24, p.y + 24), "a-points")
                val id = hit.firstOrNull()?.getStringProperty("id")
                if (id != null) click.value(id) else mapClick.value()
                true
            }
            m.addOnMapLongClickListener { ll -> longPress.value?.let { it(ll.latitude, ll.longitude); true } ?: false }
            m.addOnCameraIdleListener { m.cameraPosition.target?.let { t -> idle.value?.invoke(t.latitude, t.longitude) } }
            style = null
            m.setStyle(Style.Builder().fromUri(if (dark) STYLE_DARK else if (muted) STYLE_MUTED else STYLE_LIGHT)) { s ->
                s.addSource(GeoJsonSource("a-areas"))
                s.addSource(GeoJsonSource("a-lines"))
                s.addSource(GeoJsonSource("a-points"))
                s.addLayer(FillLayer("a-fill", "a-areas").withProperties(
                    fillColor(Expression.toColor(Expression.get("color"))), fillOpacity(Expression.get("fill"))))
                s.addLayer(LineLayer("a-outline", "a-areas").withProperties(
                    lineColor(Expression.toColor(Expression.get("color"))), lineWidth(Expression.get("width")), lineOpacity(0.9f)))
                s.addLayer(LineLayer("a-trail", "a-lines").withProperties(
                    lineColor(Expression.toColor(Expression.get("color"))), lineWidth(Expression.get("width")), lineOpacity(0.85f),
                    lineCap(Property.LINE_CAP_ROUND), lineJoin(Property.LINE_JOIN_ROUND)).withFilter(Expression.eq(Expression.get("dashed"), false)))
                s.addLayer(LineLayer("a-routes", "a-lines").withProperties(
                    lineColor(Expression.toColor(Expression.get("color"))), lineWidth(Expression.get("width")), lineDasharray(arrayOf(1.5f, 1.2f)),
                    lineCap(Property.LINE_CAP_ROUND)).withFilter(Expression.eq(Expression.get("dashed"), true)))
                s.addLayer(SymbolLayer("a-points", "a-points").withProperties(
                    iconImage(Expression.get("icon")),
                    iconAllowOverlap(true), iconIgnorePlacement(true),
                    iconAnchor(Expression.get("anchor")),
                    iconOpacity(Expression.get("opacity")),
                    symbolSortKey(Expression.get("sort")),
                    textField(Expression.get("label")),
                    textFont(arrayOf("Noto Sans Bold")),
                    textSize(11f), textAnchor(Property.TEXT_ANCHOR_TOP), textOffset(arrayOf(0f, 0.6f)),
                    textColor(if (dark) "#FFFFFF" else "#111111"), textHaloColor(if (dark) "#000000" else "#FFFFFF"), textHaloWidth(1.5f),
                    textAllowOverlap(true), textOptional(true),
                ))
                style = s
            }
        }
    }

    // Data → sources (also after a style change).
    LaunchedEffect(style, points, areas, lines) {
        val s = style ?: return@LaunchedEffect
        val density = ctx.resources.displayMetrics.density
        for (p in points) {
            val name = imgName(p)
            if (s.getImage(name) == null) (if (p.kazerne != null) kazerneBitmap(ctx, p.image, (p.widthDp * density).toInt(), p.kazerne) else bitmap(ctx, p.image, (p.widthDp * density).toInt(), p.flip))?.let { s.addImage(name, it) }
        }
        s.getSourceAs<GeoJsonSource>("a-points")?.setGeoJson(FeatureCollection.fromFeatures(points.mapIndexed { i, p ->
            Feature.fromGeometry(Point.fromLngLat(p.lon, p.lat)).apply {
                addStringProperty("id", p.id)
                addStringProperty("icon", imgName(p))
                addStringProperty("anchor", if (p.anchorBottom) "bottom" else "center")
                addNumberProperty("opacity", if (p.dim) 0.45 else 1.0)
                addNumberProperty("sort", i)
                addStringProperty("label", p.label ?: "")
            }
        }))
        s.getSourceAs<GeoJsonSource>("a-areas")?.setGeoJson(FeatureCollection.fromFeatures(areas.flatMap { a ->
            a.rings.filter { it.size >= 3 }.map { ring ->
                Feature.fromGeometry(Polygon.fromLngLats(listOf(ring.map { Point.fromLngLat(it[0], it[1]) }))).apply {
                    addStringProperty("color", hex(a.color)); addNumberProperty("fill", a.fill); addNumberProperty("width", a.width)
                }
            }
        }))
        s.getSourceAs<GeoJsonSource>("a-lines")?.setGeoJson(FeatureCollection.fromFeatures(lines.filter { it.points.size >= 2 }.map { l ->
            Feature.fromGeometry(LineString.fromLngLats(l.points.map { Point.fromLngLat(it.second, it.first) })).apply {
                addStringProperty("color", hex(l.color)); addBooleanProperty("dashed", l.dashed); addNumberProperty("width", l.width)
            }
        }))
    }

    // Rain radar: KNMI tiles through the A-Alerts API, under the alerts and areas.
    LaunchedEffect(style, radarTiles) {
        val s = style ?: return@LaunchedEffect
        s.getLayer("a-radar")?.let { s.removeLayer(it) }
        s.getSource("a-radar")?.let { s.removeSource(it) }
        val url = radarTiles ?: return@LaunchedEffect
        s.addSource(org.maplibre.android.style.sources.RasterSource("a-radar",
            org.maplibre.android.style.sources.TileSet("2.1.0", url).apply { minZoom = 5f; maxZoom = 12f }, 256))
        s.addLayerBelow(org.maplibre.android.style.layers.RasterLayer("a-radar", "a-radar").withProperties(rasterOpacity(0.6f)), "a-fill")
    }

    LaunchedEffect(map, camera.key, camera.lat, camera.lon) {
        val m = map ?: return@LaunchedEffect
        if (camera.fit.size >= 2) {
            val b = LatLngBounds.Builder().apply { camera.fit.forEach { include(LatLng(it.first, it.second)) } }.build()
            runCatching { m.moveCamera(CameraUpdateFactory.newLatLngBounds(b, 120)) }
                .onFailure { m.cameraPosition = CameraPosition.Builder().target(LatLng(camera.lat, camera.lon)).zoom(camera.zoom).build() }
            if (m.cameraPosition.zoom > 16) m.moveCamera(CameraUpdateFactory.zoomTo(16.0))
        } else {
            m.cameraPosition = CameraPosition.Builder().target(LatLng(camera.lat, camera.lon)).zoom(camera.zoom).build()
        }
    }

    AndroidView(factory = { mapView }, modifier = modifier)
}

private fun imgName(p: MapPoint) = "img-${p.image}-${p.widthDp}-${p.flip}" + (p.kazerne?.let { "-k$it" } ?: "")

private val cache = mutableMapOf<String, Bitmap>()

/** Station marker: white rounded square, border in the service colour, service icon inside. */
private fun kazerneBitmap(ctx: Context, res: Int, sizePx: Int, color: Long): Bitmap? {
    val key = "k-$res-$sizePx-$color"
    cache[key]?.let { return it }
    val icon = bitmap(ctx, res, (sizePx * 0.72f).toInt(), false) ?: return null
    val pad = (sizePx * 0.12f)
    val total = (sizePx + pad * 2).toInt()
    val b = Bitmap.createBitmap(total, total, Bitmap.Config.ARGB_8888)
    val c = android.graphics.Canvas(b)
    val r = sizePx * 0.28f
    val rect = android.graphics.RectF(pad, pad, pad + sizePx, pad + sizePx)
    val shadow = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { this.color = 0x55000000; maskFilter = android.graphics.BlurMaskFilter(pad * 0.8f, android.graphics.BlurMaskFilter.Blur.NORMAL) }
    c.drawRoundRect(android.graphics.RectF(rect.left, rect.top + pad * 0.4f, rect.right, rect.bottom + pad * 0.4f), r, r, shadow)
    c.drawRoundRect(rect, r, r, android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { this.color = android.graphics.Color.WHITE })
    val stroke = maxOf(2f, sizePx * 0.07f)
    c.drawRoundRect(android.graphics.RectF(rect.left + stroke / 2, rect.top + stroke / 2, rect.right - stroke / 2, rect.bottom - stroke / 2), r, r,
        android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.STROKE; strokeWidth = stroke; this.color = (color and 0xFFFFFFFF).toInt() })
    c.drawBitmap(icon, (total - icon.width) / 2f, (total - icon.height) / 2f, null)
    cache[key] = b
    return b
}
private fun bitmap(ctx: Context, res: Int, widthPx: Int, flip: Boolean): Bitmap? {
    val key = "$res-$widthPx-$flip"
    cache[key]?.let { return it }
    val src = BitmapFactory.decodeResource(ctx.resources, res) ?: return null
    val h = (src.height * widthPx.toFloat() / src.width).toInt().coerceAtLeast(1)
    var b = Bitmap.createScaledBitmap(src, widthPx.coerceAtLeast(1), h, true)
    if (flip) b = Bitmap.createBitmap(b, 0, 0, b.width, b.height, Matrix().apply { preScale(-1f, 1f) }, true)
    cache[key] = b
    return b
}
