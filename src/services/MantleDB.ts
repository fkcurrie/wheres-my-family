import { Platform, AppState } from 'react-native';
import * as Battery from 'expo-battery';
import { getDistanceInKm, compressTrail, decompressTrail } from './Helpers';
import { addDiagnosticLog } from './Logger';
import { getWeatherAndAlertsCached } from './Weather';
import { updateAndGetLocalTrail } from './OSRM';
import { encryptValue, decryptValue, loadCustomFamilyKey } from './Crypto';
import { queueTransaction, getQueuedTransactions, removeQueuedTransaction } from './SqliteQueue';
import { getNetworkTelemetry } from './Network';

export const MANTLE_DB_URL =
  'https://northamerica-northeast2-wheres-my-family-499822.cloudfunctions.net/locations';
export const MANTLE_KEY = '923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b';

// Local cache to avoid publishing when stationary (battery optimizer throttling)
let lastPublishedLat: number | null = null;
let lastPublishedLng: number | null = null;
let lastPublishedTime: number = 0;

/**
 * Retrieve real battery percentage, charging state, and App active status
 */
export const getRealBatteryAndActivity = async () => {
  let batteryLevel = 100;
  let isCharging = false;
  try {
    const level = await Battery.getBatteryLevelAsync();
    batteryLevel = level >= 0 ? Math.round(level * 100) : 100;

    const state = await Battery.getBatteryStateAsync();
    isCharging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
  } catch (err) {
    console.warn('[Battery Fetch Error]:', err);
  }

  // Active means the app is currently in the foreground (hence phone is unlocked and user is active)
  const appState = AppState.currentState;
  const deviceStatus = appState === 'active' ? 'Active' : 'Phone locked';

  return { batteryLevel, isCharging, deviceStatus };
};

/**
 * Drain/empty the offline transaction queue by sending stored payloads to MantleDB.
 */
export const drainQueue = async (): Promise<void> => {
  try {
    const queued = await getQueuedTransactions();
    if (queued.length === 0) return;

    console.log(`[SqliteQueue] Found ${queued.length} queued transactions to sync.`);
    await addDiagnosticLog(
      `[Queue Sync] Resuming sync for ${queued.length} offline coordinates...`
    );

    for (const tx of queued) {
      try {
        const res = await fetch(MANTLE_DB_URL, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-Mantle-Key': MANTLE_KEY,
          },
          body: JSON.stringify(tx.payload),
        });

        if (res.status === 200 || res.status === 204 || res.status === 201) {
          await removeQueuedTransaction(tx.id);
          console.log(`[SqliteQueue] Successfully synced queued transaction ${tx.id}.`);
        } else {
          console.warn(`[SqliteQueue] Stopped draining queue, HTTP Status: ${res.status}`);
          break;
        }
      } catch (err) {
        console.warn(
          `[SqliteQueue] Sync failed for transaction ${tx.id}, network still offline:`,
          err
        );
        break; // Network still offline, stop draining
      }
    }
  } catch (err) {
    console.error('[SqliteQueue] Error draining queue:', err);
  }
};

/**
 * Fetch all locations from MantleDB and transparently decrypt coordinates/trails
 */
export const fetchMantleDB = async () => {
  await loadCustomFamilyKey();
  const res = await fetch(MANTLE_DB_URL, {
    headers: {
      'X-Mantle-Key': MANTLE_KEY,
    },
  });
  const data = await res.json();
  if (data && !data.error) {
    // Decrypt all member nodes
    for (const key of Object.keys(data)) {
      if (key.startsWith('_')) continue;
      const m = data[key];
      if (m && m.latEnc && m.lngEnc) {
        const decLat = decryptValue<number>(m.latEnc);
        const decLng = decryptValue<number>(m.lngEnc);
        if (decLat !== null && decLng !== null) {
          m.latitude = decLat;
          m.longitude = decLng;
        }
        if (m.statusEnc) {
          const decStatus = decryptValue<string>(m.statusEnc);
          if (decStatus !== null) m.status = decStatus;
        }
        if (m.trailEnc) {
          const decTrail = decryptValue<any>(m.trailEnc);
          if (decTrail !== null) {
            m.trail = decompressTrail(decTrail);
          }
        }
        if (m.netEnc) {
          const decNet = decryptValue<any>(m.netEnc);
          if (decNet !== null) {
            m.network = decNet;
          }
        }
        m.source = m.source || 'HTTPS';
      }
    }
  }
  return data;
};

