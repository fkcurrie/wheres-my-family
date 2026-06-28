package com.example.wheres_my_family_android.services

import com.example.wheres_my_family_android.data.FamilyMember
import com.example.wheres_my_family_android.data.TrailPoint
import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.get
import io.ktor.client.request.patch
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.int
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.long
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.add

object ApiClient {

  const val MANTLE_DB_URL = "https://northamerica-northeast2-wheres-my-family-499822.cloudfunctions.net/locations"
  const val MANTLE_KEY = "923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b"

  val client = HttpClient {
    install(ContentNegotiation) {
      json(Json {
        ignoreUnknownKeys = true
        prettyPrint = true
        isLenient = true
      })
    }
  }

  suspend fun fetchLocations(): String {
    val response = client.get(MANTLE_DB_URL) {
      header("X-Mantle-Key", MANTLE_KEY)
    }
    return response.bodyAsText()
  }

  fun parseLocations(jsonStr: String, familyKey: String): List<FamilyMember> {
    val members = mutableListOf<FamilyMember>()
    try {
      val json = Json { ignoreUnknownKeys = true }
      val rootObj = json.parseToJsonElement(jsonStr).jsonObject
      for ((key, element) in rootObj) {
        if (key.startsWith("_")) continue
        val mObj = element.jsonObject
        val latEnc = mObj["latEnc"]?.jsonPrimitive?.content ?: ""
        val lngEnc = mObj["lngEnc"]?.jsonPrimitive?.content ?: ""
        val statusEnc = mObj["statusEnc"]?.jsonPrimitive?.content ?: ""
        val trailEnc = mObj["trailEnc"]?.jsonPrimitive?.content ?: ""
        
        val latDec = CryptoService.decryptString(latEnc, familyKey)
        val lngDec = CryptoService.decryptString(lngEnc, familyKey)
        val decryptionFailed = latEnc.isEmpty() || lngEnc.isEmpty() || latDec.isEmpty() || lngDec.isEmpty() || latDec.toDoubleOrNull() == null || lngDec.toDoubleOrNull() == null

        val lat = latDec.toDoubleOrNull() ?: 46.8182
        val lng = lngDec.toDoubleOrNull() ?: 8.2275
        val status = CryptoService.decryptString(statusEnc, familyKey).ifEmpty { "Active" }
        val battery = mObj["battery"]?.jsonPrimitive?.int ?: 100
        val charging = mObj["charging"]?.jsonPrimitive?.boolean ?: false
        val deviceStatus = mObj["deviceStatus"]?.jsonPrimitive?.content ?: "Active"
        val updatedAt = mObj["updatedAt"]?.jsonPrimitive?.long ?: 0L
        val platform = mObj["platform"]?.jsonPrimitive?.content ?: "unknown"

        val nudgeRequested = mObj["nudgeRequested"]?.jsonPrimitive?.boolean ?: false
        val pingRequested = mObj["pingRequested"]?.jsonPrimitive?.boolean ?: false

        val weatherTemp = mObj["weatherTemp"]?.jsonPrimitive?.int
        val weatherEmoji = mObj["weatherEmoji"]?.jsonPrimitive?.content
        val weatherDesc = mObj["weatherDesc"]?.jsonPrimitive?.content
        val weatherIsSevere = mObj["weatherIsSevere"]?.jsonPrimitive?.boolean ?: false

        // Parse & decrypt coordinate trail history
        val trailList = if (trailEnc.isNotEmpty()) {
          val decryptedTrailStr = CryptoService.decryptString(trailEnc, familyKey)
          TrailCompressor.decompressTrail(decryptedTrailStr)
        } else {
          emptyList()
        }

        val colors = listOf(
          "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4",
          "#ef4444", "#f97316", "#eab308", "#14b8a6", "#d946ef", "#6366f1"
        )
        val colorIdx = Math.abs(key.hashCode()) % colors.size
        val color = colors[colorIdx]

        members.add(FamilyMember(
          name = key,
          latitude = lat,
          longitude = lng,
          status = status,
          battery = battery,
          charging = charging,
          deviceStatus = deviceStatus,
          color = color,
          updatedAt = updatedAt,
          platform = platform,
          trail = trailList,
          nudgeRequested = nudgeRequested,
          pingRequested = pingRequested,
          weatherTemp = weatherTemp,
          weatherEmoji = weatherEmoji,
          weatherDesc = weatherDesc,
          weatherIsSevere = weatherIsSevere,
          decryptionFailed = decryptionFailed
        ))
      }
    } catch (e: Exception) {
      System.err.println("[ApiClient] Error parsing locations: " + e.message)
    }
    return members
  }

