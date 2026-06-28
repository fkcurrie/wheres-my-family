package com.example.wheres_my_family_android.services

import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Standard-compliant cryptographic service matching CryptoJS AES-256-CBC passphrase-based
 * encryption scheme with OpenSSL KDF key derivation.
 */
object CryptoService {

  private const val DEFAULT_FAMILY_KEY = "WheresMyFamilySecureKey2026"
  private val SALT_HEADER = "Salted__".toByteArray(StandardCharsets.US_ASCII)

  /**
   * Helper to perform standard legacy XOR-hex decryption (for smooth upgrade rollouts/fallback)
   */
  fun legacyXorEncryptDecrypt(input: String, key: String): String {
    val output = StringBuilder()
    for (i in input.indices) {
      val inputChar = input[i].code
      val keyChar = key[i % key.length].code
      val xorChar = inputChar xor keyChar
      output.append(xorChar.toChar())
    }
    return output.toString()
  }

  /**
   * Derives key and IV using OpenSSL EVP_BytesToKey algorithm.
   */
  private fun evpBytesToKey(
    passphrase: ByteArray,
    salt: ByteArray,
    keySize: Int,
    ivSize: Int
  ): Pair<ByteArray, ByteArray> {
    val md = MessageDigest.getInstance("MD5")
    val keyAndIv = ByteArray(keySize + ivSize)
    var currentOffset = 0
    var d: ByteArray? = null

    while (currentOffset < keyAndIv.size) {
      md.reset()
      if (d != null) {
        md.update(d)
      }
      md.update(passphrase)
      md.update(salt)
      d = md.digest()
      val lengthToCopy = minOf(d.size, keyAndIv.size - currentOffset)
      System.arraycopy(d, 0, keyAndIv, currentOffset, lengthToCopy)
      currentOffset += lengthToCopy
    }

    val key = ByteArray(keySize)
    val iv = ByteArray(ivSize)
    System.arraycopy(keyAndIv, 0, key, 0, keySize)
    System.arraycopy(keyAndIv, keySize, iv, 0, ivSize)
    return Pair(key, iv)
  }

  /**
   * Encrypt a plaintext string into a CryptoJS-compatible base64 string.
   */
  fun encryptString(plaintext: String, passphraseString: String = DEFAULT_FAMILY_KEY): String {
    if (plaintext.isEmpty()) return ""
    try {
      // 1. Generate 8-byte random salt
      val salt = ByteArray(8)
      SecureRandom().nextBytes(salt)

      // 2. Derive Key (32 bytes) and IV (16 bytes)
      val passphraseBytes = passphraseString.toByteArray(StandardCharsets.UTF_8)
      val (key, iv) = evpBytesToKey(passphraseBytes, salt, 32, 16)

      // 3. Encrypt via AES-CBC-PKCS5Padding
      val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
      val secretKeySpec = SecretKeySpec(key, "AES")
      val ivParameterSpec = IvParameterSpec(iv)
      cipher.init(Cipher.ENCRYPT_MODE, secretKeySpec, ivParameterSpec)
      val encryptedBytes = cipher.doFinal(plaintext.toByteArray(StandardCharsets.UTF_8))

      // 4. Concatenate Salted__ + Salt + Encrypted Bytes
      val saltedPayload = ByteArray(SALT_HEADER.size + salt.size + encryptedBytes.size)
      System.arraycopy(SALT_HEADER, 0, saltedPayload, 0, SALT_HEADER.size)
      System.arraycopy(salt, 0, saltedPayload, SALT_HEADER.size, salt.size)
      System.arraycopy(encryptedBytes, 0, saltedPayload, SALT_HEADER.size + salt.size, encryptedBytes.size)

      // 5. Base64 Encode
      return Base64.encodeToString(saltedPayload, Base64.NO_WRAP)
    } catch (e: Exception) {
      System.err.println("[CryptoService] Encryption failed: " + e.message)
      return ""
    }
  }

  /**
   * Decrypt a CryptoJS-compatible base64 ciphertext string.
   */
  fun decryptString(ciphertext: String, passphraseString: String = DEFAULT_FAMILY_KEY): String {
    if (ciphertext.isEmpty()) return ""
    try {
      val decodedPayload = Base64.decode(ciphertext, Base64.DEFAULT)

      // Verify that payload is large enough and starts with "Salted__"
      if (decodedPayload.size >= 16 && startsWith(decodedPayload, SALT_HEADER)) {
        val salt = ByteArray(8)
        System.arraycopy(decodedPayload, SALT_HEADER.size, salt, 0, 8)

        val encryptedBytesSize = decodedPayload.size - SALT_HEADER.size - 8
        val encryptedBytes = ByteArray(encryptedBytesSize)
        System.arraycopy(decodedPayload, SALT_HEADER.size + 8, encryptedBytes, 0, encryptedBytesSize)

        // Derive Key & IV
        val passphraseBytes = passphraseString.toByteArray(StandardCharsets.UTF_8)
        val (key, iv) = evpBytesToKey(passphraseBytes, salt, 32, 16)

        // Decrypt via AES-CBC-PKCS5Padding
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        val secretKeySpec = SecretKeySpec(key, "AES")
        val ivParameterSpec = IvParameterSpec(iv)
        cipher.init(Cipher.DECRYPT_MODE, secretKeySpec, ivParameterSpec)
        val decryptedBytes = cipher.doFinal(encryptedBytes)

        return String(decryptedBytes, StandardCharsets.UTF_8)
      }
    } catch (e: Exception) {
      // Suppress and fall through to legacy XOR-Hex fallback
    }

    // Fallback: Legacy XOR-Hex Decryption
    try {
      val isHex = ciphertext.length % 2 == 0 && ciphertext.all { it.isDigit() || it in 'a'..'f' || it in 'A'..'F' }
      if (isHex) {
        val xorPlaintext = StringBuilder()
        for (i in 0 until ciphertext.length step 2) {
          val charCode = ciphertext.substring(i, i + 2).toInt(16)
          xorPlaintext.append(charCode.toChar())
        }
        return legacyXorEncryptDecrypt(xorPlaintext.toString(), passphraseString)
      }
    } catch (e: Exception) {
      System.err.println("[CryptoService] Legacy fallback decryption failed: " + e.message)
    }

    return ""
  }

  private fun startsWith(array: ByteArray, prefix: ByteArray): Boolean {
    if (array.size < prefix.size) return false
    for (i in prefix.indices) {
      if (array[i] != prefix[i]) return false
    }
    return true
  }
}
