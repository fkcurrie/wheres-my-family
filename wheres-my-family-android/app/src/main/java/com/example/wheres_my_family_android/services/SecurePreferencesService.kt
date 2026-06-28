package com.example.wheres_my_family_android.services

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

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

  companion object {
    private const val KEY_CUSTOM_FAMILY_KEY = "custom_family_key"
    private const val KEY_USER_NAME = "user_name"
  }
}
