package com.example.wheres_my_family_android.services

import com.example.wheres_my_family_android.data.FamilyMember
import io.ktor.client.HttpClient
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.header
import io.ktor.client.request.get
import io.ktor.client.request.patch
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
        
        val lat = CryptoService.decryptString(latEnc, familyKey).toDoubleOrNull() ?: 46.8182
        val lng = CryptoService.decryptString(lngEnc, familyKey).toDoubleOrNull() ?: 8.2275
        val status = CryptoService.decryptString(statusEnc, familyKey)
        val battery = mObj["battery"]?.jsonPrimitive?.int ?: 100
        val charging = mObj["charging"]?.jsonPrimitive?.boolean ?: false
        val deviceStatus = mObj["deviceStatus"]?.jsonPrimitive?.content ?: "Active"
        val updatedAt = mObj["updatedAt"]?.jsonPrimitive?.long ?: 0L
        val platform = mObj["platform"]?.jsonPrimitive?.content ?: "unknown"

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
          platform = platform
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
    status: String = "Active",
    battery: Int = 100,
    charging: Boolean = false,
    deviceStatus: String = "Active",
    platform: String = "android",
    extraData: Map<String, JsonPrimitive> = emptyMap()
  ): Boolean {
    val payload = buildJsonObject {
      putJsonObject(name) {
        put("name", name)
        put("latitude", 46.8182) // Switzerland obfuscation
        put("longitude", 8.2275)
        put("status", "Encrypted")
        put("source", "HTTPS")
        put("latEnc", CryptoService.encryptString(latitude.toString()))
        put("lngEnc", CryptoService.encryptString(longitude.toString()))
        put("statusEnc", CryptoService.encryptString(status))
        put("battery", battery)
        put("charging", charging)
        put("deviceStatus", deviceStatus)
        put("updatedAt", System.currentTimeMillis())
        put("platform", platform)
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
}
