package com.example.wheres_my_family_android.services

import java.lang.Exception

data class ParsedSMSPayload(
    val latitude: Double,
    val longitude: Double,
    val battery: Int,
    val updatedAt: Long,
    val status: String
)

object SmsPackager {

    /**
     * Packages current location, battery, and status into a compact, E2EE SMS payload.
     * Expected format: latitude,longitude,battery,timestamp(sec),status
     */
    fun packageLocationToSMS(
        latitude: Double,
        longitude: Double,
        battery: Int,
        status: String = "SOS",
        key: String = ""
    ): String {
        val timestampSec = System.currentTimeMillis() / 1000
        val cleanStatus = status.replace(",", " ") // ensure no comma conflict
        val rawPayload = "$latitude,$longitude,$battery,$timestampSec,$cleanStatus"

        val ciphertext = CryptoService.encryptString(rawPayload, key.ifEmpty { "WheresMyFamilySecureKey2026" })
        return "WMF-SOS:$ciphertext"
    }

    /**
     * Decrypts and parses a WMF-SOS SMS payload back into structured location metadata.
     * Returns null if the payload is invalid or decryption fails.
     */
    fun parseSMSToLocation(
        smsText: String,
        key: String = ""
    ): ParsedSMSPayload? {
        val trimmed = smsText.trim()
        if (!trimmed.startsWith("WMF-SOS:")) {
            return null
        }

        val ciphertext = trimmed.substring("WMF-SOS:".length)
        if (ciphertext.isEmpty()) {
            return null
        }

        val decrypted = CryptoService.decryptString(ciphertext, key.ifEmpty { "WheresMyFamilySecureKey2026" })
        if (decrypted.isEmpty()) {
            return null
        }

        return try {
            val parts = decrypted.split(",")
            if (parts.size < 4) {
                return null
            }

            val latitude = parts[0].toDoubleOrNull() ?: return null
            val longitude = parts[1].toDoubleOrNull() ?: return null
            val battery = parts[2].toIntOrNull() ?: return null
            val timestampSec = parts[3].toLongOrNull() ?: return null
            val status = parts.drop(4).joinToString(",")

            ParsedSMSPayload(
                latitude = latitude,
                longitude = longitude,
                battery = battery,
                updatedAt = timestampSec * 1000, // convert back to ms timestamp
                status = status.ifEmpty { "SOS" }
            )
        } catch (e: Exception) {
            System.err.println("[SmsPackager] Failed parsing decrypted SMS payload: ${e.message}")
            null
        }
    }
}
