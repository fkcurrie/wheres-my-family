package com.example.wheres_my_family_android.services

import com.example.wheres_my_family_android.data.TrailPoint
import java.util.Locale
import kotlin.math.roundToInt

object TrailCompressor {

    /**
     * Standard Google Polyline algorithm encoder.
     */
    fun encodePolyline(points: List<TrailPoint>): String {
        val result = StringBuilder()
        var prevLat = 0
        var prevLng = 0

        fun encodeValue(value: Int): String {
            var num = if (value < 0) (value shl 1).inv() else value shl 1
            val chunkStr = StringBuilder()
            while (num >= 0x20) {
                chunkStr.append(((0x20 or (num and 0x1f)) + 63).toChar())
                num = num shr 5
            }
            chunkStr.append((num + 63).toChar())
            return chunkStr.toString()
        }

        for (point in points) {
            val lat = (point.latitude * 1e5).roundToInt()
            val lng = (point.longitude * 1e5).roundToInt()

            val dLat = lat - prevLat
            val dLng = lng - prevLng

            prevLat = lat
            prevLng = lng

            result.append(encodeValue(dLat)).append(encodeValue(dLng))
        }

        return result.toString()
    }

    /**
     * Standard Google Polyline algorithm decoder.
     */
    fun decodePolyline(str: String): List<Pair<Double, Double>> {
        val len = str.length
        var index = 0
        var lat = 0
        var lng = 0
        val coordinates = mutableListOf<Pair<Double, Double>>()

        while (index < len) {
            var b: Int
            var shift = 0
            var result = 0
            do {
                b = str[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlat = if (result and 1 != 0) (result shr 1).inv() else result shr 1
            lat += dlat

            shift = 0
            result = 0
            do {
                b = str[index++].code - 63
                result = result or ((b and 0x1f) shl shift)
                shift += 5
            } while (b >= 0x20)
            val dlng = if (result and 1 != 0) (result shr 1).inv() else result shr 1
            lng += dlng

            coordinates.add(Pair(lat / 1e5, lng / 1e5))
        }

        return coordinates
    }

    /**
     * Compresses a trail of coordinate points into a single string using Google Polyline and delta-encoded timestamps.
     */
    fun compressTrail(points: List<TrailPoint>): String {
        if (points.isEmpty()) return ""

        val polyStr = encodePolyline(points)
        val timestamps = mutableListOf<String>()

        val firstTs = if (points[0].timestamp > 0) points[0].timestamp else System.currentTimeMillis()
        timestamps.add(java.lang.Long.toString(firstTs, 36))

        var prevTs = firstTs
        for (i in 1 until points.size) {
            val ts = if (points[i].timestamp > 0) points[i].timestamp else prevTs
            val delta = ts - prevTs
            timestamps.add(java.lang.Long.toString(delta, 36))
            prevTs = ts
        }

        return "p1|$polyStr|${timestamps.joinToString(",")}"
    }

    /**
     * Decompresses a trail from compressed format back to TrailPoint list.
     */
    fun decompressTrail(compressed: String): List<TrailPoint> {
        if (compressed.isEmpty()) return emptyList()

        if (!compressed.startsWith("p1|")) {
            // Uncompressed or unknown format fallback
            return emptyList()
        }

        try {
            val parts = compressed.split("|")
            if (parts.size < 3) return emptyList()

            val polyStr = parts[1]
            val tsStr = parts[2]

            val coords = decodePolyline(polyStr)
            val tsParts = tsStr.split(",")

            val trail = mutableListOf<TrailPoint>()
            var currentTs = 0L

            for (i in coords.indices) {
                if (i == 0 && tsParts.isNotEmpty()) {
                    currentTs = java.lang.Long.parseLong(tsParts[0], 36)
                } else if (i < tsParts.size) {
                    currentTs += java.lang.Long.parseLong(tsParts[i], 36)
                }

                trail.add(
                    TrailPoint(
                        latitude = coords[i].first,
                        longitude = coords[i].second,
                        timestamp = currentTs
                    )
                )
            }

            return trail
        } catch (e: Exception) {
            System.err.println("[TrailCompressor] Error decompressing trail: ${e.message}")
            return emptyList()
        }
    }
}
