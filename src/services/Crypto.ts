import CryptoJS from 'crypto-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_FAMILY_KEY = 'WheresMyFamilySecureKey2026';
let cachedFamilyKey: string | null = null;

/**
 * Load the user-configured custom family key from AsyncStorage on startup.
 */
export const loadCustomFamilyKey = async (): Promise<string> => {
  try {
    const savedKey = await AsyncStorage.getItem('custom_family_key');
    if (savedKey) {
      cachedFamilyKey = savedKey;
      return savedKey;
    }
  } catch (err) {
    console.warn('[Crypto] Error loading custom family key:', err);
  }
  return DEFAULT_FAMILY_KEY;
};

/**
 * Set and persist a custom family key to achieve complete cryptographic privacy.
 */
export const setCustomFamilyKey = async (key: string): Promise<void> => {
  try {
    const trimmed = key.trim();
    if (trimmed) {
      await AsyncStorage.setItem('custom_family_key', trimmed);
      cachedFamilyKey = trimmed;
    } else {
      await AsyncStorage.removeItem('custom_family_key');
      cachedFamilyKey = null;
    }
  } catch (err) {
    console.warn('[Crypto] Error setting custom family key:', err);
  }
};

/**
 * Get the currently active family encryption key.
 */
export const getActiveFamilyKey = (): string => {
  return cachedFamilyKey || DEFAULT_FAMILY_KEY;
};

/**
 * Legacy XOR cryptography helper (used exclusively for backward-compatibility fallback decryption).
 */
const legacyXorEncryptDecrypt = (input: string, key: string): string => {
  let output = '';
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output += String.fromCharCode(charCode);
  }
  return output;
};

/**
 * Encrypt a string to an AES-256-CBC base64-encoded ciphertext.
 */
export const encryptString = (plaintext: string, key?: string): string => {
  if (!plaintext) return '';
  const activeKey = key || getActiveFamilyKey();
  try {
    return CryptoJS.AES.encrypt(plaintext, activeKey).toString();
  } catch (err) {
    console.error('[Crypto] AES Encryption failed, returning empty string:', err);
    return '';
  }
};

/**
 * Decrypt an AES-256-CBC (or legacy XOR-hex fallback) string back to plaintext.
 */
export const decryptString = (ciphertext: string, key?: string): string => {
  if (!ciphertext) return '';
  const activeKey = key || getActiveFamilyKey();

  // 1. Try standard AES Decryption first
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, activeKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (decrypted) {
      return decrypted;
    }
  } catch (err) {
    // Suppress and fall through to legacy XOR fallback
  }

  // 2. Legacy Fallback: Try XOR-Hex decryption (for smooth upgrade rollouts)
  try {
    const isHex = ciphertext.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(ciphertext);
    if (isHex) {
      let xorPlaintext = '';
      for (let i = 0; i < ciphertext.length; i += 2) {
        const charCode = parseInt(ciphertext.substring(i, i + 2), 16);
        if (!isNaN(charCode)) {
          xorPlaintext += String.fromCharCode(charCode);
        }
      }
      return legacyXorEncryptDecrypt(xorPlaintext, activeKey);
    }
  } catch (err) {
    console.warn('[Crypto] Legacy fallback decryption failed:', err);
  }

  return '';
};

/**
 * Encrypt any JSON-serializable value (number, object, array, etc.) to an AES-256 ciphertext.
 */
export const encryptValue = (value: any, key?: string): string => {
  const str = JSON.stringify(value);
  return encryptString(str, key);
};

/**
 * Decrypt an AES-256 (or legacy XOR fallback) ciphertext back to its original JSON-serializable type.
 */
export const decryptValue = <T = any>(ciphertext: string, key?: string): T | null => {
  try {
    const decryptedStr = decryptString(ciphertext, key);
    if (!decryptedStr) return null;
    return JSON.parse(decryptedStr) as T;
  } catch (err) {
    console.warn('[Crypto] Failed parsing decrypted JSON value:', err);
    return null;
  }
};
