package com.example.wheres_my_family_android.services

import com.example.wheres_my_family_android.data.TrailPoint
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.pow
import kotlin.math.sqrt

object OsrmService {

    /**
     * Helper to calculate perpendicular distance of a point to a line segment.
     */
    fun getPerpendicularDistance(
        pt: TrailPoint,
        lineStart: TrailPoint,
        lineEnd: TrailPoint
    ): Double {
        val dx = lineEnd.longitude - lineStart.longitude
        val dy = lineEnd.latitude - lineStart.latitude

        if (dx == 0.0 && dy == 0.0) {
            return sqrt((pt.latitude - lineStart.latitude).pow(2) + (pt.longitude - lineStart.longitude).pow(2))
        }

        val t = ((pt.longitude - lineStart.longitude) * dx + (pt.latitude - lineStart.latitude) * dy) / (dx * dx + dy * dy)

        val nearestX = when {
            t < 0 -> lineStart.longitude
            t > 1 -> lineEnd.longitude
            else -> lineStart.longitude + t * dx
        }
        val nearestY = when {
            t < 0 -> lineStart.latitude
            t > 1 -> lineEnd.latitude
            else -> lineStart.latitude + t * dy
        }

        return sqrt((pt.longitude - nearestX).pow(2) + (pt.latitude - nearestY).pow(2))
    }

    /**
     * Ramer-Douglas-Peucker (RDP) Simplification Algorithm.
     */
    fun simplifyRDP(points: List<TrailPoint>, epsilon: Double): List<TrailPoint> {
        if (points.size <= 2) return points

        var dmax = 0.0
        var index = 0
        val end = points.size - 1

        for (i in 1 until end) {
            val d = getPerpendicularDistance(points[i], points[0], points[end])
            if (d > dmax) {
                index = i
                dmax = d
            }
        }

        return if (dmax > epsilon) {
            val results1 = simplifyRDP(points.subList(0, index + 1), epsilon)
            val results2 = simplifyRDP(points.subList(index, points.size), epsilon)
            results1.subList(0, results1.size - 1) + results2
        } else {
            listOf(points[0], points[end])
        }
    }

    /**
     * Fetch Snapped Trail Coordinates from OSRM Map-Matching or Routing API.
     */
    suspend fun fetchSnappedTrail(points: List<TrailPoint>): List<TrailPoint> = withContext(Dispatchers.IO) {
        if (points.size < 2) return@withContext points

        // 1. Simplify points first to keep the tracepoint count low
        val simplified = simplifyRDP(points, 0.00008) // ~8 meters tolerance

        // 2. Format coordinate string: lon,lat;lon,lat...
        val coordsString = simplified.joinToString(";") { "${it.longitude},${it.latitude}" }

        // 3. Try OSRM Routing API first
        val routeUrl = "https://router.project-osrm.org/route/v1/driving/$coordsString?overview=full&geometries=geojson"

        try {
            val responseText = ApiClient.client.get(routeUrl).bodyAsText()
            val json = Json { ignoreUnknownKeys = true }
            val rootObj = json.parseToJsonElement(responseText).jsonObject
            val code = rootObj["code"]?.jsonPrimitive?.content

            if (code == "Ok") {
                val routes = rootObj["routes"]?.jsonArray
                if (routes != null && routes.isNotEmpty()) {
                    val geometry = routes[0].jsonObject["geometry"]?.jsonObject
                    if (geometry != null) {
                        val coords = geometry["coordinates"]?.jsonArray
                        if (coords != null) {
                            val snappedPoints = coords.map { coordElement ->
                                val coordPair = coordElement.jsonArray
                                val lon = coordPair[0].jsonPrimitive.double
                                val lat = coordPair[1].jsonPrimitive.double
                                TrailPoint(latitude = lat, longitude = lon)
                            }
                            return@withContext snappedPoints
                        }
                    }
                }
            }
            DiagnosticLogger.addDiagnosticLog("[OSRM Route Info] Routing returned code: $code - trying map-matching fallback.")
        } catch (err: Exception) {
            DiagnosticLogger.addDiagnosticLog("[OSRM Route Error] Failed to fetch routed trail: ${err.message}")
        }

        // 4. Try OSRM Map-Matching API fallback
        val matchUrl = "https://router.project-osrm.org/match/v1/driving/$coordsString?overview=full&geometries=geojson"
        try {
            val responseText = ApiClient.client.get(matchUrl).bodyAsText()
            val json = Json { ignoreUnknownKeys = true }
            val rootObj = json.parseToJsonElement(responseText).jsonObject
            val code = rootObj["code"]?.jsonPrimitive?.content

            if (code == "Ok") {
                val matchings = rootObj["matchings"]?.jsonArray
                if (matchings != null && matchings.isNotEmpty()) {
                    val geometry = matchings[0].jsonObject["geometry"]?.jsonObject
                    if (geometry != null) {
                        val coords = geometry["coordinates"]?.jsonArray
                        if (coords != null) {
                            val snappedPoints = coords.map { coordElement ->
                                val coordPair = coordElement.jsonArray
                                val lon = coordPair[0].jsonPrimitive.double
                                val lat = coordPair[1].jsonPrimitive.double
                                TrailPoint(latitude = lat, longitude = lon)
                            }
                            return@withContext snappedPoints
                        }
                    }
                }
            }
            DiagnosticLogger.addDiagnosticLog("[OSRM Match Warning] API returned code: $code")
        } catch (err: Exception) {
            DiagnosticLogger.addDiagnosticLog("[OSRM Match Error] Failed to fetch snapped trail: ${err.message}")
        }

        // 5. Fallback to simplified raw coordinates if OSRM is offline
        return@withContext simplified
    }
}
