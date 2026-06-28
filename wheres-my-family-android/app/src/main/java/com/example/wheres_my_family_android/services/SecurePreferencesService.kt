package com.example.wheres_my_family_android.services

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.example.wheres_my_family_android.data.TrailPoint
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

/**
 * High-security Preferences Service utilizing Android Keystore-backed EncryptedSharedPreferences
 * to securely store custom family keys and server settings.
 */
class SecurePreferencesService(context: Context) {

  private val sharedPreferences: SharedPreferences

  init {
    // 1. Generate or retrieve Master Key from Android Keystore
    val masterKey = MasterKey.Builder(context)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()

    // 2. Initialize EncryptedSharedPreferences
    sharedPreferences = EncryptedSharedPreferences.create(
      context,
      "secure_family_prefs",
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
  }

  /**
   * Save the custom family encryption key securely.
   */
  fun saveCustomFamilyKey(key: String) {
    sharedPreferences.edit().putString(KEY_CUSTOM_FAMILY_KEY, key.trim()).apply()
  }

  /**
   * Get the custom family key. Defaults to empty string.
   */
  fun getCustomFamilyKey(): String {
    return sharedPreferences.getString(KEY_CUSTOM_FAMILY_KEY, "") ?: ""
  }

  /**
   * Clear the custom family key.
   */
  fun clearCustomFamilyKey() {
    sharedPreferences.edit().remove(KEY_CUSTOM_FAMILY_KEY).apply()
  }

  /**
   * Save the user's name (e.g. "Dad").
   */
  fun saveUserName(name: String) {
    sharedPreferences.edit().putString(KEY_USER_NAME, name.trim()).apply()
  }

  /**
   * Get the user's name.
   */
  fun getUserName(): String {
    return sharedPreferences.getString(KEY_USER_NAME, "") ?: ""
  }

  /**
   * Save local trail history
   */
  fun saveLocalTrail(trail: List<TrailPoint>) {
    try {
      val jsonStr = Json.encodeToString(trail)
      sharedPreferences.edit().putString(KEY_LOCAL_TRAIL, jsonStr).apply()
    } catch (e: Exception) {
      System.err.println("[SecurePreferences] Error saving trail: ${e.message}")
    }
  }

  /**
   * Get local trail history
   */
  fun getLocalTrail(): List<TrailPoint> {
    val jsonStr = sharedPreferences.getString(KEY_LOCAL_TRAIL, "") ?: ""
    if (jsonStr.isEmpty()) return emptyList()
    return try {
      Json.decodeFromString(jsonStr)
    } catch (e: Exception) {
      emptyList()
    }
  }

  /**
   * Interval configs
   */
  fun saveStandardInterval(interval: Long) {
    sharedPreferences.edit().putLong(KEY_STANDARD_INTERVAL, interval).apply()
  }

  fun getStandardInterval(): Long {
    return sharedPreferences.getLong(KEY_STANDARD_INTERVAL, 30000L)
  }

  fun saveFastInterval(interval: Long) {
    sharedPreferences.edit().putLong(KEY_FAST_INTERVAL, interval).apply()
  }

  fun getFastInterval(): Long {
    return sharedPreferences.getLong(KEY_FAST_INTERVAL, 5000L)
  }

  /**
   * Save the emergency SMS contacts list (comma-separated).
   */
  fun saveEmergencyContacts(contacts: String) {
    sharedPreferences.edit().putString(KEY_EMERGENCY_CONTACTS, contacts.trim()).apply()
  }

  /**
   * Get the emergency SMS contacts list.
   */
  fun getEmergencyContacts(): String {
    return sharedPreferences.getString(KEY_EMERGENCY_CONTACTS, "") ?: ""
  }

  companion object {
    private const val KEY_CUSTOM_FAMILY_KEY = "custom_family_key"
    private const val KEY_USER_NAME = "user_name"
    private const val KEY_LOCAL_TRAIL = "local_trail"
    private const val KEY_STANDARD_INTERVAL = "standard_interval"
    private const val KEY_FAST_INTERVAL = "fast_interval"
    private const val KEY_EMERGENCY_CONTACTS = "family_recipient_numbers"
  }
}
