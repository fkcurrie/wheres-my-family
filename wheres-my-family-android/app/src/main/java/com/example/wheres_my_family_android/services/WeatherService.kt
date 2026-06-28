package com.example.wheres_my_family_android.services

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlin.math.roundToInt

data class WeatherInfo(
    val temp: Int,
    val emoji: String,
    val desc: String,
    val isSevere: Boolean
)

object WeatherService {
    private var lastWeatherLat: Double? = null
    private var lastWeatherLng: Double? = null
    private var lastWeatherTime: Long = 0L
    private var lastWeatherValue: WeatherInfo? = null

    private fun getDistanceInKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0 // Radius of earth in km
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2)
        val c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return r * c
    }

    suspend fun getWeatherAndAlerts(latitude: Double, longitude: Double): WeatherInfo? {
        return try {
            val url = "https://api.open-meteo.com/v1/forecast?latitude=$latitude&longitude=$longitude&current=temperature_2m,weather_code&temperature_unit=celsius&wind_speed_unit=ms&precipitation_unit=mm"
            val response = ApiClient.client.get(url)
            val jsonStr = response.bodyAsText()
            val json = Json { ignoreUnknownKeys = true }
            val root = json.parseToJsonElement(jsonStr).jsonObject
            val current = root["current"]?.jsonObject ?: return null

            val temp = current["temperature_2m"]?.jsonPrimitive?.double?.roundToInt() ?: 0
            val code = current["weather_code"]?.jsonPrimitive?.int ?: 0

            var emoji = "☀️"
            var desc = "Clear"
            var isSevere = false

            when {
                code == 0 -> {
                    emoji = "☀️"
                    desc = "Clear sky"
                }
                code in listOf(1, 2, 3) -> {
                    emoji = "⛅"
                    desc = "Partly cloudy"
                }
                code in listOf(45, 48) -> {
                    emoji = "🌫️"
                    desc = "Foggy"
                }
                code in listOf(51, 53, 55) -> {
                    emoji = "🌧️"
                    desc = "Drizzle"
                }
                code in listOf(61, 63, 65) -> {
                    emoji = "🌧️"
                    desc = if (code == 65) "Heavy rain" else "Rain"
                    if (code == 65) isSevere = true
                }
                code in listOf(71, 73, 75) -> {
                    emoji = "❄️"
                    desc = if (code == 75) "Heavy snow" else "Snow"
                    if (code == 75) isSevere = true
                }
                code in listOf(80, 81, 82) -> {
                    emoji = "🌦️"
                    desc = if (code == 82) "Torrential showers" else "Showers"
                    if (code == 82) isSevere = true
                }
                code in listOf(95, 96, 99) -> {
                    emoji = "⛈️"
                    desc = "Thunderstorms"
                    isSevere = true
                }
            }

            WeatherInfo(temp, emoji, desc, isSevere)
        } catch (e: Exception) {
            System.err.println("[Weather Fetch Error]: " + e.message)
            null
        }
    }

    suspend fun getWeatherAndAlertsCached(latitude: Double, longitude: Double): WeatherInfo? {
        val now = System.currentTimeMillis()
        val lastVal = lastWeatherValue
        val lastLat = lastWeatherLat
        val lastLng = lastWeatherLng
        if (lastVal != null && lastLat != null && lastLng != null && (now - lastWeatherTime) < 30 * 60 * 1000) {
            val dist = getDistanceInKm(latitude, longitude, lastLat, lastLng)
            if (dist < 3.2) {
                DiagnosticLogger.addDiagnosticLog(
                    "[Weather Cache] Cache hit: using ${lastVal.temp}°C, ${lastVal.desc} (moved ${String.format("%.2f", dist)} km)"
                )
                return lastVal
            }
        }

        val fresh = getWeatherAndAlerts(latitude, longitude)
        if (fresh != null) {
            lastWeatherLat = latitude
            lastWeatherLng = longitude
            lastWeatherTime = now
            lastWeatherValue = fresh
            DiagnosticLogger.addDiagnosticLog(
                "[Weather API] Cache miss: fetched ${fresh.temp}°C, ${fresh.desc}"
            )
            return fresh
        }
        return lastWeatherValue
    }
}
