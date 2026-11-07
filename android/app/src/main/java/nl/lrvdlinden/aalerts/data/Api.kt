package nl.lrvdlinden.aalerts.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import nl.lrvdlinden.aalerts.BuildConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/** Client for the A-Alerts API (Cloudflare Worker): the same API the Apple apps and the website use. */
object Api {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .addInterceptor { chain ->
            chain.proceed(chain.request().newBuilder()
                .header("Accept", "application/json")
                .header("X-App-Client", "A-Alerts-Android/${BuildConfig.VERSION_NAME}")
                .header("User-Agent", "A-Alerts-Android/${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                .build())
        }
        .build()
    private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
    private val base = BuildConfig.API_BASE

    class HttpException(val code: Int) : Exception("HTTP $code")

    private suspend fun getText(url: String): String = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(url).build()).execute().use { r ->
            if (!r.isSuccessful) throw HttpException(r.code)
            r.body?.string() ?: ""
        }
    }

    private suspend fun send(method: String, path: String, body: Any? = null): String = withContext(Dispatchers.IO) {
        val rb = body?.let { toJson(it).toString().toRequestBody(JSON_TYPE) } ?: if (method == "POST") "".toRequestBody(JSON_TYPE) else null
        client.newCall(Request.Builder().url(base + path).method(method, rb).build()).execute().use { r ->
            if (!r.isSuccessful) throw HttpException(r.code)
            r.body?.string() ?: ""
        }
    }

    fun toJson(v: Any?): JsonElement = when (v) {
        null -> JsonNull
        is JsonElement -> v
        is String -> JsonPrimitive(v)
        is Number -> JsonPrimitive(v)
        is Boolean -> JsonPrimitive(v)
        is Map<*, *> -> JsonObject(v.entries.associate { it.key.toString() to toJson(it.value) })
        is Iterable<*> -> JsonArray(v.map { toJson(it) })
        else -> JsonPrimitive(v.toString())
    }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    suspend fun meldingen(limit: Int = 300): List<Melding> = AppJson.decodeFromString(getText("${base}v1/meldingen?limit=$limit"))
    suspend fun melding(guid: String): Melding? = runCatching { AppJson.decodeFromString<Melding>(getText("${base}v1/meldingen/${enc(guid)}")) }.getOrNull()
    suspend fun addView(guid: String) { runCatching { send("POST", "v1/meldingen/${enc(guid)}/view") } }
    suspend fun weather(guid: String): AlertWeather? = runCatching { AppJson.decodeFromString<AlertWeather>(getText("${base}v1/meldingen/${enc(guid)}/weather")) }.getOrNull()

    suspend fun waarschuwingen(days: Int = 7): List<Waarschuwing> = AppJson.decodeFromString(getText("${base}v1/waarschuwingen?days=$days"))
    suspend fun waarschuwing(id: String): Waarschuwing? = runCatching { AppJson.decodeFromString<Waarschuwing>(getText("${base}v1/waarschuwingen/${enc(id)}")) }.getOrNull()
    suspend fun waarschuwingWeather(id: String): AlertWeather? = runCatching { AppJson.decodeFromString<AlertWeather>(getText("${base}v1/waarschuwingen/${enc(id)}/weather")) }.getOrNull()

    suspend fun heliSpoor(id: String, bereik: SpoorBereik): List<HeliSpoorPunt> = runCatching { AppJson.decodeFromString<HeliSpoor>(getText("${base}v1/helikopters/${enc(id)}/spoor?scope=${bereik.key}")).punten }.getOrDefault(emptyList())
    suspend fun heliVluchten(id: String): List<HeliVlucht> = runCatching { AppJson.decodeFromString<HeliVluchten>(getText("${base}v1/helikopters/${enc(id)}/vluchten")).vluchten }.getOrDefault(emptyList())
    suspend fun status(): AppStatus? = runCatching { AppJson.decodeFromString<AppStatus>(getText("${base}v1/status")) }.getOrNull()
    suspend fun locaties(): List<Locatie> = runCatching { AppJson.decodeFromString<Locaties>(getText("${base}v1/locaties")).let { it.bases + it.ziekenhuizen } }.getOrDefault(emptyList())
    suspend fun helikopters(): List<Helikopter> = runCatching { AppJson.decodeFromString<HeliResponse>(getText("${base}v1/helikopters")).helikopters }.getOrDefault(emptyList())

    suspend fun content(name: String): ContentPage? = runCatching { AppJson.decodeFromString<ContentPage>(getText("${base}v1/content/$name")) }.getOrNull()
    suspend fun changelog(): List<ChangelogEntry> = runCatching { AppJson.decodeFromString<List<ChangelogEntry>>(getText("${base}v1/changelog")) }.getOrDefault(emptyList())

    suspend fun recordInstall(body: Map<String, Any?>) = send("POST", "v1/installs", body)
    suspend fun registerDevice(body: Map<String, Any?>) = send("POST", "v1/devices", body)
    suspend fun unregisterDevice(token: String) = send("DELETE", "v1/devices/${enc("fcm:$token")}")
    suspend fun testPush(token: String) = send("POST", "v1/devices/${enc("fcm:$token")}/test")

    /** Latest APK on the website (for "Er is een nieuwe versie"). */
    suspend fun apkInfo(): ApkInfo? = runCatching { AppJson.decodeFromString<ApkInfo>(getText("${BuildConfig.WEBSITE}/downloads/android.json")) }.getOrNull()
}