  suspend fun publishLocation(
    name: String,
    latitude: Double,
    longitude: Double,
    familyKey: String,
    status: String = "Active",
    battery: Int = 100,
    charging: Boolean = false,
    deviceStatus: String = "Active",
    platform: String = "android",
    trail: List<TrailPoint> = emptyList(),
    weatherTemp: Int? = null,
    weatherEmoji: String? = null,
    weatherDesc: String? = null,
    weatherIsSevere: Boolean = false,
    extraData: Map<String, JsonPrimitive> = emptyMap()
  ): Boolean {
    val keyToUse = familyKey.ifEmpty { "WheresMyFamilySecureKey2026" }
    val compressedTrailStr = if (trail.isNotEmpty()) TrailCompressor.compressTrail(trail) else ""

    val payload = buildJsonObject {
      putJsonObject(name) {
        put("name", name)
        put("latitude", 46.8182) // Switzerland obfuscation
        put("longitude", 8.2275)
        put("status", "Encrypted")
        put("source", "HTTPS")
        put("latEnc", CryptoService.encryptString(latitude.toString(), keyToUse))
        put("lngEnc", CryptoService.encryptString(longitude.toString(), keyToUse))
        put("statusEnc", CryptoService.encryptString(status, keyToUse))
        if (compressedTrailStr.isNotEmpty()) {
          put("trailEnc", CryptoService.encryptString(compressedTrailStr, keyToUse))
        }
        put("battery", battery)
        put("charging", charging)
        put("deviceStatus", deviceStatus)
        put("updatedAt", System.currentTimeMillis())
        put("platform", platform)
        if (weatherTemp != null) put("weatherTemp", weatherTemp)
        if (weatherEmoji != null) put("weatherEmoji", weatherEmoji)
        if (weatherDesc != null) put("weatherDesc", weatherDesc)
        put("weatherIsSevere", weatherIsSevere)

        extraData.forEach { (k, v) ->
          put(k, v)
        }
      }
    }

    return try {
      val response = client.patch(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      response.status.value in 200..299
    } catch (e: Exception) {
      System.err.println("[ApiClient] Failed to publish location: " + e.message)
      false
    }
  }

  suspend fun publishSMSLocation(
    memberName: String,
    latitude: Double,
    longitude: Double,
    battery: Int,
    status: String,
    timestamp: Long,
    familyKey: String
  ): Boolean {
    val keyToUse = familyKey.ifEmpty { "WheresMyFamilySecureKey2026" }
    val payload = buildJsonObject {
      putJsonObject(memberName) {
        put("name", memberName)
        put("latitude", 46.8182)
        put("longitude", 8.2275)
        put("status", "Encrypted")
        put("source", "SMS")
        put("latEnc", CryptoService.encryptString(latitude.toString(), keyToUse))
        put("lngEnc", CryptoService.encryptString(longitude.toString(), keyToUse))
        put("statusEnc", CryptoService.encryptString(status, keyToUse))
        put("battery", battery)
        put("charging", false)
        put("deviceStatus", "Offline")
        put("updatedAt", timestamp)
        put("platform", "unknown")
      }
    }

    return try {
      val response = client.patch(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      response.status.value in 200..299
    } catch (e: Exception) {
      System.err.println("[ApiClient] Failed to publish SMS location: " + e.message)
      false
    }
  }

  suspend fun requestNudgeMember(memberName: String, member: FamilyMember): Boolean {
    val payload = buildJsonObject {
      putJsonObject(memberName) {
        put("name", member.name)
        put("nudgeRequested", true)
      }
    }
    return try {
      val response = client.patch(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      response.status.value in 200..299
    } catch (e: Exception) {
      false
    }
  }

  suspend fun clearNudgeState(savedName: String): Boolean {
    val payload = buildJsonObject {
      putJsonObject(savedName) {
        put("nudgeRequested", false)
      }
    }
    return try {
      val response = client.patch(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      response.status.value in 200..299
    } catch (e: Exception) {
      false
    }
  }

  suspend fun requestPingMember(memberName: String, member: FamilyMember): Boolean {
    val payload = buildJsonObject {
      putJsonObject(memberName) {
        put("name", member.name)
        put("pingRequested", true)
      }
    }
    return try {
      val response = client.patch(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      response.status.value in 200..299
    } catch (e: Exception) {
      false
    }
  }

  suspend fun deleteMember(memberName: String): Boolean {
    val payload = buildJsonObject {
      put(memberName, JsonPrimitive(null as String?))
    }
    return try {
      val response = client.patch(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      response.status.value in 200..299
    } catch (e: Exception) {
      false
    }
  }

  suspend fun submitFeedback(
    title: String,
    body: String,
    label: String
  ): String? {
    return try {
      val payload = buildJsonObject {
        put("type", "feedback")
        put("title", "[Feedback] $title")
        put("body", body)
        putJsonArray("labels") {
          add(JsonPrimitive(label))
        }
      }
      val response = client.post(MANTLE_DB_URL) {
        contentType(ContentType.Application.Json)
        header("X-Mantle-Key", MANTLE_KEY)
        setBody(payload)
      }
      if (response.status.value in 200..299) {
        val resBody = response.bodyAsText()
        val resJson = Json.parseToJsonElement(resBody).jsonObject
        resJson["html_url"]?.jsonPrimitive?.content
      } else {
        null
      }
    } catch (e: Exception) {
      System.err.println("[ApiClient] Failed to submit feedback: " + e.message)
      null
    }
  }
}
