import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const MANTLE_DB_URL =
  'https://northamerica-northeast2-wheres-my-family-499822.cloudfunctions.net/locations';
const MANTLE_KEY = '923929d093087ca919a1823d2d53b06950f645a7db06813fad0e0e2d623c018b';

const LOG_LIMIT = 80;
const DEBOUNCE_DELAY_MS = 10000; // 10 seconds debounce

let logsBuffer: string[] = [];
let isLoaded = false;
let flushTimeout: NodeJS.Timeout | null = null;

// Initialize and load logs from disk into in-memory buffer
const ensureLoaded = async (): Promise<string[]> => {
  if (isLoaded) {
    return logsBuffer;
  }
  try {
    const raw = await AsyncStorage.getItem('diagnostic_logs');
    if (raw) {
      logsBuffer = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[Logger] Error loading diagnostic logs from disk:', e);
  } finally {
    isLoaded = true;
  }
  return logsBuffer;
};

// Immediate disk flush
const flushLogsToDisk = async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  try {
    await AsyncStorage.setItem('diagnostic_logs', JSON.stringify(logsBuffer));
    console.log('[Logger] Flushed diagnostic logs to disk successfully.');
  } catch (e) {
    console.warn('[Logger] Error flushing diagnostic logs to disk:', e);
  }
};

/**
 * Asynchronously forward sanitized diagnostic logs to the GCP Cloud Logging Proxy.
 * Enforces Zero-Knowledge Privacy rules (scrubs plaintext coordinates).
 */
const dispatchRemoteLog = async (msg: string) => {
  try {
    // 1. Load the active display name to attribute the log entry
    let savedName = 'UnknownDevice';
    try {
      savedName = (await AsyncStorage.getItem('user_name')) || 'UnknownDevice';
    } catch {
      // Gracefully fall back, allowing the dispatch of the log to succeed
    }

    // 2. Classify log severity automatically based on message keywords
    let severity = 'INFO';
    const lowerMsg = msg.toLowerCase();
    if (
      lowerMsg.includes('error') ||
      lowerMsg.includes('failed') ||
      lowerMsg.includes('exception')
    ) {
      severity = 'ERROR';
    } else if (lowerMsg.includes('warn')) {
      severity = 'WARNING';
    }

    // 3. ZERO-KNOWLEDGE PRIVACY ENFORCEMENT:
    // Automatically mask GPS coordinates (regex matches coordinate decimals like 43.1234 or -79.1234)
    // to strictly prevent leakage of plaintext coordinates into serverless database logging.
    const sanitizedMsg = msg.replace(/-?\d+\.\d+/g, '[COORDS_MASKED]');

    // 4. Securely post the log entry to the backend function
    // Use .catch() with no throwing/further logging to guarantee no recursion loops
    fetch(MANTLE_DB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Mantle-Key': MANTLE_KEY,
      },
      body: JSON.stringify({
        type: 'log',
        deviceName: savedName,
        platform: Platform.OS,
        severity,
        message: sanitizedMsg,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {
      // Fail silently to prevent recursive crash/logging loops
    });
  } catch {
    // Fail silently
  }
};

export const addDiagnosticLog = async (msg: string) => {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const formatted = `[${timestamp}] ${msg}`;
  console.log(formatted);

  // Trigger centralized Cloud Logging dispatch asynchronously
  dispatchRemoteLog(msg);

  // Ensure buffer is loaded
  await ensureLoaded();

  // Prepend to buffer (latest first)
  logsBuffer.unshift(formatted);
  if (logsBuffer.length > LOG_LIMIT) {
    logsBuffer = logsBuffer.slice(0, LOG_LIMIT);
  }

  // Schedule/debounce disk flush to avoid physical disk I/O bottlenecks
  if (flushTimeout) {
    clearTimeout(flushTimeout);
  }
  flushTimeout = setTimeout(() => {
    flushLogsToDisk();
  }, DEBOUNCE_DELAY_MS);
};

export const getDiagnosticLogs = async (): Promise<string[]> => {
  return await ensureLoaded();
};

export const clearDiagnosticLogs = async () => {
  if (flushTimeout) {
    clearTimeout(flushTimeout);
    flushTimeout = null;
  }
  logsBuffer = [];
  isLoaded = true;
  try {
    await AsyncStorage.setItem('diagnostic_logs', JSON.stringify([]));
    console.log('[Logger] Cleared diagnostic logs on disk.');
  } catch (e) {
    console.warn('[Logger] Error clearing diagnostic logs on disk:', e);
  }
};