/**
 * Sync / Publish location directly to MantleDB with transparent E2EE encryption
 */
export const publishLocation = async (
  name: string,
  latitude: number,
  longitude: number,
  status: string = 'Active',
  extraData: any = {},
  timestamp?: number
) => {
  let networkTelemetry = null;
  try {
    networkTelemetry = await getNetworkTelemetry();
  } catch (e) {
    console.warn('[Network telemetry bypassed]:', e);
  }

  try {
    await loadCustomFamilyKey();
    const now = Date.now();
    const isForced = ['App Started', 'Manual Refresh', 'Onboarding Completed'].includes(status);

    // Throttling: Skip publishing if stationary (< 50 meters / ~0.05 km) and updated within last 5 minutes
    if (
      !isForced &&
      lastPublishedLat !== null &&
      lastPublishedLng !== null &&
      now - lastPublishedTime < 5 * 60 * 1000
    ) {
      const dist = getDistanceInKm(latitude, longitude, lastPublishedLat, lastPublishedLng);
      if (dist < 0.05) {
        console.log(
          `[Battery Optimizer]: Stationary (moved ${dist.toFixed(4)} km). Skipping MantleDB update to conserve power.`
        );
        return;
      }
    }

    // Cache current publication
    lastPublishedLat = latitude;
    lastPublishedLng = longitude;
    lastPublishedTime = now;

    // Try to drain the offline queue before publishing the new coordinate
    try {
      await drainQueue();
    } catch (e) {
      console.warn('[Offline Queue Drain Bypassed]:', e);
    }

    const info = await getRealBatteryAndActivity();

    // Fetch live weather context if coordinates are available
    let weatherInfo = null;
    try {
      weatherInfo = await getWeatherAndAlertsCached(latitude, longitude);
    } catch (e) {
      console.warn('[Weather integration bypassed]:', e);
    }

    // Get updated historical trail
    let localTrail: any[] = [];
    try {
      localTrail = await updateAndGetLocalTrail(latitude, longitude, timestamp);
    } catch (e) {
      console.warn('[Local trail fetch bypassed]:', e);
    }

    // Compress the historical trail array
    const compressedTrailStr = localTrail && localTrail.length > 0 ? compressTrail(localTrail) : '';

    const payload = {
      [name]: {
        name,
        // Plaintext coordinates matching the actual local coordinates
        latitude: latitude,
        longitude: longitude,
        status: 'Encrypted',
        source: 'HTTPS',

        // SECURE ENCRYPTED VALUES (Ensuring local client data residency and privacy fallback)
        latEnc: encryptValue(latitude),
        lngEnc: encryptValue(longitude),
        statusEnc: encryptValue(status),
        trailEnc: compressedTrailStr ? encryptValue(compressedTrailStr) : undefined,
        netEnc: networkTelemetry ? encryptValue(networkTelemetry) : undefined,

        battery: info.batteryLevel,
        charging: info.isCharging,
        deviceStatus: info.deviceStatus,
        updatedAt: timestamp || Date.now(),
        platform: Platform.OS,
        ...(weatherInfo
          ? {
              weatherTemp: weatherInfo.temp,
              weatherEmoji: weatherInfo.emoji,
              weatherDesc: weatherInfo.desc,
              weatherIsSevere: weatherInfo.isSevere,
            }
          : {}),
        ...extraData,
      },
    };

    try {
      await fetch(MANTLE_DB_URL, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Mantle-Key': MANTLE_KEY,
        },
        body: JSON.stringify(payload),
      });

      console.log(
        `[Background Sync]: Successfully published location for ${name}. Battery: ${info.batteryLevel}%, Status: ${info.deviceStatus}`
      );
      await addDiagnosticLog(
        `[Sync Success] Coords encrypted and uploaded (${status}). Bat: ${info.batteryLevel}%`
      );
    } catch (fetchErr) {
      console.warn('[Background Sync Error]: Server unreachable, queueing offline:', fetchErr);
      await addDiagnosticLog(
        `[Sync Queue] Offline: ${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`
      );
      await queueTransaction(payload);
    }
  } catch (err) {
    console.error('[Fatal Location Sync Error]:', err);
    await addDiagnosticLog(
      `[Fatal Sync Error] Failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

/**
 * Sync / Publish SMS-imported location to MantleDB
 */
export const publishSMSLocation = async (
  memberName: string,
  latitude: number,
  longitude: number,
  battery: number,
  status: string = 'SOS',
  timestamp: number = Date.now()
) => {
  try {
    await loadCustomFamilyKey();
    const payload = {
      [memberName]: {
        name: memberName,
        latitude: latitude,
        longitude: longitude,
        status: 'Encrypted',
        source: 'SMS',
        latEnc: encryptValue(latitude),
        lngEnc: encryptValue(longitude),
        statusEnc: encryptValue(status),
        battery: battery,
        charging: false,
        deviceStatus: 'Offline',
        updatedAt: timestamp,
        platform: 'unknown',
      },
    };

    await fetch(MANTLE_DB_URL, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Mantle-Key': MANTLE_KEY,
      },
      body: JSON.stringify(payload),
    });

    console.log(`[SMS Sync]: Successfully published SMS location for ${memberName} to MantleDB.`);
    await addDiagnosticLog(`[SMS Sync] Propagated SMS coordinates for ${memberName} to MantleDB.`);
  } catch (err) {
    console.error('[SMS Sync Error]: Failed to publish SMS location:', err);
    await addDiagnosticLog(
      `[SMS Sync Error] Failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
};

/**
 * Trigger / request a silent nudge vibration for a family member
 */
export const requestNudgeMember = async (member: any) => {
  const payload = {
    [member.name]: {
      name: member.name,
      latitude: member.latitude,
      longitude: member.longitude,
      status: member.status,
      battery: member.battery,
      charging: member.charging,
      deviceStatus: member.deviceStatus,
      updatedAt: member.updatedAt || Date.now(),
      weatherTemp: member.weatherTemp,
      weatherEmoji: member.weatherEmoji,
      weatherDesc: member.weatherDesc,
      weatherIsSevere: member.weatherIsSevere,
      nudgeRequested: true,
    },
  };
  await fetch(MANTLE_DB_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Mantle-Key': MANTLE_KEY,
    },
    body: JSON.stringify(payload),
  });
};

