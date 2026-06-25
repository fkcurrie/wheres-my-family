import { encryptString, decryptString } from './Crypto';

/**
 * Packages current location, battery, and status into a compact, E2EE SMS payload.
 * Expected format: latitude,longitude,battery,timestamp(sec),status
 * This string is encrypted using the active family E2EE key and prefixed with WMF-SOS:
 * Fits comfortably within standard 160-char SMS limit (~60-90 chars total).
 */
export const packageLocationToSMS = (
  latitude: number,
  longitude: number,
  battery: number,
  status: string = 'SOS',
  key?: string
): string => {
  const timestampSec = Math.floor(Date.now() / 1000);
  const cleanStatus = status.replace(/,/g, ' '); // ensure no comma conflict
  const rawPayload = `${latitude},${longitude},${battery},${timestampSec},${cleanStatus}`;

  const ciphertext = encryptString(rawPayload, key);
  return `WMF-SOS:${ciphertext}`;
};

/**
 * Decrypts and parses a WMF-SOS SMS payload back into structured location metadata.
 * Returns null if the payload is invalid or decryption fails.
 */
export const parseSMSToLocation = (
  smsText: string,
  key?: string
): {
  latitude: number;
  longitude: number;
  battery: number;
  updatedAt: number;
  status: string;
} | null => {
  const trimmed = smsText.trim();
  if (!trimmed.startsWith('WMF-SOS:')) {
    return null;
  }

  const ciphertext = trimmed.substring('WMF-SOS:'.length);
  if (!ciphertext) {
    return null;
  }

  const decrypted = decryptString(ciphertext, key);
  if (!decrypted) {
    return null;
  }

  try {
    const parts = decrypted.split(',');
    if (parts.length < 4) {
      return null;
    }

    const latitude = parseFloat(parts[0]);
    const longitude = parseFloat(parts[1]);
    const battery = parseInt(parts[2], 10);
    const timestampSec = parseInt(parts[3], 10);
    const status = parts.slice(4).join(',') || 'SOS';

    if (isNaN(latitude) || isNaN(longitude) || isNaN(battery) || isNaN(timestampSec)) {
      return null;
    }

    return {
      latitude,
      longitude,
      battery,
      updatedAt: timestampSec * 1000, // convert back to ms timestamp
      status,
    };
  } catch (err) {
    console.warn('[SMSPackager] Failed parsing decrypted SMS payload:', err);
    return null;
  }
};
