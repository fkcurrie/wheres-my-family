import * as Cellular from 'expo-cellular';
import NetInfo from '@react-native-community/netinfo';
import { MANTLE_DB_URL, MANTLE_KEY } from './MantleDB';

export interface NetworkTelemetry {
  networkType: 'wifi' | 'cellular' | 'none' | 'unknown';
  networkGen?: string; // "5G", "4G", "3G", "2G", "LTE", etc.
  wifiSSID?: string; // Wi-Fi network name
  wifiStrength?: number; // 0-100
  latencyMs: number; // Round-trip ping latency
  connectionBars: number; // 1 to 4 bars representation
}

/**
 * Perform a micro-ping to the MantleDB endpoint to measure real-world network latency.
 * Uses AbortController with a 2-second timeout to prevent stalling thread execution.
 */
export const measurePingLatency = async (): Promise<number> => {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    await fetch(MANTLE_DB_URL, {
      method: 'GET',
      headers: { 'X-Mantle-Key': MANTLE_KEY },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return Date.now() - start;
  } catch {
    return 9999; // Fallback high latency on network timeout or packet loss
  }
};

/**
 * Aggregate real-time network conditions (bars, network gen, Wi-Fi SSID) from cellular and NetInfo.
 */
export const getNetworkTelemetry = async (): Promise<NetworkTelemetry> => {
  const telemetry: NetworkTelemetry = {
    networkType: 'unknown',
    latencyMs: 9999,
    connectionBars: 1,
  };

  try {
    // 1. Fetch current network interface details
    const netState = await NetInfo.fetch();
    telemetry.networkType = (netState.type as any) || 'unknown';

    // 2. Fetch latency round-trip time
    const latency = await measurePingLatency();
    telemetry.latencyMs = latency;

    if (netState.type === 'wifi') {
      // Wi-Fi Specific Telemetries
      const ssid = netState.details && (netState.details as any).ssid;
      if (ssid && ssid !== '<unknown ssid>' && ssid !== 'unknown') {
        telemetry.wifiSSID = ssid;
      }

      const strength = netState.details && (netState.details as any).strength;
      if (typeof strength === 'number' && strength >= 0) {
        telemetry.wifiStrength = strength;
        // Map Wi-Fi strength (0-100) to 1-4 bars
        if (strength >= 75) telemetry.connectionBars = 4;
        else if (strength >= 50) telemetry.connectionBars = 3;
        else if (strength >= 25) telemetry.connectionBars = 2;
        else telemetry.connectionBars = 1;
      } else {
        // Fallback to latency-based bars if strength not available
        if (latency < 150) telemetry.connectionBars = 4;
        else if (latency < 400) telemetry.connectionBars = 3;
        else if (latency < 800) telemetry.connectionBars = 2;
        else telemetry.connectionBars = 1;
      }
    } else if (netState.type === 'cellular') {
      // Cellular Specific Telemetries: retrieve network generation (5G, 4G, etc.)
      let genStr = 'LTE'; // Default fallback
      try {
        const gen = await Cellular.getCellularGenerationAsync();
        if (gen === 1 || String(gen).includes('2G')) genStr = '2G';
        else if (gen === 2 || String(gen).includes('3G')) genStr = '3G';
        else if (gen === 3 || String(gen).includes('4G')) genStr = '4G';
        else if (gen === 4 || String(gen).includes('5G')) genStr = '5G';
      } catch {
        // Suppress and fallback to 'LTE'
      }
      telemetry.networkGen = genStr;

      // Map latency round-trip to 1-4 bars
      if (latency < 150) telemetry.connectionBars = 4;
      else if (latency < 400) telemetry.connectionBars = 3;
      else if (latency < 800) telemetry.connectionBars = 2;
      else telemetry.connectionBars = 1;
    } else {
      telemetry.networkType = 'none';
      telemetry.connectionBars = 1;
    }
  } catch (err) {
    console.warn('[Network telemetry] Failed aggregating network details:', err);
  }

  return telemetry;
};
