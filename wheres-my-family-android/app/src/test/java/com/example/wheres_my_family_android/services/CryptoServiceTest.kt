package com.example.wheres_my_family_android.services

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CryptoServiceTest {

  @Test
  fun testEncryptionAndDecryptionStandard() {
    val plaintext = "Hello, this is a native location update!"
    val passphrase = "CustomFamilySuperSecretKey123"

    // Encrypt
    val ciphertext = CryptoService.encryptString(plaintext, passphrase)
    assertNotEquals(plaintext, ciphertext)
    assertTrue(ciphertext.isNotEmpty())

    // Decrypt
    val decrypted = CryptoService.decryptString(ciphertext, passphrase)
    assertEquals(plaintext, decrypted)
  }

  @Test
  fun testDecryptionWithDefaultKey() {
    val plaintext = "Coordinates are -43.6532, 79.3832"
    val ciphertext = CryptoService.encryptString(plaintext) // uses default key
    val decrypted = CryptoService.decryptString(ciphertext)  // uses default key
    assertEquals(plaintext, decrypted)
  }

  @Test
  fun testLegacyXorDecryptionParity() {
    // Legacy plaintext: "MyPlaintextString"
    // Key: "WheresMyFamilySecureKey2026"
    // Standard JS-equivalent XOR-Hex output representation of encrypting "MyPlaintextString" with key
    val legacyPlaintext = "MyPlaintextString"
    val activeKey = "WheresMyFamilySecureKey2026"

    val encryptedXor = CryptoService.legacyXorEncryptDecrypt(legacyPlaintext, activeKey)
    
    // Convert to Hex (simulating JS output representation)
    val hexString = encryptedXor.map { String.format("%02x", it.code) }.joinToString("")
    
    // Decrypt standard CryptoService decrypter (it should detect hex and run legacy fallback)
    val decrypted = CryptoService.decryptString(hexString, activeKey)
    assertEquals(legacyPlaintext, decrypted)
  }
}