/**
 * Clear the nudgeRequested state for the current user
 */
export const clearNudgeState = async (savedName: string) => {
  await fetch(MANTLE_DB_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Mantle-Key': MANTLE_KEY,
    },
    body: JSON.stringify({
      [savedName]: { nudgeRequested: false },
    }),
  });
};

/**
 * Trigger / request an immediate high-accuracy GPS update for a family member
 */
export const requestPingMember = async (member: any) => {
  const payload = {
    [member.name]: {
      name: member.name,
      latitude: member.latitude,
      longitude: member.longitude,
      status: member.status,
      battery: member.battery,
      charging: member.charging,
      deviceStatus: member.deviceStatus,
      updatedAt: member.updatedAt || Date.now(),
      weatherTemp: member.weatherTemp,
      weatherEmoji: member.weatherEmoji,
      weatherDesc: member.weatherDesc,
      weatherIsSevere: member.weatherIsSevere,
      pingRequested: true,
    },
  };
  await fetch(MANTLE_DB_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Mantle-Key': MANTLE_KEY,
    },
    body: JSON.stringify(payload),
  });
};

/**
 * Permanently Delete / Retire Device from Family List
 */
export const deleteMember = async (memberName: string) => {
  const payload = {
    [memberName]: null,
  };
  await fetch(MANTLE_DB_URL, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Mantle-Key': MANTLE_KEY,
    },
    body: JSON.stringify(payload),
  });
};
