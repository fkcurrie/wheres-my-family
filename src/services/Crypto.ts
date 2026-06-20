/**
 * Lightweight, Zero-Dependency Symmetric Cryptography Helper (XOR + Hex)
 * Provides client-side privacy for data residency compliance in Canada/Switzerland.
 */

const DEFAULT_FAMILY_KEY = 'WheresMyFamilySecureKey2026';

const xorEncryptDecrypt = (input: string, key: string): string => {
  let output = '';
  for (let i = 0; i < input.length; i++) {
    const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    output += String.fromCharCode(charCode);
  }
  return output;
};

/**
 * Encrypt a string to a hex-encoded cipher text
 */
export const encryptString = (plaintext: string, key: string = DEFAULT_FAMILY_KEY): string => {
  if (!plaintext) return '';
  const xor = xorEncryptDecrypt(plaintext, key);
  let hex = '';
  for (let i = 0; i < xor.length; i++) {
    const h = xor.charCodeAt(i).toString(16);
    hex += h.length < 2 ? '0' + h : h;
  }
  return hex;
};

/**
 * Decrypt a hex-encoded cipher text back to plain text
 */
export const decryptString = (hex: string, key: string = DEFAULT_FAMILY_KEY): string => {
  if (!hex) return '';
  let xor = '';
  for (let i = 0; i < hex.length; i += 2) {
    const charCode = parseInt(hex.substring(i, i + 2), 16);
    if (!isNaN(charCode)) {
      xor += String.fromCharCode(charCode);
    }
  }
  return xorEncryptDecrypt(xor, key);
};

/**
 * Encrypt any JSON-serializable value (number, object, array, etc.) to Hex
 */
export const encryptValue = (value: any, key: string = DEFAULT_FAMILY_KEY): string => {
  const str = JSON.stringify(value);
  return encryptString(str, key);
};

/**
 * Decrypt a Hex-encoded JSON-serialized string back to its original value
 */
export const decryptValue = <T = any>(hex: string, key: string = DEFAULT_FAMILY_KEY): T | null => {
  try {
    const decryptedStr = decryptString(hex, key);
    if (!decryptedStr) return null;
    return JSON.parse(decryptedStr) as T;
  } catch (e) {
    console.warn('[Crypto] Failed to decrypt value:', e);
    return null;
  }
};
